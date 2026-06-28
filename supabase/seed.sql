-- ===========================================================================
-- Crazzy Runnerr — catalog seed (run AFTER 0001_init.sql + 0002_character_assets.sql)
-- ---------------------------------------------------------------------------
-- The characters catalog is server-owned. Safe to re-run (upserts by id).
--   - runner : free starter everyone owns (still uses the local placeholder glb)
--   - rookie : first real character (Supabase Storage glb), buyable with coins
-- The earlier magneto/phantom placeholders are retired below.
-- Replace <REF> if the project ref ever changes.
-- ===========================================================================

-- Retire the placeholder example characters (no one owns them in practice).
delete from public.characters where id in ('magneto', 'phantom');

insert into public.characters
  (id, name, description, ability_id, currency, price_coins, price_cents,
   rarity, model_url, thumbnail_url, model_scale, sort_order)
values
  ('runner', 'Runner', 'The original. Reliable and ready to roll.',
     null, 'free', 0, 0, 'common',
     '/models/player.glb', null, 1.0, 0),

  ('rookie', 'Rookie', 'Rookie Runner — eager, fresh, and ready to chase a high score.',
     null, 'coins', 2000, 0, 'common',
     'https://aralsgqeqyqufojrzcaj.supabase.co/storage/v1/object/public/character-assets/characters/rookie/model.glb',
     'https://aralsgqeqyqufojrzcaj.supabase.co/storage/v1/object/public/character-assets/characters/rookie/thumb.webp',
     1.0, 1)
on conflict (id) do update set
  name          = excluded.name,
  description   = excluded.description,
  ability_id    = excluded.ability_id,
  currency      = excluded.currency,
  price_coins   = excluded.price_coins,
  price_cents   = excluded.price_cents,
  rarity        = excluded.rarity,
  model_url     = excluded.model_url,
  thumbnail_url = excluded.thumbnail_url,
  model_scale   = excluded.model_scale,
  sort_order    = excluded.sort_order;
