import { describe, expect, it } from 'vitest'
import { CONFIG } from './config'
import { applyIntent, bounceBack, createPlayerState, jumpParams, stepPlayer, stumble } from './player'
import type { PlayerRuntime } from './types'

const DT = 1 / 60

/** Step the player at 60 fps for `seconds`. */
function simulate(s: PlayerRuntime, seconds: number, speedMult = 1) {
  const frames = Math.round(seconds / DT)
  for (let i = 0; i < frames; i++) stepPlayer(s, DT, speedMult)
}

/** Step until grounded (max 3 s); returns the time taken. */
function untilLanded(s: PlayerRuntime, speedMult = 1): number {
  let t = 0
  while (!s.grounded && t < 3) {
    stepPlayer(s, DT, speedMult)
    t += DT
  }
  return t
}

const AIR_TIME = (2 * CONFIG.jumpVelocity) / CONFIG.gravity

describe('createPlayerState', () => {
  it('starts grounded in the middle lane with clean timers', () => {
    const s = createPlayerState()
    expect(s.lane).toBe(1)
    expect(s.x).toBe(CONFIG.lanes[1])
    expect(s.y).toBe(0)
    expect(s.grounded).toBe(true)
    expect(s.sliding).toBe(false)
    expect(s.jumpBuffer).toBe(0)
    expect(s.stumbleTimer).toBe(0)
  })
})

describe('lanes', () => {
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

  it('remembers the previous lane only on a real change', () => {
    const s = createPlayerState()
    applyIntent(s, 'left') // 1 → 0
    expect(s.prevLane).toBe(1)
    applyIntent(s, 'left') // clamped, no change
    expect(s.prevLane).toBe(1)
  })

  it('allows lane switching mid-air', () => {
    const s = createPlayerState()
    applyIntent(s, 'jump')
    stepPlayer(s, DT)
    applyIntent(s, 'right')
    expect(s.lane).toBe(2)
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

describe('jump', () => {
  it('jumps when grounded and counts the jump', () => {
    const s = createPlayerState()
    applyIntent(s, 'jump')
    expect(s.vy).toBe(CONFIG.jumpVelocity)
    expect(s.grounded).toBe(false)
    expect(s.jumpSeq).toBe(1)
  })

  it('never double-jumps mid-air', () => {
    const s = createPlayerState()
    applyIntent(s, 'jump')
    stepPlayer(s, DT)
    const vy = s.vy
    applyIntent(s, 'jump')
    expect(s.vy).toBe(vy)
    expect(s.jumpSeq).toBe(1)
  })

  it('lands after about 2·v/g seconds and peaks near v²/2g', () => {
    const s = createPlayerState()
    applyIntent(s, 'jump')
    let peak = 0
    let t = 0
    while (!s.grounded) {
      stepPlayer(s, DT)
      peak = Math.max(peak, s.y)
      t += DT
    }
    expect(t).toBeCloseTo(AIR_TIME, 1)
    const expected = CONFIG.jumpVelocity ** 2 / (2 * CONFIG.gravity)
    expect(peak).toBeGreaterThan(expected * 0.95)
    expect(peak).toBeLessThan(expected * 1.05)
  })

  it('jumping out of a slide cancels it instantly', () => {
    const s = createPlayerState()
    applyIntent(s, 'slide')
    stepPlayer(s, DT)
    applyIntent(s, 'jump')
    expect(s.sliding).toBe(false)
    expect(s.grounded).toBe(false)
    expect(s.vy).toBeGreaterThan(0)
  })
})

describe('input buffering', () => {
  it('fires a jump pressed shortly before landing', () => {
    const s = createPlayerState()
    applyIntent(s, 'jump')
    simulate(s, AIR_TIME - 0.1) // ~0.1 s before touchdown
    expect(s.grounded).toBe(false)
    applyIntent(s, 'jump')
    // Step until the buffered jump launches (on the landing frame itself).
    let t = 0
    while (s.jumpSeq < 2 && t < 0.5) {
      stepPlayer(s, DT)
      t += DT
    }
    expect(s.jumpSeq).toBe(2)
    expect(t).toBeLessThan(0.15)
    expect(s.grounded).toBe(false)
    expect(s.vy).toBeGreaterThan(0)
  })

  it('drops a press made too early (past the buffer window)', () => {
    const s = createPlayerState()
    applyIntent(s, 'jump')
    simulate(s, AIR_TIME - (CONFIG.inputBufferTime + 0.1))
    applyIntent(s, 'jump')
    untilLanded(s)
    expect(s.jumpSeq).toBe(1)
    stepPlayer(s, DT)
    expect(s.grounded).toBe(true)
  })
})

describe('slide + fast-fall', () => {
  it('slides when grounded and ends after slideDuration', () => {
    const s = createPlayerState()
    applyIntent(s, 'slide')
    expect(s.slideSeq).toBe(1)
    simulate(s, CONFIG.slideDuration - 0.05)
    expect(s.sliding).toBe(true)
    simulate(s, 0.1)
    expect(s.sliding).toBe(false)
  })

  it('re-pressing slide restarts the timer', () => {
    const s = createPlayerState()
    applyIntent(s, 'slide')
    simulate(s, CONFIG.slideDuration - 0.1)
    applyIntent(s, 'slide')
    expect(s.slideTimer).toBeCloseTo(CONFIG.slideDuration)
    expect(s.slideSeq).toBe(2)
  })

  it('slide mid-air fast-falls, lands sooner, and slides on landing', () => {
    const normal = createPlayerState()
    applyIntent(normal, 'jump')
    simulate(normal, 0.2)
    const normalRemaining = untilLanded(normal)

    const s = createPlayerState()
    applyIntent(s, 'jump')
    simulate(s, 0.2)
    applyIntent(s, 'slide')
    expect(s.vy).toBeLessThanOrEqual(-CONFIG.fastFallVelocity)
    expect(s.fastFalling).toBe(true)
    const fastRemaining = untilLanded(s)

    expect(fastRemaining).toBeLessThan(normalRemaining * 0.6)
    expect(s.sliding).toBe(true)
    expect(s.fastFalling).toBe(false)
    expect(s.slideSeq).toBe(1)
  })

  it('latest input wins: fast-fall then jump → lands and jumps, no slide', () => {
    const s = createPlayerState()
    applyIntent(s, 'jump')
    simulate(s, 0.3)
    applyIntent(s, 'slide')
    applyIntent(s, 'jump')
    untilLanded(s)
    expect(s.sliding).toBe(false)
    expect(s.jumpSeq).toBe(2)
  })
})

describe('speed-scaled jumps', () => {
  it('keeps the same height but shortens air time at 2× speed', () => {
    const base = jumpParams(1)
    const fast = jumpParams(2)
    const height = (p: { velocity: number; gravity: number }) => p.velocity ** 2 / (2 * p.gravity)
    expect(height(fast)).toBeCloseTo(height(base), 5)
    const airFast = (2 * fast.velocity) / fast.gravity
    expect(airFast).toBeCloseTo(AIR_TIME / Math.pow(2, CONFIG.jumpSpeedScaling), 5)
  })

  it('locks gravity at take-off so a speed change mid-air cannot warp the arc', () => {
    const s = createPlayerState()
    applyIntent(s, 'jump', 2)
    const g = s.jumpGravity
    simulate(s, 0.1, 1) // speed drops mid-air (can't really happen, but must be safe)
    expect(s.jumpGravity).toBe(g)
  })
})

describe('stumble', () => {
  it('first stumble survives, a second within the window is fatal', () => {
    const s = createPlayerState()
    expect(stumble(s)).toBe('stumbled')
    expect(s.stumbleTimer).toBe(CONFIG.stumbleWindow)
    expect(s.stumbleSeq).toBe(1)
    simulate(s, 1)
    expect(stumble(s)).toBe('dead')
  })

  it('is survivable again once the window has passed', () => {
    const s = createPlayerState()
    stumble(s)
    simulate(s, CONFIG.stumbleWindow + 0.1)
    expect(s.stumbleTimer).toBe(0)
    expect(stumble(s)).toBe('stumbled')
  })

  it('bounceBack returns to the lane the player came from', () => {
    const s = createPlayerState()
    applyIntent(s, 'right') // 1 → 2
    bounceBack(s)
    expect(s.lane).toBe(1)
  })
})
