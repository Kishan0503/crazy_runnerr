import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CONFIG } from './config'
import { CHUNKS, DEFAULT_ROOF, mirrorRow, type Chunk } from './chunks'
import { isFair, planHazards, type Hazard, type RoofSpan } from './fairness'
import { chunkRowPlan, resetSpawner, setSpawnMode, tickSpawner, type RowPlan } from './spawn'
import { resetPickups } from './pickups'

/** Every speed tier: 1.0× … 2.0× of the base speed. */
const SPEEDS = [1, 1.25, 1.5, 1.75, 2].map((m) => CONFIG.speedStart * m)

/** Seeded RNG so failures are reproducible. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Lay a chunk out on the track and collect its hazards at `speed`. */
function chunkTimeline(chunk: Chunk, speed: number, scale: number, mirror: boolean) {
  const hazards: Hazard[] = []
  const roofs: RoofSpan[] = []
  let at = 0
  chunk.rows.forEach((r, i) => {
    if (i > 0) at += r.gap * scale
    const plan = chunkRowPlan(mirror ? mirrorRow(r) : r, 0, () => 0.99)
    const h = planHazards(plan, at, speed)
    hazards.push(...h.hazards)
    roofs.push(...h.roofs)
  })
  return { hazards, roofs }
}

beforeEach(() => {
  resetSpawner()
  resetPickups()
})

describe('chunk definitions', () => {
  it('has ~25 chunks across the three tiers, with unique ids', () => {
    expect(CHUNKS.filter((c) => c.tier === 'easy')).toHaveLength(9)
    expect(CHUNKS.filter((c) => c.tier === 'medium')).toHaveLength(10)
    expect(CHUNKS.filter((c) => c.tier === 'hard')).toHaveLength(6)
    expect(new Set(CHUNKS.map((c) => c.id)).size).toBe(CHUNKS.length)
  })

  it('uses only valid lane characters, 3 lanes per row', () => {
    for (const c of CHUNKS) for (const r of c.rows) expect(r.lanes, c.id).toMatch(/^[.LOBCTR]{3}$/)
  })

  it('keeps every lane under a roof clear', () => {
    for (const c of CHUNKS) {
      let at = 0
      const spans: { lane: number; from: number; to: number }[] = []
      c.rows.forEach((r, i) => {
        if (i > 0) at += r.gap
        for (const s of spans) if (at > s.from && at <= s.to) expect(r.lanes[s.lane], `${c.id} row ${i}`).toBe('.')
        r.lanes.split('').forEach((ch, lane) => {
          if (ch === 'R') spans.push({ lane, from: at, to: at + CONFIG.rampLength + (r.roof ?? DEFAULT_ROOF) })
        })
      })
    }
  })

  it('never fully blocks a row with walls', () => {
    for (const c of CHUNKS) for (const r of c.rows) expect(r.lanes.replace(/[BT]/g, '').length, c.id).toBeGreaterThan(0)
  })
})

describe('fairness checker', () => {
  const at = (lanes: string, d: number, speed = 32) => planHazards(chunkRowPlan({ gap: 0, lanes }, 0, () => 0.99), d, speed)
  const fair = (rows: [string, number][], speed = 32) => {
    const all = rows.map(([l, d]) => at(l, d, speed))
    return isFair(
      all.flatMap((a) => a.hazards),
      all.flatMap((a) => a.roofs),
      speed,
    )
  }

  it('accepts an open lane and rejects a full wall', () => {
    expect(fair([['B.B', 0]])).toBe(true)
    expect(fair([['BBB', 0]])).toBe(false)
  })

  it('rejects a two-lane switch with no time to make it', () => {
    expect(fair([['BB.', 0], ['.BB', 3]])).toBe(false)
    expect(fair([['BB.', 0], ['.BB', 20]])).toBe(true)
  })

  it('rejects jump and slide needed at the same moment in the only lane', () => {
    expect(fair([['BLB', 0], ['BOB', 1]])).toBe(false)
  })

  it('does not let you walk into the side of a roof', () => {
    // Roof in lane 0 (from a ramp at 0); later only lane 0 is open → only via the ramp.
    expect(fair([['R..', 0], ['.BB', 12]])).toBe(true)
    // Forced into lane 2 just before the ramp: can't reach the ramp, can't climb the side.
    expect(fair([['BB.', 0], ['R..', 4], ['.BB', 20]])).toBe(false)
    // Same layout with time to cross over to the ramp is fine.
    expect(fair([['BB.', 0], ['R..', 30], ['.BB', 46]])).toBe(true)
  })

  it('accounts for vehicles arriving before their row', () => {
    // A truck spawned 15 units after a 'B.B' row arrives at the same moment, in the only open lane.
    const speed = CONFIG.speedStart
    const row = at('B.B', 0, speed)
    const lead = 90 - (90 * speed) / (speed + CONFIG.truckSpeed) // how far ahead the truck gets
    const truck = at('.T.', lead, speed)
    expect(isFair([...row.hazards, ...truck.hazards], [], speed)).toBe(false)
  })
})

describe('every chunk is fair at every speed tier', () => {
  for (const chunk of CHUNKS) {
    it(chunk.id, () => {
      for (const speed of SPEEDS)
        for (const scale of [1, 1.3])
          for (const mirror of [false, true]) {
            const { hazards, roofs } = chunkTimeline(chunk, speed, scale, mirror)
            expect(isFair(hazards, roofs, speed), `${chunk.id} @${speed} u/s ×${scale}${mirror ? ' mirrored' : ''}`).toBe(true)
          }
    })
  }
})

describe('spawner output stays fair (random rows + chunks + vehicles + roofs)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    setSpawnMode('mix')
  })

  for (const mode of ['mix', 'random', 'chunks'] as const) {
    it(`mode ${mode}: a long hard run is always passable`, () => {
      setSpawnMode(mode)
      for (const seed of [1, 2, 3]) {
        resetSpawner()
        vi.spyOn(Math, 'random').mockImplementation(mulberry32(seed))
        const speed = CONFIG.speedStart * 2
        const hazards: Hazard[] = []
        const roofs: RoofSpan[] = []
        let plans = 0
        // Far past the density ramp → max difficulty, vehicles, roofs.
        for (let d = 5000; d < 9000; d += 0.5) {
          const plan: RowPlan | null = tickSpawner(0.5, d, speed)
          if (!plan) continue
          plans++
          const h = planHazards(plan, d, speed * 1.15)
          hazards.push(...h.hazards)
          roofs.push(...h.roofs)
        }
        expect(plans).toBeGreaterThan(200)
        expect(isFair(hazards, roofs, speed * 1.15), `seed ${seed}`).toBe(true)
        vi.restoreAllMocks()
      }
    })
  }
})
