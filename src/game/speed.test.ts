import { describe, expect, it } from 'vitest'
import { CONFIG } from './config'
import { speedMultiplierAt } from './speed'

describe('speedMultiplierAt — stepped tiers', () => {
  it('starts at 1.0x', () => {
    expect(speedMultiplierAt(0)).toBe(1)
  })

  it('steps up exactly at each threshold', () => {
    CONFIG.speedTierThresholds.forEach((t, i) => {
      const expected = Math.min(CONFIG.speedMaxTier, 1 + (i + 1) * CONFIG.speedTierStep)
      expect(speedMultiplierAt(t - 0.1)).toBeCloseTo(1 + i * CONFIG.speedTierStep)
      expect(speedMultiplierAt(t)).toBeCloseTo(expected)
    })
  })

  it('never exceeds speedMaxTier', () => {
    for (const d of [2000, 10_000, 1e6]) {
      expect(speedMultiplierAt(d)).toBe(CONFIG.speedMaxTier)
    }
  })
})
