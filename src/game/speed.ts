import { CONFIG } from './config'

/**
 * Speed multiplier for a given distance — distance-STEPPED tiers (not continuous).
 * +`speedTierStep` once distance passes each cumulative `speedTierThresholds`
 * entry, capped at `speedMaxTier`. Thresholds are front-loaded (see config.ts)
 * so the pace picks up quickly at the start instead of sitting flat for 500m.
 * Stepping by distance (not per-second) keeps the tiers stable regardless of
 * frame rate, and the cap keeps long runs fair (§ updated mechanic).
 */
export function speedMultiplierAt(distance: number): number {
  const mult = 1 + speedTierAt(distance) * CONFIG.speedTierStep
  return Math.min(CONFIG.speedMaxTier, mult)
}

/** Index of the speed tier at a distance (0 = base). Loop, not filter: no allocation per frame. */
export function speedTierAt(distance: number): number {
  let tier = 0
  for (const t of CONFIG.speedTierThresholds) if (distance >= t) tier++
  return tier
}

/**
 * Ease the current speed toward the tier target at a constant acceleration, so
 * each +25% step arrives over `speedEaseTime` seconds instead of in one frame.
 */
export function easeSpeed(current: number, target: number, dt: number, rateMult = 1): number {
  const rate = ((CONFIG.speedStart * CONFIG.speedTierStep) / CONFIG.speedEaseTime) * rateMult
  const step = rate * dt
  return Math.abs(target - current) <= step ? target : current + Math.sign(target - current) * step
}
