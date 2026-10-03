import { beforeEach, describe, expect, it } from 'vitest'
import { CONFIG } from './config'
import { currentGap, difficultyAt, makeRow, makeRowPlan, resetSpawner, tickSpawner } from './spawn'

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
  it('never puts coins in a blocked lane and keeps counts in range', () => {
    for (let i = 0; i < 5_000; i++) {
      const plan = makeRowPlan(Math.random())
      const blocked = new Set(plan.obstacles.map((o) => o.lane))
      if (plan.coinLane === null) {
        expect(plan.coinCount).toBe(0)
      } else {
        expect(blocked.has(plan.coinLane)).toBe(false)
        expect(plan.coinCount).toBeGreaterThanOrEqual(1)
        expect(plan.coinCount).toBeLessThanOrEqual(10)
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
  beforeEach(() => resetSpawner())

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
