import { MathUtils } from 'three'
import { CONFIG } from './config'
import type { Intent, PlayerRuntime, StumbleResult } from './types'

/**
 * Pure player physics (PRD §4.2). No Three.js scene access here — the rig reads
 * this state and writes it to mesh refs. Keeping it pure makes the jump/slide
 * timing trivially tunable via CONFIG and testable in isolation.
 *
 * Phase 1 feel rules:
 *   - a jump pressed mid-air is buffered and fires on landing
 *   - slide pressed mid-air = fast-fall, then an automatic slide on landing
 *   - jumping out of a slide cancels it instantly
 *   - jumps keep their height but shorten their air time as speed rises
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
    jumpGravity: CONFIG.gravity,
    jumpBuffer: 0,
    fastFalling: false,
    slideOnLand: false,
    prevLane: 1,
    jumpSeq: 0,
    slideSeq: 0,
    stumbleTimer: 0,
    stumbleSeq: 0,
  }
}

/**
 * Take-off values for a jump at the given speed multiplier. Height (v²/2g) stays
 * constant; air time shrinks by speedMult^jumpSpeedScaling so late-run jumps
 * don't float across half the screen.
 */
export function jumpParams(speedMult: number) {
  const k = Math.pow(Math.max(1, speedMult), CONFIG.jumpSpeedScaling)
  return { velocity: CONFIG.jumpVelocity * k, gravity: CONFIG.gravity * k * k }
}

function startJump(s: PlayerRuntime, speedMult: number) {
  const { velocity, gravity } = jumpParams(speedMult)
  s.vy = velocity
  s.jumpGravity = gravity
  s.grounded = false
  // Jumping out of a slide cancels it (the hitbox eases back up via scaleY).
  s.sliding = false
  s.slideTimer = 0
  s.jumpBuffer = 0
  s.jumpSeq++
}

function startSlide(s: PlayerRuntime) {
  // Re-pressing while sliding restarts the timer (hold a slide under long bars).
  s.sliding = true
  s.slideTimer = CONFIG.slideDuration
  s.slideSeq++
}

/** Apply a discrete control intent to the player state. */
export function applyIntent(s: PlayerRuntime, intent: Intent, speedMult = 1) {
  switch (intent) {
    case 'left':
    case 'right': {
      // Lane switching is allowed any time (including mid-air), clamped to track.
      const next =
        intent === 'left' ? Math.max(0, s.lane - 1) : Math.min(CONFIG.lanes.length - 1, s.lane + 1)
      if (next !== s.lane) {
        s.prevLane = s.lane
        s.lane = next
      }
      break
    }
    case 'jump':
      if (s.grounded) {
        startJump(s, speedMult)
      } else {
        // Early press: remember it and jump on landing. The latest input wins,
        // so this also cancels a pending fast-fall slide.
        s.jumpBuffer = CONFIG.inputBufferTime
        s.slideOnLand = false
      }
      break
    case 'slide':
      if (s.grounded) {
        startSlide(s)
      } else {
        // Fast-fall: slam down now, slide the moment we land.
        s.vy = Math.min(s.vy, -CONFIG.fastFallVelocity)
        s.fastFalling = true
        s.slideOnLand = true
        s.jumpBuffer = 0
      }
      break
  }
}

/**
 * Advance the player one frame. `dt` should already be clamped by the caller
 * (§8.3) so a tab refocus can't fling the player through obstacles.
 * `speedMult` is only used if a buffered jump fires on landing.
 */
export function stepPlayer(s: PlayerRuntime, dt: number, speedMult = 1) {
  if (s.jumpBuffer > 0) s.jumpBuffer = Math.max(0, s.jumpBuffer - dt)
  if (s.stumbleTimer > 0) s.stumbleTimer = Math.max(0, s.stumbleTimer - dt)

  // Jump arc: integrate the take-off gravity until we land back on the ground.
  if (!s.grounded) {
    const g = s.jumpGravity * (s.fastFalling ? CONFIG.fastFallGravityMult : 1)
    s.vy -= g * dt
    s.y += s.vy * dt
    if (s.y <= 0) {
      s.y = 0
      s.vy = 0
      s.grounded = true
      s.fastFalling = false
      if (s.slideOnLand) startSlide(s)
      else if (s.jumpBuffer > 0) startJump(s, speedMult)
      s.slideOnLand = false
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

/**
 * Register a stumble (side-hit / corner clip). The first one in a window is
 * survivable; a second inside `stumbleWindow` seconds is fatal.
 */
export function stumble(s: PlayerRuntime): StumbleResult {
  if (s.stumbleTimer > 0) return 'dead'
  s.stumbleTimer = CONFIG.stumbleWindow
  s.stumbleSeq++
  return 'stumbled'
}

/** Side-entry stumble: knock the player back to the lane they came from. */
export function bounceBack(s: PlayerRuntime) {
  const from = s.lane
  s.lane = s.prevLane
  s.prevLane = from
}
