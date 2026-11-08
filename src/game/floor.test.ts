import { describe, expect, it } from 'vitest'
import { CONFIG } from './config'
import { floorAt, heightAt, surfaceOverlap, type Surface } from './floor'

const Z = CONFIG.runnerZ
const H = CONFIG.roofHeight
const LANE = (i: number) => CONFIG.lanes[i]

/** A ramp whose front edge is `ahead` units past the runner, followed by a 20-long roof. */
function rampAndRoof(lane = 1, rampFront: number = Z) {
  const ramp: Surface = { kind: 'ramp', lane, front: rampFront, length: CONFIG.rampLength }
  const roof: Surface = { kind: 'roof', lane, front: rampFront - CONFIG.rampLength, length: 20 }
  return [ramp, roof]
}

describe('heightAt', () => {
  it('ramps rise from 0 at the front to roof height at the back', () => {
    const [ramp] = rampAndRoof()
    expect(heightAt(ramp, Z)).toBeCloseTo(0)
    expect(heightAt(ramp, Z - CONFIG.rampLength / 2)).toBeCloseTo(H / 2)
    expect(heightAt(ramp, Z - CONFIG.rampLength)).toBeCloseTo(H)
  })
  it('roofs are flat; outside the span there is no surface', () => {
    const roof: Surface = { kind: 'roof', lane: 1, front: Z + 5, length: 20 }
    expect(heightAt(roof, Z)).toBe(H)
    expect(heightAt(roof, Z + 6)).toBeNull()
    expect(heightAt(roof, Z - 16)).toBeNull()
  })
})

describe('floorAt', () => {
  it('is the road (0) with no surface under you', () => {
    expect(floorAt(LANE(1), 0, [])).toBe(0)
  })

  it('follows a ramp you are running up', () => {
    // Ramp front has passed the runner by 3 units → halfway up.
    const list = rampAndRoof(1, Z + CONFIG.rampLength / 2)
    expect(floorAt(LANE(1), H / 2 - 0.05, list)).toBeCloseTo(H / 2)
  })

  it('is the roof height when standing on a roof', () => {
    const roof: Surface = { kind: 'roof', lane: 1, front: Z + 5, length: 20 }
    expect(floorAt(LANE(1), H, [roof])).toBe(H)
  })

  it('ignores a roof you are below (it is a wall, not a floor)', () => {
    const roof: Surface = { kind: 'roof', lane: 1, front: Z + 5, length: 20 }
    expect(floorAt(LANE(1), 0, [roof])).toBe(0)
  })

  it('ignores surfaces in other lanes', () => {
    const roof: Surface = { kind: 'roof', lane: 0, front: Z + 5, length: 20 }
    expect(floorAt(LANE(1), H, [roof])).toBe(0)
  })
})

describe('surfaceOverlap (walls)', () => {
  it('running into a roof front at road level is a wall hit', () => {
    const roof: Surface = { kind: 'roof', lane: 1, front: Z + 0.1, length: 20 }
    expect(surfaceOverlap(roof, LANE(1), 0).wall).toBe(true)
  })

  it('standing on the roof is never a wall hit', () => {
    const roof: Surface = { kind: 'roof', lane: 1, front: Z + 5, length: 20 }
    expect(surfaceOverlap(roof, LANE(1), H).wall).toBe(false)
  })

  it('running up the ramp front-on is never a wall hit (you follow the slope)', () => {
    const [ramp] = rampAndRoof(1, Z + 0.5)
    const y = heightAt(ramp, Z)!
    expect(surfaceOverlap(ramp, LANE(1), y).wall).toBe(false)
  })

  it('swerving into the side of a tall ramp section at road level is a wall hit', () => {
    const [ramp] = rampAndRoof(1, Z + CONFIG.rampLength * 0.8)
    const midway = (LANE(0) + LANE(1)) / 2 + 0.4 // crossing into lane 1
    expect(surfaceOverlap(ramp, midway, 0).wall).toBe(true)
  })

  it('a roof in the neighbouring lane is not a wall while you stay in your lane', () => {
    const roof: Surface = { kind: 'roof', lane: 0, front: Z + 5, length: 20 }
    expect(surfaceOverlap(roof, LANE(1), 0).wall).toBe(false)
  })
})
