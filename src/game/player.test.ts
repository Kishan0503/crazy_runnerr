import { describe, expect, it } from 'vitest'
import { CONFIG } from './config'
import { applyIntent, createPlayerState, stepPlayer } from './player'
import type { PlayerRuntime } from './types'

const DT = 1 / 60

/** Step the player at 60 fps for `seconds`. */
function simulate(s: PlayerRuntime, seconds: number) {
  const frames = Math.round(seconds / DT)
  for (let i = 0; i < frames; i++) stepPlayer(s, DT)
}

describe('createPlayerState', () => {
  it('starts grounded in the middle lane', () => {
    const s = createPlayerState()
    expect(s.lane).toBe(1)
    expect(s.x).toBe(CONFIG.lanes[1])
    expect(s.y).toBe(0)
    expect(s.grounded).toBe(true)
    expect(s.sliding).toBe(false)
  })
})

describe('applyIntent — lanes', () => {
  it('moves one lane per intent and clamps at the edges', () => {
    const s = createPlayerState()
    applyIntent(s, 'left')
    expect(s.lane).toBe(0)
    applyIntent(s, 'left')
    expect(s.lane).toBe(0)
    applyIntent(s, 'right')
    applyIntent(s, 'right')
    applyIntent(s, 'right')
    expect(s.lane).toBe(CONFIG.lanes.length - 1)
  })

  it('allows lane switching mid-air', () => {
    const s = createPlayerState()
    applyIntent(s, 'jump')
    stepPlayer(s, DT)
    applyIntent(s, 'right')
    expect(s.lane).toBe(2)
  })
})

describe('applyIntent — jump / slide rules (current behavior)', () => {
  it('jumps only when grounded', () => {
    const s = createPlayerState()
    applyIntent(s, 'jump')
    expect(s.vy).toBe(CONFIG.jumpVelocity)
    expect(s.grounded).toBe(false)
    stepPlayer(s, DT)
    const vy = s.vy
    applyIntent(s, 'jump') // no double jump
    expect(s.vy).toBe(vy)
  })

  it('cannot jump while sliding', () => {
    const s = createPlayerState()
    applyIntent(s, 'slide')
    applyIntent(s, 'jump')
    expect(s.grounded).toBe(true)
    expect(s.vy).toBe(0)
  })

  it('slides only when grounded', () => {
    const s = createPlayerState()
    applyIntent(s, 'jump')
    stepPlayer(s, DT)
    applyIntent(s, 'slide')
    expect(s.sliding).toBe(false)
  })
})

describe('stepPlayer', () => {
  it('lands after about 2·v/g seconds of air time', () => {
    const s = createPlayerState()
    applyIntent(s, 'jump')
    const airTime = (2 * CONFIG.jumpVelocity) / CONFIG.gravity
    simulate(s, airTime - 0.05)
    expect(s.grounded).toBe(false)
    simulate(s, 0.1)
    expect(s.grounded).toBe(true)
    expect(s.y).toBe(0)
    expect(s.vy).toBe(0)
  })

  it('peaks near v²/2g', () => {
    const s = createPlayerState()
    applyIntent(s, 'jump')
    let peak = 0
    for (let i = 0; i < 120; i++) {
      stepPlayer(s, DT)
      peak = Math.max(peak, s.y)
    }
    const expected = CONFIG.jumpVelocity ** 2 / (2 * CONFIG.gravity)
    expect(peak).toBeGreaterThan(expected * 0.95)
    expect(peak).toBeLessThan(expected * 1.05)
  })

  it('ends a slide after slideDuration', () => {
    const s = createPlayerState()
    applyIntent(s, 'slide')
    simulate(s, CONFIG.slideDuration - 0.05)
    expect(s.sliding).toBe(true)
    simulate(s, 0.1)
    expect(s.sliding).toBe(false)
  })

  it('eases x toward the target lane center', () => {
    const s = createPlayerState()
    applyIntent(s, 'right')
    stepPlayer(s, DT)
    expect(s.x).toBeGreaterThan(CONFIG.lanes[1])
    expect(s.x).toBeLessThan(CONFIG.lanes[2])
    simulate(s, 1)
    expect(s.x).toBeCloseTo(CONFIG.lanes[2], 2)
  })
})
