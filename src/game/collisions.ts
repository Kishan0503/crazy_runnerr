import { CONFIG, HITBOXES, PLAYER_SIZE } from './config'
import type { ObstacleKind } from './config'
import type { HitKind, PlayerRuntime } from './types'

/**
 * Forgiveness shaved off the obstacle box on each axis so a *visible* near-miss
 * is a pass, not a death (fixes "died mid-air with clearance"). Small enough to
 * stay fair, large enough that the geometry the player sees is what kills them.
 */
const DEPTH_FORGIVE = 0.14
const VERT_FORGIVE = 0.1
/** Side forgiveness: brushing an obstacle's edge mid-lane-switch is a pass. */
export const SIDE_FORGIVE = 0.25

/** Per-axis overlap between the player's logical hitbox and an obstacle's. */
export interface Overlap {
  x: boolean
  y: boolean
  z: boolean
}

/**
 * Axis-by-axis hitbox test (PRD §4.4) against the player's REAL position — the
 * eased `x`, live jump height `y`, and slide squash `scaleY` — never the visual
 * meshes (§8.5). Using the eased x (not the target lane) means a lane switch only
 * collides once the body actually reaches the obstacle, matching what you see.
 */
export function overlap(player: PlayerRuntime, kind: ObstacleKind, lane: number, z: number): Overlap {
  const spec = HITBOXES[kind]
  const [ow, oh, od] = spec.size

  const xReach = ow / 2 + PLAYER_SIZE.width / 2 - SIDE_FORGIVE
  const depthReach = od / 2 + PLAYER_SIZE.depth / 2 - DEPTH_FORGIVE

  const obsBottom = spec.centerY - oh / 2 + VERT_FORGIVE
  const obsTop = spec.centerY + oh / 2 - VERT_FORGIVE
  const playerBottom = player.y // feet (outer-group y is the hitbox base)
  const playerTop = player.y + CONFIG.runnerHeight * player.scaleY

  return {
    x: Math.abs(player.x - CONFIG.lanes[lane]) < xReach,
    y: playerBottom < obsTop && playerTop > obsBottom,
    z: Math.abs(z - CONFIG.runnerZ) < depthReach,
  }
}

/**
 * Vertical clearance while passing an obstacle (units, > 0 = clear): how far the
 * feet were above a low barrier's top, or the head below an overhead bar's
 * bottom. Uses the unforgiven box so "tight" means visibly tight. Blocks can't be
 * cleared vertically → Infinity.
 */
export function verticalClearance(player: PlayerRuntime, kind: ObstacleKind): number {
  const spec = HITBOXES[kind]
  const top = spec.centerY + spec.size[1] / 2
  const bottom = spec.centerY - spec.size[1] / 2
  if (kind === 'low') return player.y - top
  if (kind === 'overhead') return bottom - (player.y + CONFIG.runnerHeight * player.scaleY)
  return Infinity
}

/**
 * True when the hitboxes overlap on all three axes:
 *   - low      → cleared by jumping (feet rise above the barrier's top)
 *   - overhead → cleared by sliding (head drops below the bar's bottom)
 *   - block    → tall + full height: only a different lane clears it
 */
export function hits(player: PlayerRuntime, kind: ObstacleKind, lane: number, z: number): boolean {
  const o = overlap(player, kind, lane, z)
  return o.x && o.y && o.z
}

/**
 * Classify a fresh hit from the PREVIOUS frame's per-axis overlap:
 *   - clip:   the player was already heading to another lane (late dodge /
 *             corner graze) → stumble, keep going
 *   - side:   depth already overlapped, then x closed in (swerved into its
 *             side) → stumble + bounce back
 *   - headOn: anything else (ran into its face, or landed on it) → game over
 */
export function classifyHit(
  prevX: boolean,
  prevZ: boolean,
  targetLane: number,
  obstacleLane: number,
): HitKind {
  if (targetLane !== obstacleLane) return 'clip'
  if (prevZ && !prevX) return 'side'
  return 'headOn'
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
