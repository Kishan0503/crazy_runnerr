# Project Status & Handoff

Snapshot of where Crazzy Runnerr is, what's done, what's broken, and what's next.
Pair this with `CLAUDE.md`, `crazy-runnerr-PRD.md`, and `docs/character-asset-architecture.md`.

## Where we are
Core endless-runner MVP is complete and polished (lanes/jump/slide, obstacles, coins,
scoring, speed tiers, neon-city art). We've added the **backend + monetization foundation**
and are mid-way through the **character system**. Currently debugging the character-select
3D preview.

## Done
- **Gameplay**: 3-lane run, jump/slide, 3 obstacle types, fairness rule, coins, distance+coin
  scoring, best-distance persistence. Speed is **distance-stepped** (1.0→2.0x over 0–2000m,
  then density ramps). Start-screen character does an idle → 180° turn → run intro.
- **Supabase backend** (project ref `aralsgqeqyqufojrzcaj`):
  - Schema: `profiles`, `characters` (catalog), `user_characters` (ownership), `coin_ledger`
    (append-only), `coin_balances` (view), `purchases`, `runs`. RLS locked down.
  - Server RPCs: `purchase_character_with_coins`, `record_run` (clamps coin reward),
    `handle_new_user` trigger (creates profile + grants free chars on signup).
  - Migrations `0001_init.sql`, `0002_character_assets.sql`, plus `seed.sql` — all applied.
- **Auth + guest mode**: email/password via Supabase (`src/game/auth.ts`), guest fallback,
  progress sync (`progress.ts`, `useAuthSync.ts`), login/signup modal (`ui/AuthModal.tsx`).
- **Character system**: catalog-driven (`characters.ts`, `characterStore.ts`); character-select
  screen with hero 3D preview + thumbnail strip (`ui/CharacterSelect.tsx`); buy-with-coins +
  equip; in-game model is the equipped character (`scene/Player.tsx`), auto-normalized to a
  standard size.
- **Ability system** (`src/game/ability.ts`): registry + Magnet (attract coins, HUD button + E
  key, charges/run). Wired in; Rookie currently has no ability.
- **Asset pipeline**: `scripts/build-character.mjs` (Mixamo FBX rig + GLB → one optimized glb
  with `idle/run/jump/slide/turn180` clips, PNG texture, root-motion stripped) and
  `scripts/upload-character.mjs` (push to Supabase Storage). Proven on the first character.
- **Characters in catalog**: `runner` (free starter, legacy `public/models/player.glb`) and
  `rookie` (coins 2000, real asset in Supabase Storage). `magneto`/`phantom` were placeholders,
  now retired.

## Open issues / in progress (debugging here when we resume)
1. **Character-select 3D preview** — the live hero preview was mis-framing/blank. Root cause:
   the fit measured the skinned bounds at the wrong time (stale bone matrices + single early
   frame during idle fade-in) and characters arrive at wildly different scales (Rookie ~0.02
   units vs Runner ~1.88). Latest fix (uncommitted-at-session-end may already be committed):
   `posedBox` now calls `skeleton.update()`, and the preview **re-fits over ~40 frames** then
   locks; in-game `Player.tsx` auto-normalizes to `GAME_TARGET_H`. A `console.info('[preview] …')`
   line logs measured height/scale. **Verify Rookie now renders in the preview and Runner stays
   centered.** If still off, read those console lines for ground truth.
2. **Rookie in-game** — not yet fully verified (equip + run/jump/slide + the 180° turn). The
   `turn180` clip rotates the hips; confirm it doesn't double-rotate with the node yaw in
   `Player.tsx` (may need to strip the clip's hip yaw in the pipeline).
3. **Texture orientation** — confirm Rookie's texture isn't V-flipped once it renders.
4. **`model_scale`** is now a fine-tune multiplier (both chars = 1); base size is auto-normalized.

## Next steps (roughly in order)
1. Finish/verify the character preview + Rookie in-game (the open issues above).
2. Decide Rookie's ability (currently none) and flesh out the ability roster.
3. Build the **Shop** (coin packs; characters already buyable in the picker).
4. **Stripe** payments (real-money characters + coin packs) via a verified webhook + edge
   function that grants entitlements server-side. Gate premium assets with signed URLs
   (private bucket) — see `docs/character-asset-architecture.md` Phase 7.
5. Add more characters via the pipeline (each: build glb → upload → catalog row).

## Resuming on a new machine
1. Clone the repo, `npm install`.
2. `cp .env.example .env.local` and fill `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`
   (Supabase → Settings → API). Add `SUPABASE_SERVICE_ROLE_KEY` only if running asset scripts.
3. `npm run dev`. Claude Code will auto-read `CLAUDE.md`; start by reading this file.
4. Raw character source assets (`characters/<Name>/…`) are NOT in git — keep them in a
   separate backup; they're needed to rebuild a character.
