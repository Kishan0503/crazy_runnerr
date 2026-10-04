import { describe, expect, it } from 'vitest'
import { createHeightSampler } from './stableHeight'

describe('createHeightSampler', () => {
  it('ignores measurements taken before any pose is applied (bind pose)', () => {
    const sample = createHeightSampler()
    expect(sample(0.02, false)).toBeNull() // bind pose in odd units
    expect(sample(0.02, false)).toBeNull()
  })

  it('accepts a height only after two consecutive posed frames agree', () => {
    const sample = createHeightSampler()
    expect(sample(1.7, true)).toBeNull()
    expect(sample(1.71, true)).toBeCloseTo(1.71)
  })

  it('rejects a jump between frames (pose still settling) and keeps waiting', () => {
    const sample = createHeightSampler()
    expect(sample(0.02, true)).toBeNull()
    expect(sample(1.7, true)).toBeNull() // 85× change → not stable yet
    expect(sample(1.7, true)).toBeCloseTo(1.7)
  })

  it('ignores zero/invalid heights', () => {
    const sample = createHeightSampler()
    expect(sample(0, true)).toBeNull()
    expect(sample(Number.NaN, true)).toBeNull()
  })
})

describe('createHeightSampler (strict: 3 frames within 3%)', () => {
  it('needs three agreeing posed frames', () => {
    const sample = createHeightSampler(0.03, 3)
    expect(sample(1.7, true)).toBeNull()
    expect(sample(1.71, true)).toBeNull()
    expect(sample(1.7, true)).toBeCloseTo(1.7)
  })
  it('restarts the count when the pose stops being "posed" (clip fading)', () => {
    const sample = createHeightSampler(0.03, 3)
    sample(1.7, true)
    sample(1.7, true)
    expect(sample(0.8, false)).toBeNull()
    expect(sample(1.7, true)).toBeNull()
  })
})
