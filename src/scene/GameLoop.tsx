import { useFrame } from '@react-three/fiber'
import { CONFIG } from '../game/config'
import { world } from '../game/world'
import { tickAbility } from '../game/ability'

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

/**
 * The central simulation tick (PRD §8.3).
 *
 * Mounted before all other scene content so its useFrame runs first each frame:
 * it clamps delta, sets the speed from the current distance tier, advances total
 * distance, and publishes `world.dz` — the amount every world object should
 * scroll this frame. Renders nothing.
 */
export function GameLoop() {
  useFrame((_, delta) => {
    if (!world.running) {
      world.dz = 0
      return
    }
    // Clamp delta so a tab refocus can't jump the world forward (§8.3).
    const dt = Math.min(delta, 0.05)

    // Speed is a stepped function of distance, capped (§ updated mechanic).
    world.speed = CONFIG.speedStart * speedMultiplierAt(world.distance)

    world.dz = world.speed * dt
    world.distance += world.dz

    // Advance the active character ability's effect timer (e.g. Magnet).
    tickAbility(dt)
  })

  return null
}
