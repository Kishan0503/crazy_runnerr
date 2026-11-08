import { CONFIG, PLAYER_SIZE } from './config'
import { SIDE_FORGIVE } from './collisions'
import { STEP_HEIGHT } from './player'

/**
 * Ramps & rooftops (Phase 4A) — pure geometry, no rendering.
 *
 * A surface occupies one lane and a span of depth [front − length, front]. The
 * world scrolls +Z toward the player, so `front` (the end nearest the player)
 * reaches the runner first:
 *   - ramp: height rises 0 → roofHeight from its front to its back
 *   - roof: flat at roofHeight; its front face is a wall at road level
 *
 * The player can stand on a surface when its feet are no more than STEP_HEIGHT
 * below the surface height there; anything taller is a wall (a collision).
 */
export type SurfaceKind = 'ramp' | 'roof'

export interface Surface {
  kind: SurfaceKind
  lane: number
  /** z of the end nearest the player (moves with the world) */
  front: number
  /** depth extent toward −Z */
  length: number
}

/** Live surfaces (written by the scene each frame, read by the player rig + collisions). */
export const surfaces = new Map<number, Surface>()

/** Half-width of the area you can stand on (the surface is ~1.8 wide). */
const STAND_HALF_WIDTH = 0.9

/** Surface height at depth z (null when z is outside the surface). */
export function heightAt(s: Surface, z: number): number | null {
  const back = s.front - s.length
  if (z > s.front || z < back) return null
  if (s.kind === 'roof') return CONFIG.roofHeight
  const t = (s.front - z) / s.length // 0 at the low front edge → 1 at the top
  return t * CONFIG.roofHeight
}

/**
 * Floor height under the player: the highest surface it is over AND can stand
 * on (feet within STEP_HEIGHT of the top, or above it). 0 = the road.
 */
export function floorAt(
  playerX: number,
  playerY: number,
  list: Iterable<Surface>,
  z: number = CONFIG.runnerZ,
): number {
  let floor = 0
  for (const s of list) {
    if (Math.abs(playerX - CONFIG.lanes[s.lane]) >= STAND_HALF_WIDTH) continue
    const h = heightAt(s, z)
    if (h === null) continue
    if (playerY >= h - STEP_HEIGHT && h > floor) floor = h
  }
  return floor
}

/** Per-axis overlap of the player's box with a surface's solid part (for wall hits). */
export function surfaceOverlap(
  s: Surface,
  playerX: number,
  playerY: number,
  z: number = CONFIG.runnerZ,
): { x: boolean; z: boolean; wall: boolean } {
  const xReach = STAND_HALF_WIDTH + PLAYER_SIZE.width / 2 - SIDE_FORGIVE
  const x = Math.abs(playerX - CONFIG.lanes[s.lane]) < xReach
  const h = heightAt(s, z)
  const inZ = h !== null
  // A wall only when the feet are clearly below the surface there.
  const wall = x && inZ && playerY < (h ?? 0) - STEP_HEIGHT
  return { x, z: inZ, wall }
}
