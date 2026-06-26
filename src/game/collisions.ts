import { CONFIG, HITBOXES, PLAYER_SIZE } from './config'
import type { ObstacleKind } from './config'
import type { PlayerRuntime } from './types'

/**
 * Forgiveness shaved off the obstacle box on each axis so a *visible* near-miss
 * is a pass, not a death (fixes "died mid-air with clearance"). Small enough to
 * stay fair, large enough that the geometry the player sees is what kills them.
 */
const DEPTH_FORGIVE = 0.14
const VERT_FORGIVE = 0.1

/**
 * Hitbox collision test (PRD §4.4). True axis-aligned box overlap between the
 * player's logical hitbox (its live jump height `y` and slide squash `scaleY`)
 * and the obstacle's hitbox from HITBOXES — never the visual meshes, so art and
 * gameplay stay decoupled (§8.5). A hit needs overlap on ALL of: lane, depth (z),
 * and height (y):
 *   - low      → cleared by jumping (feet rise above the barrier's top)
 *   - overhead → cleared by sliding (head drops below the bar's bottom)
 *   - block    → tall + full height: only a different lane clears it
 */
export function hits(
  player: PlayerRuntime,
  kind: ObstacleKind,
  lane: number,
  z: number,
): boolean {
  // Different lane → safe.
  if (lane !== player.lane) return false

  const spec = HITBOXES[kind]
  const [, oh, od] = spec.size

  // Depth overlap: half-depths of both boxes, minus a little forgiveness.
  const depthReach = od / 2 + PLAYER_SIZE.depth / 2 - DEPTH_FORGIVE
  if (Math.abs(z - CONFIG.runnerZ) >= depthReach) return false

  // Vertical overlap against the obstacle box (shrunk by forgiveness).
  const obsBottom = spec.centerY - oh / 2 + VERT_FORGIVE
  const obsTop = spec.centerY + oh / 2 - VERT_FORGIVE
  const playerBottom = player.y // feet (outer-group y is the hitbox base)
  const playerTop = player.y + CONFIG.runnerHeight * player.scaleY
  return playerBottom < obsTop && playerTop > obsBottom
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
