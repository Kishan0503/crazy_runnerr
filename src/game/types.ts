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
}
