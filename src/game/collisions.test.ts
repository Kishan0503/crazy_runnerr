import { describe, expect, it } from 'vitest'
import { CONFIG, HITBOXES, PLAYER_SIZE } from './config'
import { COIN_PICKUP_Z, collectsCoin, hits } from './collisions'
import { createPlayerState } from './player'
import type { PlayerRuntime } from './types'

const Z = CONFIG.runnerZ // obstacle level with the player
const MAX_JUMP_HEIGHT = CONFIG.jumpVelocity ** 2 / (2 * CONFIG.gravity)

function playerAt(patch: Partial<PlayerRuntime> = {}): PlayerRuntime {
  return { ...createPlayerState(), ...patch }
}

describe('hits — lanes and depth', () => {
  it('is safe in a different lane', () => {
    expect(hits(playerAt({ lane: 0 }), 'block', 1, Z)).toBe(false)
    expect(hits(playerAt({ lane: 2 }), 'low', 1, Z)).toBe(false)
  })

  it('is safe when the obstacle is far ahead or behind', () => {
    expect(hits(playerAt(), 'block', 1, Z - 5)).toBe(false)
    expect(hits(playerAt(), 'block', 1, Z + 5)).toBe(false)
  })

  it('forgives a sliver of depth overlap (DEPTH_FORGIVE)', () => {
    const exactTouch = HITBOXES.block.size[2] / 2 + PLAYER_SIZE.depth / 2
    // Boxes geometrically overlap by 0.05 but sit inside the forgiveness band.
    expect(hits(playerAt(), 'block', 1, Z - (exactTouch - 0.05))).toBe(false)
    // Deep overlap is a hit.
    expect(hits(playerAt(), 'block', 1, Z - 0.2)).toBe(true)
  })
})

describe('hits — obstacle kinds (§4.3)', () => {
  it('low barrier: hit standing, cleared by jumping', () => {
    expect(hits(playerAt(), 'low', 1, Z)).toBe(true)
    expect(hits(playerAt({ y: 1.0, grounded: false }), 'low', 1, Z)).toBe(false)
  })

  it('low barrier cannot be cleared by sliding', () => {
    const sliding = playerAt({ sliding: true, scaleY: CONFIG.slideScale })
    expect(hits(sliding, 'low', 1, Z)).toBe(true)
  })

  it('overhead bar: hit standing, cleared by sliding', () => {
    expect(hits(playerAt(), 'overhead', 1, Z)).toBe(true)
    const sliding = playerAt({ sliding: true, scaleY: CONFIG.slideScale })
    expect(hits(sliding, 'overhead', 1, Z)).toBe(false)
  })

  it('block: hit standing, sliding, and at the top of a jump', () => {
    expect(hits(playerAt(), 'block', 1, Z)).toBe(true)
    expect(hits(playerAt({ sliding: true, scaleY: CONFIG.slideScale }), 'block', 1, Z)).toBe(true)
    expect(hits(playerAt({ y: MAX_JUMP_HEIGHT, grounded: false }), 'block', 1, Z)).toBe(true)
  })
})

describe('collectsCoin (§4.5)', () => {
  it('collects in the same lane within pickup depth, at any height', () => {
    expect(collectsCoin(playerAt(), 1, Z)).toBe(true)
    expect(collectsCoin(playerAt({ y: MAX_JUMP_HEIGHT }), 1, Z + COIN_PICKUP_Z * 0.9)).toBe(true)
    expect(collectsCoin(playerAt({ sliding: true, scaleY: CONFIG.slideScale }), 1, Z)).toBe(true)
  })

  it('misses in another lane or out of depth range', () => {
    expect(collectsCoin(playerAt({ lane: 0 }), 1, Z)).toBe(false)
    expect(collectsCoin(playerAt(), 1, Z + COIN_PICKUP_Z + 0.01)).toBe(false)
  })
})
