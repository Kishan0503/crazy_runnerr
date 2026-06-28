-- ===========================================================================
-- Crazzy Runnerr — catalog seed (run AFTER 0001_init.sql)
-- ---------------------------------------------------------------------------
-- The characters catalog is server-owned. At minimum we need one FREE character
-- so the signup trigger (handle_new_user) has something to grant. The coins /
-- money entries are examples for the shop (build steps 4–6); tune freely.
-- Safe to re-run: upserts by id.
-- ===========================================================================

insert into public.characters
  (id, name, description, ability_id, currency, price_coins, price_cents, rarity, model_url, sort_order)
values
  ('runner', 'Runner', 'The original. Reliable and ready to roll.',
     null, 'free', 0, 0, 'common', '/models/player.glb', 0),

  ('magneto', 'Magneto', 'Pulls in nearby coins for 10s. Twice per run.',
     'magnet', 'coins', 1500, 0, 'rare', '/models/player.glb', 1),

  ('phantom', 'Phantom', 'A premium runner with a signature ability.',
     null, 'money', 0, 499, 'premium', '/models/player.glb', 2)
on conflict (id) do update set
  name        = excluded.name,
  description = excluded.description,
  ability_id  = excluded.ability_id,
  currency    = excluded.currency,
  price_coins = excluded.price_coins,
  price_cents = excluded.price_cents,
  rarity      = excluded.rarity,
  model_url   = excluded.model_url,
  sort_order  = excluded.sort_order;
