# Product Requirements Document — Lane Runner (3D Web Game)

**Document owner:** Kishan Panchal
**Status:** Ready for implementation
**Intended use:** This PRD is the build specification for an AI coding agent (Claude Code). It is written to be self-contained — an engineer or coding agent should be able to build the full MVP from this document alone, then swap in real 3D assets when they are ready.

---

## 1. Overview

Lane Runner is a browser-based, 3-lane endless runner in the style of Subway Surfers, but deliberately simple. The player controls a character that runs forward automatically down a 3-lane track. The world scrolls toward the player, obstacles appear ahead, and the player survives by switching lanes, jumping, and sliding to avoid them. The longer the run, the faster the track moves. The game ends on the first collision; the player can instantly retry.

The MVP must be fully playable with simple placeholder geometry **before** final 3D models exist, then visually upgraded by dropping in supplied `.glb` models without changing game logic. Collision and physics are driven by logical hitboxes, not by the visual meshes, so art and gameplay stay decoupled.

### 1.1 Vision in one line
Tap to start, read the track, switch-jump-slide to survive, and chase a longer distance each run — rendered in real-time 3D in the browser.

### 1.2 Goals
- Ship a polished, performant 3D endless runner that runs at 60 FPS on a modern laptop and a mid-range phone browser.
- Make the core loop *feel* good: responsive lane switching, satisfying jump/slide timing, fair obstacle spawning.
- Keep gameplay logic and art assets fully decoupled so models can be swapped in/out freely.
- Deploy as a static web app (Vercel-friendly).

### 1.3 Non-goals (explicitly out of scope for MVP)
- Multiplayer or any backend/server.
- User accounts, login, or cloud-saved scores (local persistence only).
- In-app purchases, ads, or monetization.
- Procedurally generated environments beyond the repeating track.
- Character selection, power-ups, missions, or daily challenges (these are listed as future enhancements, not MVP).

---

## 2. Target platforms

- **Primary:** Modern desktop browsers (Chrome, Edge, Firefox, Safari) — latest two major versions.
- **Secondary:** Mobile web (iOS Safari 16+, Android Chrome). The layout must be responsive and touch-controllable.
- **Orientation:** Portrait-first, but must not break in landscape. The 3D viewport fills the screen; HUD overlays adapt.
- **Input:** Keyboard (desktop), touch swipe (mobile), and on-screen control buttons as a fallback on touch devices.

---

## 3. Tech stack

> **Why this stack:** React + Vite is the modern standard for fast web builds and matches the developer's existing skillset. React Three Fiber (R3F) lets the 3D scene be expressed declaratively as React components while running on Three.js with zero rendering overhead, and `drei` provides ready-made helpers (model loading, cameras, performance tools). TypeScript is required because it materially improves what a coding agent can build correctly and keeps the physics/hitbox math type-safe.

| Layer | Choice | Notes |
|---|---|---|
| Language | **TypeScript** | Strict mode on. |
| Build tool | **Vite** | `npm create vite@latest` with the `react-ts` template. |
| UI framework | **React 19** | Required to pair with R3F v9 (see version rule below). |
| 3D renderer | **Three.js** (`three`, latest stable, ≥ 0.184) | WebGL renderer is sufficient for MVP; do not require WebGPU. |
| React ↔ Three bridge | **@react-three/fiber v9** | Declarative Three.js in React. |
| R3F helpers | **@react-three/drei** (v9 line, compatible with fiber v9) | `useGLTF`, `useAnimations`, `Preload`, `AdaptiveDpr`, `PerformanceMonitor`, `Stats`. |
| Types | **@types/three** (match `three` version) | |
| Game/UI state | **Zustand** | Lightweight store for meta state (game phase, score, coins, best). Per-frame state stays in refs (see §8.3). |
| Styling (HUD/menus) | **Tailwind CSS** | For overlays, HUD, menus only — not the 3D scene. |
| Audio | **Howler.js** | SFX + optional music; easy mute and pooling. |
| Model format | **glTF / GLB** (`.glb` preferred, binary, single file) | Draco/meshopt compression optional. |
| Deployment | **Vercel** (static build) | `vite build` → static `dist/`. |

### 3.1 CRITICAL version-compatibility rule (read before installing)
R3F's major version is hard-coupled to React's major version:
- **`@react-three/fiber@9` pairs with `react@19`.**
- `@react-three/fiber@8` pairs with `react@18`.
- `@react-three/drei` must be on a release that supports fiber v9 / React 19.

Mismatching these causes an `npm ERESOLVE` peer-dependency failure on install. Use React 19 + fiber 9 + a fiber-9-compatible drei together. If a transitive peer conflict appears, fix the versions rather than masking it with `--force` or `--legacy-peer-deps`.

### 3.2 Install commands (reference)
```bash
npm create vite@latest lane-runner -- --template react-ts
cd lane-runner
npm install three @react-three/fiber @react-three/drei zustand howler
npm install -D @types/three @types/howler tailwindcss @tailwindcss/vite
```
*(Use the current stable versions; do not pin to outdated majors. Verify the React/fiber pairing above after install.)*

---

## 4. Game design — core mechanics

These mechanics and tuning values were validated in an earlier 2D-camera prototype. **Treat the numbers in §7 as the starting tuning, exposed as named constants in one config file so they can be adjusted without touching logic.**

### 4.1 The track
- Three fixed lanes. Lane center X positions: `[-2.2, 0, 2.2]`. The middle lane is the start lane.
- The character stays at a fixed depth (`z = 2`). The **world moves toward the camera** (obstacles, coins, and ground detail travel in +Z and are recycled once they pass the camera). This is cheaper and simpler than moving the player through world space.
- A behind-and-above chase camera looks down the track. Fog hides the spawn distance so obstacles fade in rather than popping.

### 4.2 Player actions
| Action | Input | Behavior |
|---|---|---|
| Switch lane | ← / → (or A / D), or swipe left/right | Move one lane toward the target; X position eases (lerps) to the new lane center. Cannot move past the outer lanes. |
| Jump | ↑ / W / Space, or swipe up | Apply upward velocity; gravity pulls back down. Only when grounded and not sliding. Clears low (jump-over) obstacles. |
| Slide | ↓ / S, or swipe down | Briefly lower the character's collision height for a fixed duration, then auto-stand. Only when grounded. Clears overhead (slide-under) obstacles. |

The character runs forward automatically; the player never controls forward speed.

### 4.3 Obstacle types (three)
| Type | Required response | Logical hitbox (W×H×D), center Y | Visual model slot |
|---|---|---|---|
| **Low barrier** | Jump over | 1.6 × 0.9 × 0.8, y = 0.45 | `obstacle_low` |
| **Overhead bar** | Slide under | 1.8 × 0.5 × 0.6, y = 1.45 | `obstacle_overhead` |
| **Full block** | Switch lane (cannot jump or slide past) | 1.6 × 2.4 × 0.9, y = 1.2 | `obstacle_block` |

### 4.4 Collision rules
Collision is checked against **logical hitboxes**, not visual meshes. A collision occurs when an obstacle shares the player's lane AND overlaps in depth (`|obstacle.z − player.z| < 1.0`) AND the player's current pose does not clear it:
- **Low barrier:** hit unless the player's hitbox bottom is above the barrier top (i.e., jumping high enough).
- **Overhead bar:** hit unless the player's hitbox top is below the bar bottom (i.e., currently sliding).
- **Full block:** always a hit if in the same lane — the only escape is being in a different lane.

Any hit → immediate game over.

### 4.5 Coins (collectibles)
- Spawn as a short run of 3 coins in an open lane (no obstacle in that lane for that row).
- Collected when the player shares the lane and overlaps in depth. Collecting adds to the coin count and to the score.
- Coins gently spin for visual life.

### 4.6 Difficulty & fairness
- Speed starts at a base value and ramps up slowly over time, up to a cap.
- Obstacles spawn in **rows** at a distance-based cadence; the gap between rows tightens slightly as speed increases (down to a floor).
- **Fairness rule (mandatory):** a row must never block all three lanes. Each row blocks 1–2 lanes at most, leaving at least one passable lane. Coin runs prefer open lanes.

### 4.7 Scoring
- **Distance** increases continuously with speed (the primary score).
- **Coins** add a flat bonus per coin to the score and are also shown as a separate coin counter.
- Track a **best distance** persisted locally (see §10).

---

## 5. Game states / screens

A single state machine drives the app: `START → PLAYING → GAME_OVER → (PLAYING …)`. Optionally include `PAUSED`.

1. **Start screen** — title, short tagline, "Tap to start" button, and a compact control legend (lane / jump / slide). Starting resets all state and begins the run.
2. **Playing** — HUD visible (distance + coin counter). On touch devices, show on-screen control buttons.
3. **Paused (optional)** — pause button in HUD; freezes the loop; resume/quit.
4. **Game over** — show final distance, best distance, coins collected, and a "Tap to retry" button. Retry returns directly to Playing.

All overlays are React/Tailwind DOM layered above the WebGL canvas. The HUD must not capture pointer events that belong to the game (use `pointer-events: none` on passive HUD elements, `auto` on buttons).

---

## 6. Controls (full matrix)

| Intent | Keyboard | Touch | On-screen button |
|---|---|---|---|
| Lane left | ← or A | Swipe left | ◀ |
| Lane right | → or D | Swipe right | ▶ |
| Jump | ↑ or W or Space | Swipe up | ▲ |
| Slide | ↓ or S | Swipe down | ▼ |
| Start / Retry | Enter or Space | Tap button | — |
| Pause (optional) | Esc or P | Tap pause | ⏸ |

Swipe detection: compare touchstart vs touchend; require a minimum travel (~24px) to count as a swipe (otherwise treat as a tap); the dominant axis (|dx| vs |dy|) decides horizontal vs vertical. Prevent the page from scrolling/zooming during play (`touch-action: none`, `user-scalable=no`).

---

## 7. Tuning constants (starting values)

Put all of these in a single `src/game/config.ts`. These are the validated starting points — expose them so they can be tweaked freely.

```ts
export const CONFIG = {
  lanes: [-2.2, 0, 2.2],     // lane center X positions
  runnerZ: 2,                // player's fixed depth
  spawnZ: -88,               // where obstacles/coins appear
  recycleZ: 14,              // remove once past the camera

  runnerHeight: 1.4,         // standing collision height
  slideScale: 0.42,          // height multiplier while sliding
  hitZ: 1.0,                 // depth tolerance for collisions
  lowTop: 0.95,              // top height of jump-over barriers
  barBottom: 1.15,           // bottom height of slide-under bars

  jumpVelocity: 11.2,        // initial upward velocity
  gravity: 30,               // downward acceleration
  slideDuration: 0.6,        // seconds

  laneLerp: 13,              // higher = snappier lane switching
  slideLerp: 16,             // squash/stretch easing for slide

  speedStart: 16,            // initial forward speed (units/sec)
  speedRamp: 0.35,           // speed gained per second
  speedMax: 34,              // speed cap

  spawnGapStart: 16,         // distance between rows at base speed
  spawnGapMin: 9.5,          // tightest row spacing
  spawnGapTighten: 0.25,     // how much the gap shrinks per unit of extra speed

  coinValue: 5,              // score added per coin
  coinsPerRun: 3,            // coins per spawned coin run

  // Camera
  cameraPos: [0, 5.6, 9.5],
  cameraLookAt: [0, 1.1, -10],
  cameraFov: 62,
  fogNear: 26,
  fogFar: 80,
} as const;
```

---

## 8. Architecture & implementation notes

### 8.1 Suggested project structure
```
src/
  main.tsx
  App.tsx
  game/
    config.ts            // §7 constants
    store.ts             // Zustand: phase, score, coins, best, actions
    useGameLoop.ts       // per-frame update via useFrame
    spawn.ts             // row spawning + fairness rule
    collisions.ts        // hitbox collision logic
    types.ts
  scene/
    GameCanvas.tsx       // <Canvas>, lights, fog, camera, Preload
    Track.tsx            // ground + lane lines + moving speed detail
    Player.tsx           // player model/placeholder, jump/slide/lane motion
    Obstacle.tsx         // renders a model/placeholder by type
    Coin.tsx
    ObstacleField.tsx    // manages active obstacles & coins
  ui/
    StartScreen.tsx
    Hud.tsx
    GameOverScreen.tsx
    TouchControls.tsx
  assets/audio/...
public/
  models/                // drop .glb files here (see §9)
```

### 8.2 Rendering & camera
- One `<Canvas>` (R3F). Add ambient + directional light, `THREE.Fog` matching the background color, and a fixed perspective camera per §7 (no orbit controls).
- Use `drei`'s `<Preload all />` and `<AdaptiveDpr />`; add `<PerformanceMonitor>` to scale quality down if FPS drops. Include `<Stats>` behind a dev flag only.

### 8.3 The game loop (performance-critical)
- Run the simulation inside R3F's `useFrame((state, delta) => …)`. **Clamp `delta`** (e.g., max 0.05s) so a tab refocus doesn't teleport the player through obstacles.
- **Do not** drive per-frame motion through React state — that re-renders every frame and tanks performance. Mutate `mesh.position` / `mesh.scale` via refs directly. Use the Zustand store only for discrete meta changes (score tick throttled, coin collected, phase transitions).
- Pool/recycle obstacle and coin objects instead of mounting/unmounting every row when feasible.

### 8.4 Spawning & fairness
- Accumulate distance traveled; when it exceeds the current row gap (§7), spawn a row and reset the accumulator.
- Per row: choose 1–2 lanes to block (never 3), assign a random obstacle type to each, then optionally place a coin run in an open lane. Implement exactly the fairness rule in §4.6.

### 8.5 Decoupling art from logic
- Collision uses the logical hitboxes in §4.3, independent of the visual mesh size.
- Each visual entity (player, three obstacle types, coin) reads from a **model registry**: if a `.glb` exists for that slot, load and render it (scaled/oriented to fit the hitbox); otherwise render a labeled placeholder box/cylinder of the hitbox dimensions. This lets the game run immediately and look right once models arrive.

---

## 9. 3D assets & reference images  ⭐ (important)

**The developer has reference images for the player character and the obstacles.** These reference images convey the intended look/style/silhouette of each 3D object. They are an art direction input, not final assets.

### 9.1 How assets will be provided
- The developer will provide **reference images** (PNG/JPG) for the player and obstacles to guide what the 3D models should look like.
- Final 3D models will be supplied as **`.glb`** files (glTF binary). Until they exist, the game must run with placeholder primitives (see §8.5).
- Reference images live in `public/reference/` for designer/agent reference; final models go in `public/models/`.

### 9.2 Required model slots
| Slot (filename) | Represents | Fit to hitbox (W×H×D) | Animations (nice-to-have) |
|---|---|---|---|
| `player.glb` | The runner character | ~0.9 × 1.4 × 0.9 | run (loop), jump, slide |
| `obstacle_low.glb` | Low jump-over barrier | ~1.6 × 0.9 × 0.8 | — |
| `obstacle_overhead.glb` | Overhead slide-under bar/gate | ~1.8 × 0.5 × 0.6 (raised, center y≈1.45) | — |
| `obstacle_block.glb` | Tall full-lane block | ~1.6 × 2.4 × 0.9 | — |
| `coin.glb` *(optional)* | Collectible | ~0.6 diameter | spin (or animate in code) |
| `track.glb` *(optional)* | Decorative track segment | — | — |

### 9.3 Model conventions (so models drop in without code changes)
- **Format:** `.glb`, single file, Y-up, facing **−Z** (down the track, away from camera). Origin at the base/feet (so y=0 sits on the ground).
- **Scale:** real-world-ish, sized to roughly fill the hitbox in §9.2; minor per-model scale/offset corrections live in a model registry config, not scattered in components.
- **Budget (mobile-friendly):** keep each model lightweight (low/mid poly, ≤ ~20k tris for the player, less for obstacles); a small number of textures (≤ 1–2 materials each); prefer baked simple materials. Apply Draco or meshopt compression if available.
- **Player animations:** if the player model ships with `run` / `jump` / `slide` clips, wire them via `drei`'s `useAnimations` and switch clips on action; otherwise animate the placeholder/static mesh procedurally (bob while running, arc on jump, squash on slide).
- **Loading:** load with `useGLTF` (preload with `useGLTF.preload`), wrapped in `<Suspense>` with a loading state. The game must not hard-crash if a model is missing — fall back to the placeholder for that slot and log a warning.

### 9.4 Asset handoff checklist (for the developer to fill)
- [ ] Reference image(s) for the **player** → describe desired style (e.g., low-poly, stylized, robot/animal/human, color palette).
- [ ] Reference image(s) for each **obstacle** (low / overhead / block).
- [ ] Final `.glb` files dropped in `public/models/` with the exact names in §9.2.
- [ ] Note any orientation/scale quirks per model.

---

## 10. Data persistence
- Persist **best distance** (and optionally total coins) in the browser via `localStorage`. Read on load, write on game over if a new best is reached.
- No server, no accounts. Handle the case where `localStorage` is unavailable (private mode) by degrading gracefully to in-memory only.

---

## 11. Audio (Howler.js)
- SFX: lane switch, jump, slide, coin pickup, crash/game-over. Keep them short and pooled.
- Optional looping background music with a mute toggle in the HUD; default music off or low, SFX on. Respect a single global mute.
- Unlock audio on the first user gesture (browser autoplay policy) — initialize Howler on the "start" tap.

---

## 12. Visual / UI direction (HUD & menus)
- Clean, high-energy arcade feel. Dark track with a couple of bright accent colors so obstacles read instantly at speed; ensure the three obstacle types are visually distinct at a glance (color + silhouette).
- HUD: distance (primary, top), coin counter, optional pause/mute. Large, legible, tabular numerals.
- Start and Game-Over overlays: bold title, one clear primary action, minimal text.
- Accessibility floor: visible keyboard focus on buttons, respect `prefers-reduced-motion` for UI transitions (not the gameplay itself), adequate color contrast on HUD text.

---

## 13. Performance requirements
- **60 FPS** target on a modern laptop; **≥ 30 FPS** floor on a mid-range phone browser.
- Cap device pixel ratio (e.g., `min(devicePixelRatio, 2)`); use `AdaptiveDpr`/`PerformanceMonitor` to scale down under load.
- No per-frame React re-renders for gameplay (refs only, §8.3). Recycle objects; avoid allocating in the loop.
- First meaningful interaction (start screen visible) should load fast; preload models before entering Playing.

---

## 14. Implementation milestones (build in this order)

Build incrementally; each milestone should be runnable.

- **M1 — Scaffold:** Vite + React 19 + TS + Tailwind; verify R3F v9 / React 19 install (no peer errors). Empty `<Canvas>` with lights, fog, chase camera, and a static ground plane.
- **M2 — Player + controls (placeholder box):** lane switching with easing, jump physics, slide squash. Keyboard + swipe + on-screen buttons. No obstacles yet.
- **M3 — Track motion & speed:** moving ground detail/rungs for a sense of speed; speed ramp.
- **M4 — Obstacles + collisions (placeholders):** three obstacle types, row spawning with the fairness rule, hitbox collisions, game over on hit.
- **M5 — Coins + scoring:** coin runs, collection, distance + coin scoring, best-distance persistence.
- **M6 — Game states & UI:** Start / Playing / Game Over (and optional Pause) with full HUD and overlays.
- **M7 — Audio:** Howler SFX + optional music + mute.
- **M8 — Asset swap:** model registry + `useGLTF` loading with placeholder fallback; drop in real `.glb` models and player animations.
- **M9 — Polish & perf:** tune §7 constants for feel, performance pass, mobile testing, deploy to Vercel.

---

## 15. Acceptance criteria (definition of done for MVP)
- [ ] Runs in modern desktop and mobile browsers without console errors.
- [ ] Player can switch lanes, jump, and slide via keyboard, swipe, and on-screen buttons.
- [ ] All three obstacle types appear and each requires its correct response; collisions are accurate to the hitboxes.
- [ ] Spawning never blocks all three lanes (fairness rule holds across long runs).
- [ ] Speed ramps up over time and is capped.
- [ ] Coins spawn in open lanes, are collectible, and affect score.
- [ ] Distance + coin scoring works; best distance persists across reloads.
- [ ] Start / Playing / Game Over flow works; instant retry resets cleanly (no leftover obstacles, score, or speed).
- [ ] Game runs at the §13 frame-rate targets; no per-frame React re-renders for gameplay.
- [ ] Real `.glb` models render in place of placeholders when present, with graceful fallback when absent.
- [ ] Builds with `vite build` and deploys as a static site on Vercel.

---

## 16. Future enhancements (post-MVP, not required now)
- **Near-miss / streak multiplier:** reward grazing obstacles closely and chaining clean dodges to ramp score multiplier — a differentiator vs. generic runners.
- Power-ups (magnet, shield, score boost), multiple characters/skins, a daily-seed challenge with a shareable result, environment theming, leaderboards (would require a backend), haptics on mobile, WebGPU renderer path.

---

*End of PRD.*
