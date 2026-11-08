import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CONFIG } from './config'
import { world } from './world'
import { player } from './playerState'
import { createPlayerState } from './player'
import { activatePickup, isPickupActive, resetPickups } from './pickups'
import { surfaces } from './floor'
import { resetTrack, spawnPlanForTest, stepTrack, track } from './track'
import { useGameStore } from './store'
import type { RowPlan } from './spawn'

const row = (p: Partial<RowPlan>): RowPlan => ({ obstacles: [], surfaces: [], coins: [], pickup: null, ...p })

/** Advance the simulation one frame by `dz` world units (as GameLoop would). */
function step(dz: number, dt = 1 / 60) {
  world.dz = dz
  world.dt = dt
  stepTrack()
}

beforeEach(() => {
  resetTrack()
  resetPickups()
  Object.assign(player, createPlayerState())
  world.running = true
  world.distance = 0 // inside the warm-up: the spawner adds nothing of its own
  world.timeScale = 1
  useGameStore.setState({ phase: 'playing', coins: 0 })
})
afterEach(() => {
  world.running = false
})

describe('track simulation', () => {
  it('moves obstacles with the world and recycles them past the camera', () => {
    spawnPlanForTest(row({ obstacles: [{ lane: 0, kind: 'block' }] }))
    expect(track.obstacles).toHaveLength(1)
    step(10)
    expect(track.obstacles[0].z).toBeCloseTo(CONFIG.spawnZ + 10)
    for (let i = 0; i < 20; i++) step(10)
    expect(track.obstacles).toHaveLength(0)
  })

  it('moves vehicles faster than the road (their own speed)', () => {
    spawnPlanForTest(row({ obstacles: [{ lane: 0, kind: 'car' }, { lane: 2, kind: 'block' }] }))
    step(1, 0.5)
    const car = track.obstacles.find((o) => o.kind === 'car')!
    const block = track.obstacles.find((o) => o.kind === 'block')!
    expect(car.z - block.z).toBeCloseTo(CONFIG.carSpeed * 0.5)
  })

  it('crashes on a head-on hit in the runner’s lane', () => {
    spawnPlanForTest(row({ obstacles: [{ lane: 1, kind: 'block' }] }))
    const gap = CONFIG.runnerZ - CONFIG.spawnZ
    for (let moved = 0; moved < gap + 2 && useGameStore.getState().phase === 'playing'; moved += 1) step(1)
    expect(useGameStore.getState().phase).toBe('dying')
  })

  it('a shield absorbs the hit and smashes the obstacle', () => {
    activatePickup('shield')
    spawnPlanForTest(row({ obstacles: [{ lane: 1, kind: 'block' }] }))
    const gap = CONFIG.runnerZ - CONFIG.spawnZ
    for (let moved = 0; moved < gap + 2; moved += 1) step(1)
    expect(useGameStore.getState().phase).toBe('playing')
    expect(isPickupActive('shield')).toBe(false)
  })

  it('collects a coin in the runner’s lane, even on a very long frame (swept test)', () => {
    spawnPlanForTest(row({ coins: [{ lane: 1, count: 1 }] }))
    const coin = track.coins[0]
    // Park it just in front of the pickup window, then jump 3 units past the runner.
    coin.z = CONFIG.runnerZ - 1.5
    step(3)
    expect(track.coins).toHaveLength(0)
    expect(useGameStore.getState().coins).toBe(1)
  })

  it('does not collect coins in other lanes', () => {
    spawnPlanForTest(row({ coins: [{ lane: 0, count: 3 }] }))
    for (let i = 0; i < 60; i++) step(2)
    expect(useGameStore.getState().coins).toBe(0)
    expect(track.coins).toHaveLength(0) // recycled
  })

  it('activates a pickup when run through', () => {
    spawnPlanForTest(row({ pickup: { lane: 1, kind: 'magnet' } }))
    for (let i = 0; i < 60 && track.pickups.length; i++) step(2)
    expect(isPickupActive('magnet')).toBe(true)
  })

  it('registers ramps / roofs in the floor map and clears everything on reset', () => {
    spawnPlanForTest(
      row({
        surfaces: [
          { lane: 0, kind: 'ramp', length: 6, offset: 0 },
          { lane: 0, kind: 'roof', length: 24, offset: 6 },
        ],
        obstacles: [{ lane: 2, kind: 'low' }],
        coins: [{ lane: 1, count: 4 }],
      }),
    )
    expect(surfaces.size).toBe(2)
    step(5)
    expect([...surfaces.values()][0].front).toBeCloseTo(CONFIG.spawnZ + 5)
    resetTrack()
    expect(surfaces.size).toBe(0)
    expect(track.obstacles.length + track.coins.length + track.surfaces.length).toBe(0)
  })

  it('reuses recycled objects instead of allocating new ones', () => {
    spawnPlanForTest(row({ obstacles: [{ lane: 0, kind: 'low' }] }))
    const first = track.obstacles[0]
    resetTrack()
    spawnPlanForTest(row({ obstacles: [{ lane: 2, kind: 'block' }] }))
    expect(track.obstacles[0]).toBe(first)
    expect(track.obstacles[0].lane).toBe(2)
    expect(track.obstacles[0].spent).toBe(false)
  })
})
