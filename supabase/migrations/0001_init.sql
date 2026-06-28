-- ===========================================================================
-- Crazzy Runnerr — initial schema (DESIGN PROPOSAL, review before applying)
-- ---------------------------------------------------------------------------
-- Principles (see project memory):
--   * Client is UNTRUSTED. It may READ its own rows; it may NOT directly write
--     coins or ownership. All currency/ownership changes go through SECURITY
--     DEFINER functions (coin purchases) or the service role (real-money grants
--     via Stripe webhook). RLS enforces this at the database.
--   * Coin balance is the SUM of an append-only ledger, never a loose integer.
--   * The characters catalog is server-owned; players only read it.
-- ===========================================================================

-- Supabase ships pgcrypto (gen_random_uuid) and the auth schema already.

-- ---------------------------------------------------------------------------
-- characters: the CATALOG (data, not code). ability_id maps to an in-game
-- ability registry entry. Currency decides how it's acquired.
-- Created BEFORE profiles because profiles.active_character_id references it.
-- ---------------------------------------------------------------------------
create type public.currency_kind as enum ('free', 'coins', 'money');

create table public.characters (
  id           text primary key,                 -- slug, e.g. 'runner', 'magneto'
  name         text not null,
  description  text,
  ability_id   text,                             -- e.g. 'magnet'; null = no ability
  currency     public.currency_kind not null,    -- free | coins | money
  price_coins  integer not null default 0,       -- used when currency = 'coins'
  price_cents  integer not null default 0,       -- used when currency = 'money' (USD cents)
  rarity       text not null default 'common',   -- common | rare | premium ...
  model_url    text,                             -- /models/...glb
  sort_order   integer not null default 0,       -- ordering in the shop scroller
  is_active    boolean not null default true,    -- soft-hide without deleting
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- profiles: one row per authenticated user (mirrors auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  display_name        text,
  best_distance       integer not null default 0,        -- soft stat (plausibility-checked)
  active_character_id text   references public.characters (id), -- equipped character
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- user_characters: ownership (who owns what). Never written directly by client.
-- ---------------------------------------------------------------------------
create table public.user_characters (
  user_id      uuid not null references auth.users (id) on delete cascade,
  character_id text not null references public.characters (id),
  source       text not null,                    -- 'free' | 'coins' | 'money'
  acquired_at  timestamptz not null default now(),
  primary key (user_id, character_id)
);

-- ---------------------------------------------------------------------------
-- coin_ledger: APPEND-ONLY transactions. Balance = sum(delta). Never updated
-- or deleted. Positive = credit (run reward, coin pack), negative = debit (buy).
-- ---------------------------------------------------------------------------
create table public.coin_ledger (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  delta       integer not null,                  -- + credit / - debit
  reason      text not null,                     -- 'run_reward' | 'buy_character' | 'coin_pack' ...
  ref         text,                              -- character_id / stripe session / etc.
  created_at  timestamptz not null default now()
);
create index on public.coin_ledger (user_id);

-- Derived balance (cheap; index above keeps it fast at this scale).
create view public.coin_balances as
  select user_id, coalesce(sum(delta), 0)::integer as balance
  from public.coin_ledger
  group by user_id;

-- ---------------------------------------------------------------------------
-- purchases: real-money transactions. Written by the Stripe webhook (service
-- role) only. The grant (coins or ownership) happens in the same webhook.
-- ---------------------------------------------------------------------------
create table public.purchases (
  id                bigint generated always as identity primary key,
  user_id           uuid not null references auth.users (id) on delete cascade,
  provider          text not null default 'stripe',
  provider_ref      text not null,               -- stripe checkout session / payment intent id
  product_type      text not null,               -- 'character' | 'coin_pack'
  product_ref       text not null,               -- character_id or coin_pack id
  amount_cents      integer not null,
  status            text not null default 'pending', -- pending | paid | refunded | failed
  created_at        timestamptz not null default now(),
  unique (provider, provider_ref)                 -- idempotent webhook
);

-- ---------------------------------------------------------------------------
-- runs (OPTIONAL, can add later): per-run stats for leaderboards/analytics.
-- ---------------------------------------------------------------------------
create table public.runs (
  id              bigint generated always as identity primary key,
  user_id         uuid not null references auth.users (id) on delete cascade,
  distance        integer not null,
  coins_collected integer not null default 0,
  character_id    text references public.characters (id),
  created_at      timestamptz not null default now()
);
create index on public.runs (user_id);

-- ===========================================================================
-- Row-Level Security
-- ===========================================================================
alter table public.profiles        enable row level security;
alter table public.characters      enable row level security;
alter table public.user_characters enable row level security;
alter table public.coin_ledger     enable row level security;
alter table public.purchases       enable row level security;
alter table public.runs            enable row level security;

-- profiles: read/update only your own row.
create policy "profiles self read"   on public.profiles for select using (auth.uid() = id);
create policy "profiles self update" on public.profiles for update using (auth.uid() = id);

-- characters catalog: anyone (incl. guests/anon) can read; nobody writes via client.
create policy "characters public read" on public.characters for select using (true);

-- ownership: read your own; NO client insert/update (grants happen server-side).
create policy "user_characters self read" on public.user_characters for select using (auth.uid() = user_id);

-- coin ledger: read your own; NO client insert (credits/debits go through RPC).
create policy "coin_ledger self read" on public.coin_ledger for select using (auth.uid() = user_id);

-- purchases: read your own; written only by service role (webhook).
create policy "purchases self read" on public.purchases for select using (auth.uid() = user_id);

-- runs: read your own; insert your own through the record_run RPC (clamped).
create policy "runs self read" on public.runs for select using (auth.uid() = user_id);

-- ===========================================================================
-- Server-authoritative operations (SECURITY DEFINER = run as owner, bypass RLS
-- but enforce their OWN checks). These are the ONLY ways coins/ownership change
-- from the client side.
-- ===========================================================================

-- Buy a coin-priced character: verifies not-owned, price, and balance, then
-- writes the ledger debit + ownership row atomically.
create or replace function public.purchase_character_with_coins(p_character_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
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

-- Record a finished run: inserts the run + a CLAMPED coin reward (server decides
-- the max, so a client can't claim unlimited coins). Tune the clamp formula.
create or replace function public.record_run(p_distance integer, p_coins integer, p_character_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
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

-- On signup: auto-create the profile and grant the free character(s).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
