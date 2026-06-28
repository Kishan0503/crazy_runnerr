-- ===========================================================================
-- Crazzy Runnerr — character asset columns (run AFTER 0001_init.sql)
-- ---------------------------------------------------------------------------
-- Adds the per-character display data the runtime needs so the client never
-- hardcodes paths/sizes: a thumbnail for the picker strip, and model fit values.
-- See docs/character-asset-architecture.md (Phase 2).
-- ===========================================================================

alter table public.characters
  add column if not exists thumbnail_url  text,                       -- picker strip image
  add column if not exists model_scale    numeric not null default 1, -- uniform scale to fit
  add column if not exists model_offset_y numeric not null default 0; -- fine ground nudge
