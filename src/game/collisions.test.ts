import { describe, expect, it } from 'vitest'
import { CONFIG, HITBOXES, PLAYER_SIZE } from './config'
import type { ObstacleKind } from './config'
import { COIN_PICKUP_Z, classifyHit, collectsCoin, hits, overlap } from './collisions'
import { createPlayerState, jumpParams } from './player'
import type { PlayerRuntime } from './types'

const Z = CONFIG.runnerZ // obstacle level with the player
const MAX_JUMP_HEIGHT = CONFIG.jumpVelocity ** 2 / (2 * CONFIG.gravity)
const KINDS: ObstacleKind[] = ['low', 'overhead', 'block']

/** Player standing in `lane` (target lane AND eased x at its center). */
function playerAt(patch: Partial<PlayerRuntime> = {}, lane = 1): PlayerRuntime {
  return { ...createPlayerState(), lane, x: CONFIG.lanes[lane], ...patch }
}

describe('hits — lanes use the real (eased) x position', () => {
  it('is safe when standing in a neighbouring lane, for every kind', () => {
    for (const kind of KINDS) {
      expect(hits(playerAt({}, 0), kind, 1, Z)).toBe(false)
      expect(hits(playerAt({}, 2), kind, 1, Z)).toBe(false)
    }
  })

  it('collides while crossing into the obstacle lane, before the target lane matters', () => {
    // Target lane is still 0, but the body is 80% of the way into lane 1.
    const x = CONFIG.lanes[0] + (CONFIG.lanes[1] - CONFIG.lanes[0]) * 0.8
    expect(hits(playerAt({ x }, 0), 'block', 1, Z)).toBe(true)
  })

  it('does not collide when only brushing the edge (SIDE_FORGIVE)', () => {
    const x = CONFIG.lanes[0] + (CONFIG.lanes[1] - CONFIG.lanes[0]) * 0.4
    expect(overlap(playerAt({ x }, 0), 'block', 1, Z).x).toBe(false)
  })

  it('is safe when the obstacle is far ahead or behind', () => {
    expect(hits(playerAt(), 'block', 1, Z - 5)).toBe(false)
    expect(hits(playerAt(), 'block', 1, Z + 5)).toBe(false)
  })

  it('forgives a sliver of depth overlap (DEPTH_FORGIVE)', () => {
    const exactTouch = HITBOXES.block.size[2] / 2 + PLAYER_SIZE.depth / 2
    expect(hits(playerAt(), 'block', 1, Z - (exactTouch - 0.05))).toBe(false)
    expect(hits(playerAt(), 'block', 1, Z - 0.2)).toBe(true)
  })
})

describe('hits — obstacle kinds (§4.3)', () => {
  it('low barrier: hit standing, cleared by jumping', () => {
    expect(hits(playerAt(), 'low', 1, Z)).toBe(true)
    expect(hits(playerAt({ y: 1.0, grounded: false }), 'low', 1, Z)).toBe(false)
  })

  it('low barrier cannot be cleared by sliding', () => {
    expect(hits(playerAt({ sliding: true, scaleY: CONFIG.slideScale }), 'low', 1, Z)).toBe(true)
  })

  it('overhead bar: hit standing, cleared by sliding', () => {
    expect(hits(playerAt(), 'overhead', 1, Z)).toBe(true)
    expect(hits(playerAt({ sliding: true, scaleY: CONFIG.slideScale }), 'overhead', 1, Z)).toBe(false)
  })

  it('block: hit standing, sliding, and at the top of a jump', () => {
    expect(hits(playerAt(), 'block', 1, Z)).toBe(true)
    expect(hits(playerAt({ sliding: true, scaleY: CONFIG.slideScale }), 'block', 1, Z)).toBe(true)
    expect(hits(playerAt({ y: MAX_JUMP_HEIGHT, grounded: false }), 'block', 1, Z)).toBe(true)
  })

  it('jump peak clears a low barrier at every speed tier', () => {
    const lowTop = HITBOXES.low.centerY + HITBOXES.low.size[1] / 2
    for (const mult of [1, 1.25, 1.5, 1.75, 2]) {
      const { velocity, gravity } = jumpParams(mult)
      expect(velocity ** 2 / (2 * gravity)).toBeGreaterThan(lowTop + 0.5)
    }
  })
})

describe('classifyHit', () => {
  it('ran into the face of an obstacle in your lane → headOn', () => {
    expect(classifyHit(true, false, 1, 1)).toBe('headOn')
  })

  it('swerved into the side of an obstacle beside you → side', () => {
    expect(classifyHit(false, true, 1, 1)).toBe('side')
  })

  it('already leaving the obstacle lane (late dodge / corner) → clip', () => {
    expect(classifyHit(true, false, 0, 1)).toBe('clip')
    expect(classifyHit(false, true, 2, 1)).toBe('clip')
  })

  it('treats an all-at-once overlap in your lane as headOn', () => {
    expect(classifyHit(false, false, 1, 1)).toBe('headOn')
  })
})

describe('collectsCoin (§4.5)', () => {
  it('collects in the same lane within pickup depth, at any height', () => {
    expect(collectsCoin(playerAt(), 1, Z)).toBe(true)
    expect(collectsCoin(playerAt({ y: MAX_JUMP_HEIGHT }), 1, Z + COIN_PICKUP_Z * 0.9)).toBe(true)
    expect(collectsCoin(playerAt({ sliding: true, scaleY: CONFIG.slideScale }), 1, Z)).toBe(true)
  })

  it('misses in another lane or out of depth range', () => {
    expect(collectsCoin(playerAt({}, 0), 1, Z)).toBe(false)
    expect(collectsCoin(playerAt(), 1, Z + COIN_PICKUP_Z + 0.01)).toBe(false)
  })
})
