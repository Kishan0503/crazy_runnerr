import { useFrame } from '@react-three/fiber'
import { CONFIG } from '../game/config'
import { world } from '../game/world'

/**
 * Speed multiplier for a given distance — distance-STEPPED tiers (not continuous).
 * +`speedTierStep` per `speedTierDistance` metres, capped at `speedMaxTier`.
 *   0–500m: 1.0x · 500–1000: 1.1x · 1000–1500: 1.2x · 1500–2000: 1.3x · 2000+: 1.3x
 * Stepping by distance (not per-second) keeps the tiers stable regardless of
 * frame rate, and the cap keeps long runs fair (§ updated mechanic).
 */
export function speedMultiplierAt(distance: number): number {
  const tier = Math.floor(distance / CONFIG.speedTierDistance)
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
  })

  return null
}
