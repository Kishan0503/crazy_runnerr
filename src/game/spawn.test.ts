import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CONFIG } from './config'
import { currentGap, difficultyAt, jetpackRow, makeRow, makeRowPlan, resetSpawner, setSpawnMode, tickSpawner } from './spawn'
import { activatePickup, resetPickups } from './pickups'

const LANES = CONFIG.lanes.length

describe('makeRow — fairness rule (§4.6)', () => {
  it('never blocks all lanes across 10,000 random rows', () => {
    for (let i = 0; i < 10_000; i++) {
      const row = makeRow(Math.random())
      const lanes = row.map((o) => o.lane)
      expect(row.length === 1 || row.length === 2).toBe(true)
      expect(new Set(lanes).size).toBe(lanes.length) // no duplicate lanes
      expect(lanes.every((l) => l >= 0 && l < LANES)).toBe(true)
      expect(row.length).toBeLessThan(LANES)
    }
  })

  it('blocks exactly one lane at twoLaneChance 0 and two at 1', () => {
    for (let i = 0; i < 500; i++) {
      expect(makeRow(0)).toHaveLength(1)
      expect(makeRow(1)).toHaveLength(2)
    }
  })

  it('only uses known obstacle kinds', () => {
    for (let i = 0; i < 500; i++) {
      for (const o of makeRow(0.5)) expect(['low', 'overhead', 'block']).toContain(o.kind)
    }
  })
})

describe('makeRowPlan — coin placement', () => {
  it('never puts ground coins in a blocked lane and keeps counts in range', () => {
    for (let i = 0; i < 5_000; i++) {
      const plan = makeRowPlan(Math.random())
      const blocked = new Set(plan.obstacles.map((o) => o.lane))
      for (const run of plan.coins) {
        expect(blocked.has(run.lane)).toBe(false)
        expect(run.count).toBeGreaterThanOrEqual(1)
        expect(run.count).toBeLessThanOrEqual(10)
      }
    }
  })
})

describe('difficultyAt / currentGap', () => {
  const start = CONFIG.densityStartDistance
  const end = start + CONFIG.difficultyRampDistance

  it('is held at 0 until densityStartDistance', () => {
    expect(difficultyAt(0)).toBe(0)
    expect(difficultyAt(start)).toBe(0)
  })

  it('reaches 1 at the end of the ramp and stays there', () => {
    expect(difficultyAt(end)).toBe(1)
    expect(difficultyAt(end + 5000)).toBe(1)
  })

  it('never decreases along the ramp', () => {
    let prev = 0
    for (let d = start; d <= end; d += 10) {
      const v = difficultyAt(d)
      expect(v).toBeGreaterThanOrEqual(prev)
      prev = v
    }
  })

  it('maps difficulty 0 → spawnGapEarly and 1 → spawnGapMin', () => {
    expect(currentGap(0)).toBe(CONFIG.spawnGapEarly)
    expect(currentGap(end)).toBe(CONFIG.spawnGapMin)
  })
})

describe('tickSpawner — row cadence', () => {
  // Random rows only: chunk rows carry their own designed gaps.
  beforeEach(() => {
    resetSpawner()
    setSpawnMode('random')
  })
  afterEach(() => setSpawnMode('mix'))

  it('spawns nothing during the warm-up distance', () => {
    for (let i = 0; i < 100; i++) expect(tickSpawner(50, CONFIG.spawnWarmup - 1)).toBeNull()
  })

  it('spawns once accumulated movement reaches the gap', () => {
    const gap = currentGap(100)
    const step = gap / 4
    expect(tickSpawner(step, 100)).toBeNull()
    expect(tickSpawner(step, 100)).toBeNull()
    expect(tickSpawner(step, 100)).toBeNull()
    expect(tickSpawner(step, 100)).not.toBeNull()
  })

  it('carries the remainder over to the next row', () => {
    const gap = currentGap(100)
    expect(tickSpawner(gap + 5, 100)).not.toBeNull() // 5 left over
    expect(tickSpawner(gap - 6, 100)).toBeNull() // gap - 1 accumulated
    expect(tickSpawner(1, 100)).not.toBeNull() // exactly gap
  })
})

describe('Phase 4A spawning', () => {
  beforeEach(() => {
    resetSpawner()
    resetPickups()
  })

  it('never blocks every free lane when a roof occupies a lane', () => {
    for (let i = 0; i < 5_000; i++) {
      const row = makeRow(1, Math.random, [1]) // roof in the middle lane
      expect(row.length).toBeLessThanOrEqual(1)
      expect(row.every((o) => o.lane !== 1)).toBe(true)
    }
  })

  it('turns some obstacles into vehicles only after the vehicle start distance', () => {
    let early = 0
    let late = 0
    for (let i = 0; i < 3_000; i++) {
      early += makeRowPlan(0.5, Math.random, { distance: CONFIG.vehicleStartDistance - 1 }).obstacles.filter((o) => o.kind === 'car' || o.kind === 'truck').length
      late += makeRowPlan(0.5, Math.random, { distance: CONFIG.vehicleStartDistance + 1 }).obstacles.filter((o) => o.kind === 'car' || o.kind === 'truck').length
    }
    expect(early).toBe(0)
    expect(late).toBeGreaterThan(0)
  })

  it('a ramp+roof always leaves another open road lane, with coins on the roof', () => {
    let roofs = 0
    for (let i = 0; i < 20_000; i++) {
      const plan = makeRowPlan(0.5, Math.random, { distance: 500, allowRoof: true })
      if (plan.surfaces.length === 0) continue
      roofs++
      const roofLane = plan.surfaces[0].lane
      expect(plan.surfaces.map((s) => s.kind)).toEqual(['ramp', 'roof'])
      const blocked = new Set([...plan.obstacles.map((o) => o.lane), roofLane])
      expect(blocked.size).toBeLessThan(CONFIG.lanes.length)
      expect(plan.coins.some((c) => c.lane === roofLane && (c.y ?? 0) > CONFIG.roofHeight)).toBe(true)
    }
    expect(roofs).toBeGreaterThan(0)
  })

  it('no pickups before the start distance; pickups always land in an open lane', () => {
    for (let i = 0; i < 2_000; i++) {
      expect(makeRowPlan(0.5, Math.random, { distance: CONFIG.pickupStartDistance - 1 }).pickup).toBeNull()
    }
    let seen = 0
    for (let d = CONFIG.pickupStartDistance; d < 200_000; d += 7) {
      const plan = makeRowPlan(0.5, Math.random, { distance: d })
      if (!plan.pickup) continue
      seen++
      expect(plan.obstacles.some((o) => o.lane === plan.pickup!.lane)).toBe(false)
    }
    expect(seen).toBeGreaterThan(10)
  })

  it('keeps pickups at least pickupMinGap apart', () => {
    let last = -Infinity
    for (let d = CONFIG.pickupStartDistance; d < 50_000; d += 5) {
      const plan = makeRowPlan(0.5, Math.random, { distance: d })
      if (!plan.pickup) continue
      expect(d - last).toBeGreaterThanOrEqual(CONFIG.pickupMinGap)
      last = d
    }
  })

  it('jetpack rows carry only a sky coin trail, and nothing that arrives at landing', () => {
    activatePickup('jetpack')
    const sky = jetpackRow(1) // arrives 1 s in, still flying
    expect(sky.obstacles).toHaveLength(0)
    expect(sky.coins[0].y).toBeGreaterThan(CONFIG.jetpackHeight)
    const late = jetpackRow(CONFIG.pickupJetpackTime) // arrives at touchdown
    expect(late.coins).toHaveLength(0)
    expect(late.obstacles).toHaveLength(0)
  })
})
