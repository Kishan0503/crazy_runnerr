import { useFrame } from '@react-three/fiber'
import { CONFIG } from '../game/config'
import { world } from '../game/world'
import { tickAbility } from '../game/ability'
import { speedMultiplierAt } from '../game/speed'

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
