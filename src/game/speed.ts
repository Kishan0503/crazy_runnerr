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
  const tier = CONFIG.speedTierThresholds.filter((t) => distance >= t).length
  const mult = 1 + tier * CONFIG.speedTierStep
  return Math.min(CONFIG.speedMaxTier, mult)
}
