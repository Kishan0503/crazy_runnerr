# Character Asset Architecture — Implementation Plan

**Status:** Approved design, ready to implement
**Goal:** A clean, scalable, production-ready system for many characters (6–7+), where each character has its own model + 5 animations, and **adding a new character requires no code changes or redeploy** — just uploading assets and inserting a catalog row.

## Decisions (locked)

| Question | Decision |
|---|---|
| Where assets live | **Supabase Storage** (public bucket `character-assets`), URL-driven via the catalog |
| Asset format | **One `.glb` per character** with mesh + all 5 clips baked in (`idle`, `run`, `jump`, `slide`, `turn180`). **Drop FBX entirely.** |
| Loading | **Lazy**: load only the equipped character for gameplay; **thumbnails** in the picker; rely on `useGLTF` URL cache |
| Gameplay coupling | Stays decoupled — collisions use logical hitboxes, never the mesh |
| Per-character tuning | Lives in the **catalog as data** (scale/offset/thumbnail/ability), not in code |

### Standard conventions every character `.glb` MUST follow
- Single skinned mesh, Y-up, **faces −Z** (down the track), **origin at the feet** (y=0 on the ground).
- Animation clips named **exactly**: `idle`, `run`, `jump`, `slide`, `turn180`.
- Real-world-ish scale (~1.4 units tall after the catalog `model_scale`); fine-tune via `model_scale`.
- Draco or meshopt compressed; ≤ ~20k tris; 1–2 materials.

---

## Phase 0 — Character creation workflow (asset production, no Blender)

Decided pipeline: **AI generator for the textured model + Mixamo for rig & animations.**
This removes the only step that can't be automated from code (painting textures from
reference images) by having the model arrive already textured, and gives every
character the same `mixamorig` skeleton so animation clips bind with no retargeting.

**User side, per character:**
1. **Model:** AI generator (Meshy / Tripo / Rodin / Luma) → a **textured GLB** of a
   humanoid in **T/A-pose**, single connected mesh, clear silhouette. Regenerate if
   topology is messy; poly count is optimized later.
2. **Rig + animate:** mixamo.com (free) →
   - Upload Character → auto-rig.
   - Download rigged character: **FBX, T-pose, WITH Skin** (carries mesh + skeleton + textures).
   - Download 5 animations — Idle, Running, Running Jump, Running Slide, Running Turn 180 —
     as **FBX, WITHOUT Skin**, 30 fps, no keyframe reduction.
   - Include any separate texture image files Mixamo provides.
3. **Deliver:** the with-skin rigged FBX + the 5 animation FBX + reference images
   (front/back/side, for visual verification only).

**Agent side (Phase 3 pipeline):** combine into one optimized GLB with the 5 standard
clips, textures intact, feet at origin, facing −Z, compressed.

**Known risk:** baking FBX → one textured GLB offline (Mixamo only exports FBX) is
non-trivial — planned approach is three.js `FBXLoader` + `GLTFExporter` headless, then
`@gltf-transform` to optimize. **Build & prove this on character #1**, then reuse.

---

## Phase 1 — Supabase Storage setup (dashboard, ~5 min)

1. Supabase dashboard → **Storage** → **New bucket**.
   - Name: `character-assets`
   - **Public bucket: ON** (premium gating comes later via signed URLs — see Phase 8).
2. Create the folder layout by uploading the first character (Phase 5) into:
   ```
   character-assets/
     characters/
       runner/   model.glb   thumb.webp
       magneto/  model.glb   thumb.webp
       ...
   ```
3. Public URL format (what goes in the catalog):
   ```
   https://<project-ref>.supabase.co/storage/v1/object/public/character-assets/characters/runner/model.glb
   ```

**Acceptance:** bucket exists, a test file is reachable at its public URL in a browser.

---

## Phase 2 — Catalog schema additions (SQL migration `0002`)

Add the per-character data the runtime needs so no code hardcodes anything.

```sql
-- supabase/migrations/0002_character_assets.sql
alter table public.characters
  add column if not exists thumbnail_url text,         -- picker preview image
  add column if not exists model_scale   numeric not null default 1,  -- uniform scale
  add column if not exists model_offset_y numeric not null default 0; -- fine ground nudge
```

Then update existing rows (and the seed) with real Storage URLs + scale. Example:
```sql
update public.characters
set model_url    = 'https://<ref>.supabase.co/storage/v1/object/public/character-assets/characters/runner/model.glb',
    thumbnail_url= 'https://<ref>.supabase.co/storage/v1/object/public/character-assets/characters/runner/thumb.webp',
    model_scale  = 0.72
where id = 'runner';
```

Update [supabase/seed.sql](../supabase/seed.sql) to include the new columns for future fresh setups.

**Acceptance:** `select id, model_url, thumbnail_url, model_scale from characters` returns full URLs.

---

## Phase 3 — Offline asset pipeline (`scripts/build-character.mjs`)

A Node script (uses `@gltf-transform/*`, already a dependency) that turns raw art into a standardized, compressed character `.glb` + thumbnail. Runtime never does this work.

**Inputs (local, not committed):** a mesh glb/fbx + the 5 animation FBXs (Mixamo) for one character.

**Steps the script performs:**
1. Load the mesh; load each animation; extract its clip.
2. Rename clips to the standard names (`idle`, `run`, `jump`, `slide`, `turn180`).
3. Merge mesh + all 5 clips into one glb (bind by `mixamorig*` bone names — same-skeleton clips bind with no retargeting; we verified this works).
4. Drop the model's origin to the feet (y=0); apply any orientation fix (face −Z).
5. Compress (Draco or meshopt).
6. Emit `dist-characters/<id>/model.glb`.
7. (Optional) render/crop a `thumb.webp` — or author thumbnails by hand.

**Usage:**
```bash
node scripts/build-character.mjs --id magneto \
  --mesh ./raw/magneto/mesh.glb \
  --idle ./raw/magneto/idle.fbx \
  --run ./raw/magneto/run.fbx \
  --jump ./raw/magneto/jump.fbx \
  --slide ./raw/magneto/slide.fbx \
  --turn ./raw/magneto/turn180.fbx
# → dist-characters/magneto/model.glb  (then upload to Storage)
```

Add `dist-characters/` and `raw/` to `.gitignore` (heavy, not committed).

**Acceptance:** running it on the current Runner assets produces one `model.glb` whose `animations` are exactly the 5 standard names.

---

## Phase 4 — Runtime refactor (URL-driven, lazy, no FBX)

### 4a. `src/game/characters.ts`
- Extend the `Character` type with `thumbnail_url`, `model_scale`, `model_offset_y`.
- Add to the `SELECT` string.
- Keep `cosmeticTint` as a fallback only (real models won't need tint).

### 4b. Player model loading — `src/scene/Player.tsx`
- **Remove** `useFBX` / `IDLE_FBX` / `TURN_FBX` and the runtime clip-merge. Delete the FBX files from `public/` once Runner is migrated.
- Load the **equipped character's** glb by URL:
  ```ts
  const active = useCharacterStore((s) => s.activeCharacter())
  const url = active?.model_url ?? FALLBACK_MODEL_URL
  const { scene, animations } = useGLTF(url)
  ```
- Use `model_scale` / `model_offset_y` from the catalog instead of the hardcoded `MODELS.player`.
- `matchClips` already finds `idle/run/jump/slide/turn180` by name — keep it; clips now come straight from the character glb (no merge).
- The start-screen turn-180 choreography stays the same (the `turn180` clip is now inside the glb).
- Keep the existing ground-snap + "hide until posed" logic.

### 4c. Model registry — `src/game/modelRegistry.ts`
- **Obstacles stay here** (they're fixed art). Remove the `player` entry — the player is now catalog-driven.
- Replace the eager `for (...) useGLTF.preload(entry.url)` so it preloads **only obstacles**, never all characters.

### 4d. Lazy loading + preload-on-equip — `src/game/characterStore.ts`
- Add a helper that preloads a character glb: `useGLTF.preload(url)`.
- Call it when a character is **equipped** (and optionally on picker hover) so the model is warm before the run starts. Never preload the whole roster.

### 4e. Picker = live hero preview + thumbnail strip — `src/ui/CharacterSelect.tsx`
- **Hero stage:** a single small R3F canvas showing the **selected** character's
  model playing its **idle** clip (loads that one glb on demand, plays idle). This
  is the "wow" / upsell moment.
- **Strip:** the horizontal list uses lightweight `thumbnail_url` images
  (`<img loading="lazy">`), falling back to the tinted avatar if absent. Tapping a
  thumbnail selects it → the hero stage swaps to that character.
- **Only ONE character is rendered live at a time** (the selected one), so the
  picker stays fast regardless of roster size — never render the whole roster live.

**Acceptance:** only the equipped character's glb is fetched (check Network tab); switching characters swaps the model; picker shows images without loading any glb.

---

## Phase 5 — Migrate the current Runner to the new format (reference character)

1. Run the Phase 3 script on the existing `player.glb` + `idle.fbx` + `running_turn_180.fbx` (Runner already has `run/jump/slide`; add `idle` + `turn180`) → one `runner/model.glb` with all 5 standard clips.
2. Upload `runner/model.glb` (+ a `thumb.webp`) to the Storage bucket.
3. Update the `runner` catalog row (Phase 2 SQL) with the Storage URLs + `model_scale = 0.72`.
4. Verify the game loads Runner from Storage and plays idle → turn → run correctly.
5. Once confirmed, **delete** `public/models/player.glb`, `public/idle.fbx`, `public/running_turn_180.fbx`.

**Acceptance:** the game runs entirely off the Storage-hosted Runner glb; no FBX or local player.glb remains.

---

## Phase 6 — Loading, caching & performance details

- `useGLTF` caches by URL → re-equipping a seen character is instant; no extra work needed.
- Preload **only** the equipped character (+ optional hover prefetch in the picker).
- Wrap the player model in `<Suspense>` (already done) so a swap shows nothing until ready (we already hide until posed/grounded).
- Cap concurrent loads naturally by only ever loading one player model at a time.
- Optional later: dispose the previous character's GPU resources on switch if memory grows (`useGLTF.clear(url)`); not needed at this scale.

---

## Phase 7 — Premium asset protection (later, with Stripe)

Public bucket = paid character glbs are URL-reachable by anyone. For real protection:
- Put money/premium characters in a **private** bucket.
- An **edge function** issues a short-lived **signed URL** only after checking `user_characters` ownership.
- The client requests the signed URL for premium models instead of a public URL.

Defer until the Stripe step; free/coins characters can stay in the public bucket.

---

## Phase 8 — "Add a new character" checklist (the payoff)

Once the system is in place, a new character is **zero code, zero redeploy**:

1. Produce `model.glb` via `scripts/build-character.mjs` (mesh + 5 standard clips) + a `thumb.webp`.
2. Upload both to `character-assets/characters/<id>/`.
3. Insert a catalog row:
   ```sql
   insert into characters
     (id, name, description, ability_id, currency, price_coins, price_cents,
      rarity, model_url, thumbnail_url, model_scale, sort_order)
   values
     ('ninja', 'Ninja', 'Quick and silent.', 'dash', 'coins', 2000, 0,
      'rare', '<...>/ninja/model.glb', '<...>/ninja/thumb.webp', 0.72, 3);
   ```
4. If it has a **new** ability, add one entry to `ABILITY_DEFS` in [src/game/ability.ts](../src/game/ability.ts) + the system that reacts to it. (Reusing an existing ability = still zero code.)

That's it — the character appears in the picker, is buyable/equippable, loads on demand, and plays.

---

## Implementation order (suggested PR-sized chunks)

1. **Phase 2** schema migration + seed update (no behavior change yet).
2. **Phase 3** pipeline script (offline tool).
3. **Phase 5** migrate Runner → Storage (now there's a real asset to load).
4. **Phase 4** runtime refactor to URL-driven + lazy + thumbnails (the big one).
5. **Phase 1** is a prerequisite for 5 (do the bucket first).
6. **Phase 7** later, alongside Stripe.

## Risks / notes
- All clips must share the character's own skeleton; clip names must match the standard exactly (the pipeline enforces this).
- Keep logical hitboxes fixed regardless of model size — never tie collisions to the mesh.
- Thumbnails are worth doing well; they're the entire picker experience and keep it cheap.
- Storage URLs are environment-specific (project ref) — keep them in the catalog (DB), not in code.
