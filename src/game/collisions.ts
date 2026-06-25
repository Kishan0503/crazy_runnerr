import { CONFIG } from './config'
import type { ObstacleKind } from './config'
import type { PlayerRuntime } from './types'

/**
 * Hitbox collision test (PRD §4.4). Driven entirely by logical state — the
 * player's lane/pose and the obstacle's lane/z — never the visual meshes, so
 * art and gameplay stay decoupled (§8.5).
 *
 * A collision requires the obstacle to share the player's lane AND overlap in
 * depth, AND the player's current pose to NOT clear it:
 *   - low      → cleared only by jumping high enough (feet above the barrier top)
 *   - overhead → cleared only by sliding low enough (head below the bar bottom)
 *   - block    → never cleared; the only escape is a different lane
 */
export function hits(
  player: PlayerRuntime,
  kind: ObstacleKind,
  lane: number,
  z: number,
): boolean {
  // Different lane → safe.
  if (lane !== player.lane) return false
  // Not overlapping in depth yet (or already past) → safe.
  if (Math.abs(z - CONFIG.runnerZ) >= CONFIG.hitZ) return false

  switch (kind) {
    case 'low':
      // Hit unless the player's feet are above the barrier top (jumping).
      return player.y <= CONFIG.lowTop
    case 'overhead': {
      // Hit unless the player's head is below the bar bottom (sliding).
      const headY = player.y + CONFIG.runnerHeight * player.scaleY
      return headY >= CONFIG.barBottom
    }
    case 'block':
      // Same lane + overlap → always a hit.
      return true
  }
}

/** Depth tolerance for collecting a coin. */
export const COIN_PICKUP_Z = 0.9

/**
 * Coin collection test (PRD §4.5): collected when the player shares the coin's
 * lane and overlaps in depth — independent of jump/slide pose/height.
 */
export function collectsCoin(player: PlayerRuntime, lane: number, z: number): boolean {
  return lane === player.lane && Math.abs(z - CONFIG.runnerZ) < COIN_PICKUP_Z
}
