# Crazzy Runnerr — project guide (for Claude Code)

3-lane endless runner (Subway-Surfers-style) rendered in the browser. Goal: launch
publicly on the web and monetize (shop, coin-bought + real-money characters, coin packs).

**Read `docs/PROJECT-STATUS.md` first** — it has the current state, open bugs, and next steps.
Architecture/spec lives in `crazy-runnerr-PRD.md` and `docs/character-asset-architecture.md`.

## Stack
- React 19 + Vite + TypeScript (strict)
- React Three Fiber v9 + Three.js + @react-three/drei (3D)
- Zustand (state), Tailwind v4 (HUD/menus)
- Supabase (auth + Postgres + RLS + Storage) — backend
- gltf-transform + fbx2gltf + sharp — offline character asset pipeline

## Run
```bash
npm install
cp .env.example .env.local   # then fill in Supabase URL + anon key (see below)
npm run dev                  # http://localhost:5173
npm run build                # tsc -b && vite build
npm run lint                 # oxlint
```

## Environment (.env.local — gitignored, recreate per machine)
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — from Supabase → Settings → API. The
  anon key is public/safe in the client. Without these the game runs in guest-only mode.
- `SUPABASE_SERVICE_ROLE_KEY` — secret; used ONLY by local scripts (asset upload). Never
  ship it to the client. The project's Supabase ref is `aralsgqeqyqufojrzcaj`.

## Key architecture rules (don't break these)
- **Client is untrusted.** Coins/ownership change only via server (RPCs / Stripe webhook),
  never trusted from the client. Coin balance = sum of an append-only `coin_ledger`.
- **Per-frame gameplay uses refs, not React state** (`world`, `player` singletons mutated in
  `useFrame`). React state only for discrete events (score tick, phase, coin collected).
- **Collisions use logical hitboxes**, never the visual mesh — art stays decoupled.
- **Characters are catalog-driven** (Supabase `characters` table → `model_url`, etc.). Adding a
  character = upload assets + insert a row; no code change (unless it needs a new ability).
- **Guest mode**: the core loop is playable without an account; login adds persistence + shop.

## Layout
- `src/game/` — logic/state: `store.ts` (phase/score), `world.ts`/`playerState.ts` (runtime
  singletons), `auth.ts`, `characterStore.ts`, `ability.ts`, `progress.ts`, `config.ts`.
- `src/scene/` — R3F: `GameCanvas`, `Player`, `ObstacleField`, `Track`, `Environment`, `GameLoop`.
- `src/ui/` — DOM overlays: `StartScreen`, `Hud`, `CharacterSelect`, `AuthModal`, etc.
- `supabase/migrations/` + `seed.sql` — schema (run in order in the SQL editor).
- `scripts/` — `build-character.mjs` (raw FBX/GLB → game-ready glb), `upload-character.mjs`
  (push built assets to Supabase Storage; needs SERVICE_ROLE key).

## Conventions
- Commit/push only when asked.
- Don't commit secrets or heavy assets (`.env*`, `characters/`, `dist-characters/` are ignored).
