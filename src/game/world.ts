import { CONFIG } from './config'

/**
 * Shared per-frame world runtime (PRD §4.1, §4.6, §8.3).
 *
 * The world scrolls toward the camera in +Z; the player stays at a fixed depth.
 * This single mutable object is the source of truth for the frame's movement so
 * every consumer (track rungs now; obstacles/coins in M4–M5) scrolls in lock-step.
 * It is intentionally NOT React state — it's mutated in place inside useFrame.
 *
 * `GameLoop` writes `speed`/`distance`/`dz` once per frame (it mounts first, so
 * its useFrame runs before consumers); everything else only reads them.
 */
interface World {
  /** when false, the simulation is frozen (start screen, game over, pause) */
  running: boolean
  /** current forward speed in units/sec, ramps speedStart → speedMax (§4.6) */
  speed: number
  /** total distance the world has scrolled — basis for the score (§4.7) */
  distance: number
  /** how far the world should move in +Z this frame (speed × clamped dt) */
  dz: number
  /** incremented on every fresh run; lets the scene drop stale obstacles at once */
  runId: number
}

export const world: World = {
  // Boots frozen behind the Start screen; start() flips this on (§5).
  running: false,
  speed: CONFIG.speedStart,
  distance: 0,
  dz: 0,
  runId: 0,
}

/** Reset to a fresh run (called on start / retry so nothing leaks between runs). */
export function resetWorld() {
  world.speed = CONFIG.speedStart
  world.distance = 0
  world.dz = 0
  world.runId++
  world.running = true
}
