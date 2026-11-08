import { beforeEach, describe, expect, it } from 'vitest'
import { CONFIG } from './config'
import {
  activatePickup,
  coinValue,
  consumeShield,
  inGrace,
  isPickupActive,
  pickups,
  resetPickups,
  tickPickups,
} from './pickups'

beforeEach(() => resetPickups())

describe('pickup timers', () => {
  it('starts, counts down and reports when a pickup ends', () => {
    activatePickup('magnet')
    expect(isPickupActive('magnet')).toBe(true)
    expect(tickPickups(CONFIG.pickupMagnetTime - 0.5)).toEqual([])
    expect(tickPickups(1)).toEqual(['magnet'])
    expect(isPickupActive('magnet')).toBe(false)
  })

  it('refreshes (does not stack) when collected again', () => {
    activatePickup('double')
    tickPickups(6)
    activatePickup('double')
    expect(pickups.timers.double).toBe(CONFIG.pickupDoubleTime)
  })

  it('runs several pickups at once, independently', () => {
    activatePickup('magnet')
    activatePickup('double')
    tickPickups(1)
    expect(isPickupActive('magnet') && isPickupActive('double')).toBe(true)
  })
})

describe('shield', () => {
  it('saves exactly one fatal hit and grants a short grace', () => {
    activatePickup('shield')
    expect(consumeShield()).toBe(true)
    expect(isPickupActive('shield')).toBe(false)
    expect(inGrace()).toBe(true)
    expect(consumeShield()).toBe(false) // no second save
  })

  it('grace runs out', () => {
    activatePickup('shield')
    consumeShield()
    tickPickups(CONFIG.shieldGrace + 0.01)
    expect(inGrace()).toBe(false)
  })

  it('expires unused after its max time', () => {
    activatePickup('shield')
    tickPickups(CONFIG.pickupShieldMax + 0.1)
    expect(consumeShield()).toBe(false)
  })
})

describe('jetpack', () => {
  it('grants landing grace when the flight ends', () => {
    activatePickup('jetpack')
    expect(tickPickups(CONFIG.pickupJetpackTime + 0.01)).toEqual(['jetpack'])
    expect(inGrace()).toBe(true)
    tickPickups(CONFIG.jetpackGrace + 0.01)
    expect(inGrace()).toBe(false)
  })
})

describe('2× coins', () => {
  it('doubles coin value only while active', () => {
    expect(coinValue()).toBe(1)
    activatePickup('double')
    expect(coinValue()).toBe(2)
    tickPickups(CONFIG.pickupDoubleTime + 0.1)
    expect(coinValue()).toBe(1)
  })
})
