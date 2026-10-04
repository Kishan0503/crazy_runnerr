/**
 * Pure helpers behind the Phase 2 feedback systems (banners, near-miss, coin
 * streaks, camera shake). Kept free of React/Three so they're unit-tested.
 */

/** The milestone (multiple of `step`) crossed moving prev → curr, or null. */
export function crossedMilestone(prev: number, curr: number, step: number): number | null {
  if (step <= 0 || curr <= prev) return null
  const m = Math.floor(curr / step) * step
  return m > prev && m > 0 ? m : null
}

/** True on the frame distance first passes a previous best (> 0). */
export function crossedBest(prev: number, curr: number, best: number): boolean {
  return best > 0 && prev <= best && curr > best
}

/** Running coin streak: grows while coins arrive within `window` seconds. */
export interface Streak {
  count: number
  last: number
}

export function bumpStreak(s: Streak, now: number, window = 1.0): number {
  s.count = now - s.last <= window ? s.count + 1 : 1
  s.last = now
  return s.count
}

/** Coin pitch: rises with the streak, capped so it never gets shrill. */
export function coinPitch(streak: number): number {
  return 1 + 0.035 * Math.min(Math.max(streak - 1, 0), 12)
}

export interface NearMissInput {
  /** seconds since the player last LEFT this obstacle's lane (Infinity if never) */
  sinceLeftLane: number
  /** vertical clearance when passing over/under it (Infinity if not in its lane) */
  clearance: number
  /** seconds since the last near miss */
  sinceLast: number
}

export const NEAR_MISS = { laneWindow: 0.3, clearance: 0.25, cooldown: 1.0 }

/** A late lane dodge or a tight jump/slide counts as a near miss (with cooldown). */
export function isNearMiss(i: NearMissInput): boolean {
  if (i.sinceLast < NEAR_MISS.cooldown) return false
  return i.sinceLeftLane < NEAR_MISS.laneWindow || i.clearance < NEAR_MISS.clearance
}

/** Camera-shake trauma: add, clamp to 1, decay linearly per second. */
export function addTrauma(current: number, amount: number): number {
  return Math.min(1, current + amount)
}

export function decayTrauma(current: number, dt: number, rate = 1.6): number {
  return Math.max(0, current - rate * dt)
}
