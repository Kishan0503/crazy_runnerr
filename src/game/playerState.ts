import { createPlayerState } from './player'
import type { PlayerRuntime } from './types'

/**
 * The single shared player runtime (PRD §8.3).
 *
 * Lifted to a module singleton so both the player rig (which mutates it in
 * useFrame) and the collision check in ObstacleField (which reads pose/lane)
 * work off the exact same state — without prop drilling or React re-renders.
 */
export const player: PlayerRuntime = createPlayerState()

/** Reset to a fresh standing pose in the middle lane (on start / retry). */
export function resetPlayer() {
  Object.assign(player, createPlayerState())
}
