import type { Intent } from './types'

/**
 * A tiny module-level intent bus (PRD §8.3).
 *
 * Keyboard, swipe, and on-screen buttons all push intents here; the player rig
 * drains them once per frame inside useFrame. This decouples the three input
 * sources from the player and, crucially, lets DOM controls (outside the
 * <Canvas>) and the 3D loop (inside it) share input without React re-renders.
 */
const queue: Intent[] = []

export const inputBus = {
  push(intent: Intent) {
    queue.push(intent)
  },
  /** Return and clear all intents collected since the last call. */
  drain(): Intent[] {
    if (queue.length === 0) return EMPTY
    const out = queue.slice()
    queue.length = 0
    return out
  },
  /** Discard any pending intents (e.g. on game start / retry). */
  clear() {
    queue.length = 0
  },
}

const EMPTY: Intent[] = []
