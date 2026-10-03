# Crazy Runnerr

A 3D endless lane-runner for the browser. Switch between three lanes, jump over
barriers, slide under bars, and collect coins as the speed climbs. Play
instantly as a guest, or sign in to save progress to the cloud and unlock
characters.

Built with React 19, Three.js (React Three Fiber + drei), Zustand, Tailwind CSS
and Vite. Supabase provides accounts and the backend.

## Setup

Requires **Node 24+**.

```sh
npm install
cp .env.example .env.local   # optional — fill in Supabase URL + anon key
npm run dev
```

Without Supabase credentials the game runs in guest-only mode (progress in
localStorage).

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Lint with oxlint |
| `npm test` | Run unit tests once (Vitest) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run typecheck` | Type-check only |

## Dev tools (development builds only)

| Tool | How |
|---|---|
| Debug mode (tuning panel, FPS, perf stats) | Add `?debug` to the URL, or press `` ` `` |
| Pre-enable god mode / hitboxes | `?debug=god,hitboxes` |
| Start a run automatically | `?autoplay` |
| Inspect live state in the console | `window.__game` (`world`, `player`, `store`) |

Tuning-panel changes persist across reloads. Use **Copy as config** to paste
tuned values into `src/game/config.ts`, then **Reset to defaults**.

None of these ship in production builds.

## Project structure

```
src/
  game/      gameplay logic + state (pure, unit-tested; no rendering)
    debug/   dev-only tuning panel and debug flags
  scene/     3D world inside the React Three Fiber <Canvas>
  ui/        DOM overlays: menus, HUD, modals
  lib/       Supabase client
supabase/    backend config and schema migrations
public/      static assets (models, favicon)
```

Per-frame state (`world`, `player`, abilities) lives in mutable singletons
updated inside `useFrame`, never in React state. Zustand stores hold
event-level state (game phase, auth, characters). All gameplay tuning values
are in `src/game/config.ts`.
