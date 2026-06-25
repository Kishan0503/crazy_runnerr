import { useFrame } from '@react-three/fiber'
import { CONFIG } from '../game/config'
import { world } from '../game/world'

/**
 * The central simulation tick (PRD §8.3).
 *
 * Mounted before all other scene content so its useFrame runs first each frame:
 * it clamps delta, ramps the speed toward the cap, advances total distance, and
 * publishes `world.dz` — the amount every world object should scroll this frame.
 * Renders nothing.
 */
export function GameLoop() {
  useFrame((_, delta) => {
    if (!world.running) {
      world.dz = 0
      return
    }
    // Clamp delta so a tab refocus can't jump the world forward (§8.3).
    const dt = Math.min(delta, 0.05)

    // Speed ramps up slowly over time, capped (§4.6).
    world.speed = Math.min(CONFIG.speedMax, world.speed + CONFIG.speedRamp * dt)

    world.dz = world.speed * dt
    world.distance += world.dz
  })

  return null
}
