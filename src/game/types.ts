/** Shared gameplay types (PRD §8.1). */

/** A discrete control intent, produced by keyboard / swipe / on-screen buttons. */
export type Intent = 'left' | 'right' | 'jump' | 'slide'

/**
 * Per-frame player runtime state. Lives in a ref and is mutated in place by the
 * game loop — never stored in React state, to avoid per-frame re-renders (§8.3).
 */
export interface PlayerRuntime {
  /** target lane index into CONFIG.lanes (0..2) */
  lane: number
  /** current eased x position */
  x: number
  /** current height above ground (jump arc) */
  y: number
  /** vertical velocity */
  vy: number
  /** standing on the ground (can jump/slide) */
  grounded: boolean
  /** currently sliding (lowered hitbox) */
  sliding: boolean
  /** seconds left in the current slide */
  slideTimer: number
  /** current vertical scale (1 standing → slideScale crouched), eased */
  scaleY: number
  /** accumulated running time, drives the procedural run bob */
  runTime: number
  /** gravity fixed at take-off (speed-scaled), so a tier change can't warp an arc */
  jumpGravity: number
  /** seconds left on a jump pressed while airborne (fires on landing) */
  jumpBuffer: number
  /** slamming down after a mid-air slide input */
  fastFalling: boolean
  /** start a slide on the landing frame (set by fast-fall) */
  slideOnLand: boolean
  /** lane before the last switch — side-hit stumbles bounce back here */
  prevLane: number
  /** increments on every jump start, so animation clips can restart */
  jumpSeq: number
  /** increments on every slide start (same reason) */
  slideSeq: number
  /** seconds left in the "already stumbled" window; > 0 means next stumble kills */
  stumbleTimer: number
  /** increments on every stumble, so the rig/HUD can play feedback once */
  stumbleSeq: number
}

/** Outcome of a stumble: survivable once per window, fatal inside it. */
export type StumbleResult = 'stumbled' | 'dead'

/** How an obstacle collision happened (decides death vs stumble). */
export type HitKind = 'headOn' | 'side' | 'clip'
