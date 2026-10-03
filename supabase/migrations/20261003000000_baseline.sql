-- Crazy Runnerr — baseline schema (public), exported from the live project
-- with pg_dump 17 on 2026-10-03. Recreates every table, view, function, RLS
-- policy and grant the game relies on, plus the auth.users signup trigger.
--
-- Platform-managed objects are deliberately omitted (they exist in every
-- Supabase project): the public schema itself, rls_auto_enable(), and
-- supabase_admin default privileges.
--
-- Apply to an EMPTY project only. Future changes go in NEW migration files.

--
-- PostgreSQL database dump
--

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.7

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: pg_database_owner
--

ALTER SCHEMA public OWNER TO pg_database_owner;

--
-- Name: currency_kind; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.currency_kind AS ENUM (
    'free',
    'coins',
    'money'
);

ALTER TYPE public.currency_kind OWNER TO postgres;

--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  -- email lives in auth.users (managed by Supabase). We copy only the name the
  -- user gave at signup (passed as auth metadata) into our profile.
  insert into public.profiles (id, display_name)
    values (new.id, new.raw_user_meta_data->>'display_name');
  insert into public.user_characters (user_id, character_id, source)
    select new.id, id, 'free' from public.characters where currency = 'free' and is_active;
  return new;
end;
$$;

ALTER FUNCTION public.handle_new_user() OWNER TO postgres;

--
-- Name: purchase_character_with_coins(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.purchase_character_with_coins(p_character_id text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_user  uuid := auth.uid();
  v_price integer;
  v_curr  public.currency_kind;
  v_bal   integer;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  select price_coins, currency into v_price, v_curr
  from public.characters where id = p_character_id and is_active;
  if not found then raise exception 'no such character'; end if;
  if v_curr <> 'coins' then raise exception 'character not purchasable with coins'; end if;

  if exists (select 1 from public.user_characters where user_id = v_user and character_id = p_character_id) then
    raise exception 'already owned';
  end if;

  select coalesce(sum(delta),0) into v_bal from public.coin_ledger where user_id = v_user;
  if v_bal < v_price then raise exception 'insufficient coins'; end if;

  insert into public.coin_ledger (user_id, delta, reason, ref)
    values (v_user, -v_price, 'buy_character', p_character_id);
  insert into public.user_characters (user_id, character_id, source)
    values (v_user, p_character_id, 'coins');
end;
$$;

ALTER FUNCTION public.purchase_character_with_coins(p_character_id text) OWNER TO postgres;

--
-- Name: record_run(integer, integer, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.record_run(p_distance integer, p_coins integer, p_character_id text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_user   uuid := auth.uid();
  v_coins  integer;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  -- plausibility clamp: coins can't exceed a fraction of distance (tune later).
  v_coins := greatest(0, least(coalesce(p_coins,0), ceil(coalesce(p_distance,0) / 5.0)::int));

  insert into public.runs (user_id, distance, coins_collected, character_id)
    values (v_user, greatest(0, coalesce(p_distance,0)), v_coins, p_character_id);
  if v_coins > 0 then
    insert into public.coin_ledger (user_id, delta, reason, ref)
      values (v_user, v_coins, 'run_reward', null);
  end if;
  update public.profiles
    set best_distance = greatest(best_distance, greatest(0, coalesce(p_distance,0))),
        updated_at = now()
    where id = v_user;
end;
$$;

ALTER FUNCTION public.record_run(p_distance integer, p_coins integer, p_character_id text) OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: characters; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.characters (
    id text NOT NULL,
    name text NOT NULL,
    description text,
    ability_id text,
    currency public.currency_kind NOT NULL,
    price_coins integer DEFAULT 0 NOT NULL,
    price_cents integer DEFAULT 0 NOT NULL,
    rarity text DEFAULT 'common'::text NOT NULL,
    model_url text,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    thumbnail_url text,
    model_scale numeric DEFAULT 1 NOT NULL,
    model_offset_y numeric DEFAULT 0 NOT NULL
);

ALTER TABLE public.characters OWNER TO postgres;

--
-- Name: coin_ledger; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.coin_ledger (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    delta integer NOT NULL,
    reason text NOT NULL,
    ref text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.coin_ledger OWNER TO postgres;

--
-- Name: coin_balances; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.coin_balances WITH (security_invoker='on') AS
 SELECT user_id,
    (COALESCE(sum(delta), (0)::bigint))::integer AS balance
   FROM public.coin_ledger
  GROUP BY user_id;

ALTER VIEW public.coin_balances OWNER TO postgres;

--
-- Name: coin_ledger_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.coin_ledger ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.coin_ledger_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: profiles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    display_name text,
    best_distance integer DEFAULT 0 NOT NULL,
    active_character_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.profiles OWNER TO postgres;

--
-- Name: purchases; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.purchases (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    provider text DEFAULT 'stripe'::text NOT NULL,
    provider_ref text NOT NULL,
    product_type text NOT NULL,
    product_ref text NOT NULL,
    amount_cents integer NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.purchases OWNER TO postgres;

--
-- Name: purchases_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.purchases ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.purchases_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: runs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.runs (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    distance integer NOT NULL,
    coins_collected integer DEFAULT 0 NOT NULL,
    character_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.runs OWNER TO postgres;

--
-- Name: runs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.runs ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.runs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: user_characters; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_characters (
    user_id uuid NOT NULL,
    character_id text NOT NULL,
    source text NOT NULL,
    acquired_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.user_characters OWNER TO postgres;

--
-- Name: characters characters_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.characters
    ADD CONSTRAINT characters_pkey PRIMARY KEY (id);

--
-- Name: coin_ledger coin_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.coin_ledger
    ADD CONSTRAINT coin_ledger_pkey PRIMARY KEY (id);

--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);

--
-- Name: purchases purchases_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_pkey PRIMARY KEY (id);

--
-- Name: purchases purchases_provider_provider_ref_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_provider_provider_ref_key UNIQUE (provider, provider_ref);

--
-- Name: runs runs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.runs
    ADD CONSTRAINT runs_pkey PRIMARY KEY (id);

--
-- Name: user_characters user_characters_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_characters
    ADD CONSTRAINT user_characters_pkey PRIMARY KEY (user_id, character_id);

--
-- Name: coin_ledger_user_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX coin_ledger_user_id_idx ON public.coin_ledger USING btree (user_id);

--
-- Name: runs_user_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX runs_user_id_idx ON public.runs USING btree (user_id);

--
-- Name: coin_ledger coin_ledger_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.coin_ledger
    ADD CONSTRAINT coin_ledger_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

--
-- Name: profiles profiles_active_character_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_active_character_id_fkey FOREIGN KEY (active_character_id) REFERENCES public.characters(id);

--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

--
-- Name: purchases purchases_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

--
-- Name: runs runs_character_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.runs
    ADD CONSTRAINT runs_character_id_fkey FOREIGN KEY (character_id) REFERENCES public.characters(id);

--
-- Name: runs runs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.runs
    ADD CONSTRAINT runs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

--
-- Name: user_characters user_characters_character_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_characters
    ADD CONSTRAINT user_characters_character_id_fkey FOREIGN KEY (character_id) REFERENCES public.characters(id);

--
-- Name: user_characters user_characters_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_characters
    ADD CONSTRAINT user_characters_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

--
-- Name: characters; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;

--
-- Name: characters characters public read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "characters public read" ON public.characters FOR SELECT USING (true);

--
-- Name: coin_ledger; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.coin_ledger ENABLE ROW LEVEL SECURITY;

--
-- Name: coin_ledger coin_ledger self read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "coin_ledger self read" ON public.coin_ledger FOR SELECT USING ((auth.uid() = user_id));

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles self read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "profiles self read" ON public.profiles FOR SELECT USING ((auth.uid() = id));

--
-- Name: profiles profiles self update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "profiles self update" ON public.profiles FOR UPDATE USING ((auth.uid() = id));

--
-- Name: purchases; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;

--
-- Name: purchases purchases self read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "purchases self read" ON public.purchases FOR SELECT USING ((auth.uid() = user_id));

--
-- Name: runs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.runs ENABLE ROW LEVEL SECURITY;

--
-- Name: runs runs self read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "runs self read" ON public.runs FOR SELECT USING ((auth.uid() = user_id));

--
-- Name: user_characters; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.user_characters ENABLE ROW LEVEL SECURITY;

--
-- Name: user_characters user_characters self read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "user_characters self read" ON public.user_characters FOR SELECT USING ((auth.uid() = user_id));

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;

--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.handle_new_user() TO anon;
GRANT ALL ON FUNCTION public.handle_new_user() TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;

--
-- Name: FUNCTION purchase_character_with_coins(p_character_id text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.purchase_character_with_coins(p_character_id text) TO anon;
GRANT ALL ON FUNCTION public.purchase_character_with_coins(p_character_id text) TO authenticated;
GRANT ALL ON FUNCTION public.purchase_character_with_coins(p_character_id text) TO service_role;

--
-- Name: FUNCTION record_run(p_distance integer, p_coins integer, p_character_id text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.record_run(p_distance integer, p_coins integer, p_character_id text) TO anon;
GRANT ALL ON FUNCTION public.record_run(p_distance integer, p_coins integer, p_character_id text) TO authenticated;
GRANT ALL ON FUNCTION public.record_run(p_distance integer, p_coins integer, p_character_id text) TO service_role;

--
-- Name: TABLE characters; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.characters TO anon;
GRANT ALL ON TABLE public.characters TO authenticated;
GRANT ALL ON TABLE public.characters TO service_role;

--
-- Name: TABLE coin_ledger; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.coin_ledger TO anon;
GRANT ALL ON TABLE public.coin_ledger TO authenticated;
GRANT ALL ON TABLE public.coin_ledger TO service_role;

--
-- Name: TABLE coin_balances; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.coin_balances TO anon;
GRANT ALL ON TABLE public.coin_balances TO authenticated;
GRANT ALL ON TABLE public.coin_balances TO service_role;

--
-- Name: SEQUENCE coin_ledger_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.coin_ledger_id_seq TO anon;
GRANT ALL ON SEQUENCE public.coin_ledger_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.coin_ledger_id_seq TO service_role;

--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;

--
-- Name: TABLE purchases; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.purchases TO anon;
GRANT ALL ON TABLE public.purchases TO authenticated;
GRANT ALL ON TABLE public.purchases TO service_role;

--
-- Name: SEQUENCE purchases_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.purchases_id_seq TO anon;
GRANT ALL ON SEQUENCE public.purchases_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.purchases_id_seq TO service_role;

--
-- Name: TABLE runs; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.runs TO anon;
GRANT ALL ON TABLE public.runs TO authenticated;
GRANT ALL ON TABLE public.runs TO service_role;

--
-- Name: SEQUENCE runs_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.runs_id_seq TO anon;
GRANT ALL ON SEQUENCE public.runs_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.runs_id_seq TO service_role;

--
-- Name: TABLE user_characters; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.user_characters TO anon;
GRANT ALL ON TABLE public.user_characters TO authenticated;
GRANT ALL ON TABLE public.user_characters TO service_role;

--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;

--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;

--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;

--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

--
-- PostgreSQL database dump complete
--

--
-- Signup trigger (lives on auth.users, so pg_dump --schema=public omits it).
-- Creates the profile row + grants free characters for every new account.
--

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
