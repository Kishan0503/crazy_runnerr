-- Phase 4A: raise the record_run coin plausibility cap for the 2× Coins pickup.
--
-- Coins are now worth 2 while "2× Coins" is active, so an honest run can bank
-- more coins per metre than before. Measured spawner density is ~0.2–0.29
-- coins/m placed; with 2× active over a large share of a late run a perfect
-- collector approaches ~0.4 coins/m. The old cap (distance / 5 = 0.2/m) would
-- silently clamp honest players, so it becomes distance / 2 (0.5/m), which
-- still keeps a large margin against forged results.
--
-- Same signature, so existing GRANTs on the function are kept.
-- Apply on DEV first (Supabase SQL Editor), test a run, then on LIVE.

CREATE OR REPLACE FUNCTION public.record_run(p_distance integer, p_coins integer, p_character_id text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_user   uuid := auth.uid();
  v_coins  integer;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  -- plausibility clamp: at most one coin per 2 m (2× Coins pickup included).
  v_coins := greatest(0, least(coalesce(p_coins,0), ceil(coalesce(p_distance,0) / 2.0)::int));

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
