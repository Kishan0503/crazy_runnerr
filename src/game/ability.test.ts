import { describe, expect, it } from 'vitest'
import {
  ABILITY_DEFS,
  ability,
  activateAbility,
  isMagnetActive,
  resetAbility,
  tickAbility,
} from './ability'

const magnet = ABILITY_DEFS.magnet

describe('resetAbility', () => {
  it('disarms when the character has no ability', () => {
    resetAbility(null)
    expect(ability.def).toBeNull()
    expect(ability.charges).toBe(0)
    expect(activateAbility()).toBe(false)
  })

  it('ignores unknown ability ids', () => {
    resetAbility('does-not-exist')
    expect(ability.id).toBeNull()
    expect(ability.charges).toBe(0)
  })

  it('arms magnet with full charges', () => {
    resetAbility('magnet')
    expect(ability.id).toBe('magnet')
    expect(ability.charges).toBe(magnet.maxCharges)
    expect(ability.timer).toBe(0)
  })
})

describe('activateAbility / tickAbility', () => {
  it('spends a charge and starts the timer', () => {
    resetAbility('magnet')
    expect(activateAbility()).toBe(true)
    expect(ability.charges).toBe(magnet.maxCharges - 1)
    expect(ability.timer).toBe(magnet.duration)
    expect(isMagnetActive()).toBe(true)
  })

  it('refuses while already active', () => {
    resetAbility('magnet')
    activateAbility()
    expect(activateAbility()).toBe(false)
    expect(ability.charges).toBe(magnet.maxCharges - 1)
  })

  it('counts down, clamps at 0, and deactivates', () => {
    resetAbility('magnet')
    activateAbility()
    tickAbility(magnet.duration / 2)
    expect(ability.timer).toBeCloseTo(magnet.duration / 2)
    tickAbility(magnet.duration)
    expect(ability.timer).toBe(0)
    expect(isMagnetActive()).toBe(false)
  })

  it('refuses once charges run out', () => {
    resetAbility('magnet')
    for (let i = 0; i < magnet.maxCharges; i++) {
      expect(activateAbility()).toBe(true)
      tickAbility(magnet.duration)
    }
    expect(activateAbility()).toBe(false)
  })
})
