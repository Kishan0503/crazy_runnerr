import { MathUtils } from 'three'
import { CONFIG } from './config'
import type { Intent, PlayerRuntime } from './types'

/**
 * Pure player physics (PRD §4.2). No Three.js scene access here — the rig reads
 * this state and writes it to mesh refs. Keeping it pure makes the jump/slide
 * timing trivially tunable via CONFIG and testable in isolation.
 */

export function createPlayerState(): PlayerRuntime {
  return {
    lane: 1, // middle lane is the start lane (§4.1)
    x: CONFIG.lanes[1],
    y: 0,
    vy: 0,
    grounded: true,
    sliding: false,
    slideTimer: 0,
    scaleY: 1,
    runTime: 0,
  }
}

/** Apply a discrete control intent to the player state. */
export function applyIntent(s: PlayerRuntime, intent: Intent) {
  switch (intent) {
    case 'left':
      // Lane switching is allowed any time (including mid-air), clamped to track.
      s.lane = Math.max(0, s.lane - 1)
      break
    case 'right':
      s.lane = Math.min(CONFIG.lanes.length - 1, s.lane + 1)
      break
    case 'jump':
      // Only when grounded and not sliding (§4.2).
      if (s.grounded && !s.sliding) {
        s.vy = CONFIG.jumpVelocity
        s.grounded = false
      }
      break
    case 'slide':
      // Only when grounded (§4.2). Re-pressing while sliding does nothing.
      if (s.grounded && !s.sliding) {
        s.sliding = true
        s.slideTimer = CONFIG.slideDuration
      }
      break
  }
}

/**
 * Advance the player one frame. `dt` should already be clamped by the caller
 * (§8.3) so a tab refocus can't fling the player through obstacles.
 */
export function stepPlayer(s: PlayerRuntime, dt: number) {
  // Jump arc: integrate gravity until we land back on the ground.
  if (!s.grounded) {
    s.vy -= CONFIG.gravity * dt
    s.y += s.vy * dt
    if (s.y <= 0) {
      s.y = 0
      s.vy = 0
      s.grounded = true
    }
  }

  // Slide auto-stands after a fixed duration.
  if (s.sliding) {
    s.slideTimer -= dt
    if (s.slideTimer <= 0) s.sliding = false
  }

  // Ease x toward the target lane center — frame-rate independent (§4.2).
  s.x = MathUtils.damp(s.x, CONFIG.lanes[s.lane], CONFIG.laneLerp, dt)

  // Squash/stretch toward the slide pose, eased.
  const targetScale = s.sliding ? CONFIG.slideScale : 1
  s.scaleY = MathUtils.damp(s.scaleY, targetScale, CONFIG.slideLerp, dt)

  // Advance the run cycle only while actually running on the ground.
  if (s.grounded && !s.sliding) s.runTime += dt
}
