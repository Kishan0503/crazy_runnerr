import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CONFIG } from '../game/config'
import { world } from '../game/world'
import { tickAbility } from '../game/ability'
import { isPickupActive, tickPickups } from '../game/pickups'
import { easeSpeed, speedMultiplierAt, speedTierAt } from '../game/speed'
import { emit } from '../game/events'
import { crossedBest, crossedMilestone } from '../game/feedback'
import { useGameStore } from '../game/store'

/**
 * The central simulation tick (PRD §8.3).
 *
 * Mounted before all other scene content so its useFrame runs first each frame:
 * it clamps delta, sets the speed from the current distance tier, advances total
 * distance, and publishes `world.dz` — the amount every world object should
 * scroll this frame. Renders nothing.
 *
 * It also announces run progress as feedback events: speed-tier changes,
 * distance milestones and passing the previous best.
 */
export function GameLoop() {
  const track = useRef({ runId: -1, tier: 0, bestFired: false })

  useFrame((_, delta) => {
    if (!world.running) {
      world.dz = 0
      world.dt = 0
      return
    }
    // Clamp delta so a tab refocus can't jump the world forward (§8.3), and
    // scale it for the death slow-mo.
    const dt = Math.min(delta, CONFIG.maxFrameDt) * world.timeScale
    world.dt = dt

    // Speed follows a stepped function of distance (capped), eased in so a tier
    // change accelerates smoothly instead of lurching (Phase 4P).
    // The jetpack boosts speed while flying; the boost (and its end) eases fast.
    const base = CONFIG.speedStart * speedMultiplierAt(world.distance)
    const jet = isPickupActive('jetpack')
    const target = jet ? base * CONFIG.jetpackSpeedMult : base
    world.speed = easeSpeed(world.speed, target, dt, jet || world.speed > base + 0.01 ? 5 : 1)

    const prevDistance = world.distance
    world.dz = world.speed * dt
    world.distance += world.dz

    // Advance the active character ability's effect timer (e.g. Magnet).
    tickAbility(dt)

    // Pickup timers (Phase 4A) — announce the ones that just ran out.
    for (const kind of tickPickups(dt)) emit('pickupEnd', { kind })

    // ---- Progress events (only while genuinely playing, not in the death beat) ----
    const t = track.current
    if (t.runId !== world.runId) {
      t.runId = world.runId
      t.tier = 0
      t.bestFired = false
    }
    if (useGameStore.getState().phase !== 'playing') return

    const tier = speedTierAt(world.distance)
    if (tier > t.tier) {
      t.tier = tier
      emit('speedTier', { tier })
    }
    const meters = crossedMilestone(prevDistance, world.distance, CONFIG.milestoneStep)
    if (meters !== null) emit('milestone', { meters })
    if (!t.bestFired && crossedBest(prevDistance, world.distance, useGameStore.getState().best)) {
      t.bestFired = true
      emit('newBest')
    }
  })

  return null
}
