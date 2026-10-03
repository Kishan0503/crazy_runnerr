import { create } from 'zustand'
import type { ObstacleKind } from '../config'

/**
 * Dev-only debug state (Phase 0). Every consumer guards with
 * `import.meta.env.DEV`, so production builds fold those branches away and
 * this module is never bundled.
 *
 * React components subscribe to the store (to mount/unmount debug UI); per-frame
 * code reads `useDebugStore.getState()` so toggles apply instantly with no
 * re-render.
 */
interface DebugState {
  /** debug mode on (`?debug` or the backtick key) — shows panel + stats */
  enabled: boolean
  /** collisions never end the run */
  godMode: boolean
  /** draw the logical hitboxes as wireframes */
  showHitboxes: boolean
  setEnabled: (v: boolean) => void
}

// PURE annotation lets the bundler drop this module from production builds,
// where every import site is behind a folded-away `import.meta.env.DEV` check.
export const useDebugStore = /* @__PURE__ */ create<DebugState>((set) => ({
  enabled: false,
  godMode: false,
  showHitboxes: false,
  setEnabled: (enabled) => set({ enabled }),
}))

/** Live obstacles, registered by ActiveObstacle so the hitbox overlay can draw them. */
export interface DebugObstacle {
  kind: ObstacleKind
  lane: number
  z: number
}
export const debugObstacles = new Map<number, DebugObstacle>()

/** Renderer stats from the previous frame (written by DebugScene, shown in the panel). */
export const perfStats = { drawCalls: 0, triangles: 0 }
