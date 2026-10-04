import { describe, expect, it, vi } from 'vitest'
import {
  addTrauma,
  bumpStreak,
  coinPitch,
  crossedBest,
  crossedMilestone,
  decayTrauma,
  isNearMiss,
  NEAR_MISS,
} from './feedback'
import { emit, on } from './events'

describe('crossedMilestone', () => {
  it('fires on the frame a multiple of the step is crossed', () => {
    expect(crossedMilestone(480, 505, 500)).toBe(500)
    expect(crossedMilestone(999, 1000, 500)).toBe(1000)
  })
  it('stays quiet otherwise', () => {
    expect(crossedMilestone(505, 600, 500)).toBeNull()
    expect(crossedMilestone(0, 10, 500)).toBeNull()
    expect(crossedMilestone(600, 600, 500)).toBeNull()
  })
})

describe('crossedBest', () => {
  it('fires once when passing the previous best', () => {
    expect(crossedBest(99, 101, 100)).toBe(true)
    expect(crossedBest(101, 102, 100)).toBe(false)
  })
  it('never fires on a first-ever run (best = 0)', () => {
    expect(crossedBest(0, 5, 0)).toBe(false)
  })
})

describe('coin streak', () => {
  it('grows within the window and resets after', () => {
    const s = { count: 0, last: -Infinity }
    expect(bumpStreak(s, 0)).toBe(1)
    expect(bumpStreak(s, 0.4)).toBe(2)
    expect(bumpStreak(s, 0.9)).toBe(3)
    expect(bumpStreak(s, 2.5)).toBe(1)
  })
  it('raises pitch with the streak and caps it', () => {
    expect(coinPitch(1)).toBe(1)
    expect(coinPitch(5)).toBeGreaterThan(coinPitch(2))
    expect(coinPitch(100)).toBe(coinPitch(13))
  })
})

describe('isNearMiss', () => {
  const base = { sinceLeftLane: Infinity, clearance: Infinity, sinceLast: 10 }
  it('late lane dodge counts, early one does not', () => {
    expect(isNearMiss({ ...base, sinceLeftLane: 0.2 })).toBe(true)
    expect(isNearMiss({ ...base, sinceLeftLane: 0.5 })).toBe(false)
  })
  it('tight vertical clearance counts, comfortable one does not', () => {
    expect(isNearMiss({ ...base, clearance: 0.1 })).toBe(true)
    expect(isNearMiss({ ...base, clearance: 0.8 })).toBe(false)
  })
  it('respects the cooldown', () => {
    expect(isNearMiss({ ...base, sinceLeftLane: 0.1, sinceLast: NEAR_MISS.cooldown / 2 })).toBe(false)
  })
})

describe('trauma', () => {
  it('clamps at 1 and decays to 0', () => {
    expect(addTrauma(0.8, 0.5)).toBe(1)
    let t = 1
    for (let i = 0; i < 120; i++) t = decayTrauma(t, 1 / 60)
    expect(t).toBe(0)
  })
})

describe('event bus', () => {
  it('delivers payloads and unsubscribes', () => {
    const fn = vi.fn()
    const off = on('milestone', fn)
    emit('milestone', { meters: 500 })
    expect(fn).toHaveBeenCalledWith({ meters: 500 })
    off()
    emit('milestone', { meters: 1000 })
    expect(fn).toHaveBeenCalledTimes(1)
  })
  it('is safe with no listeners and isolates a throwing listener', () => {
    expect(() => emit('crash')).not.toThrow()
    const good = vi.fn()
    const offBad = on('crash', () => {
      throw new Error('boom')
    })
    const offGood = on('crash', good)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => emit('crash')).not.toThrow()
    expect(good).toHaveBeenCalled()
    offBad()
    offGood()
  })
})
