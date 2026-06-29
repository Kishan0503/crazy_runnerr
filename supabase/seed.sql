insert into public.characters
  (id, name, description, ability_id, currency, price_coins, price_cents,
   rarity, model_url, thumbnail_url, model_scale, sort_order)
values
  ('inferno', 'Inferno', 'Forged in fire and clad in molten armor — every stride leaves the track scorched.',
     null, 'coins', 50000, 0, 'premium',
     'https://aralsgqeqyqufojrzcaj.supabase.co/storage/v1/object/public/character-assets/characters/inferno/model.glb',
     'https://aralsgqeqyqufojrzcaj.supabase.co/storage/v1/object/public/character-assets/characters/inferno/thumb.webp',
     1.0, 6)
on conflict (id) do update set
  name=excluded.name, description=excluded.description, ability_id=excluded.ability_id,
  currency=excluded.currency, price_coins=excluded.price_coins, price_cents=excluded.price_cents,
  rarity=excluded.rarity, model_url=excluded.model_url, thumbnail_url=excluded.thumbnail_url,
  model_scale=excluded.model_scale, sort_order=excluded.sort_order;
