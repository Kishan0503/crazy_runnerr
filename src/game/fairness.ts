import { CONFIG, isVehicle, type ObstacleKind } from './config'
import type { RowPlan } from './spawn'

/**
 * Fairness checker (Phase 4A §3.4) — the safety net for hand-made chunks AND
 * random rows. It simulates a perfect player through a timeline of hazards and
 * answers "is there at least one way through?".
 *
 * Everything is in ABSOLUTE arrival distance (world units, same scale as
 * world.distance): the distance the world will have covered when the hazard
 * reaches the runner. Static obstacles arrive `ARRIVAL` units after they spawn;
 * vehicles drive toward the runner, so they arrive EARLIER than their row.
 *
 * Player model (deliberately a little conservative):
 *   - one lane change takes LANE_TIME seconds (any time, also mid-air)
 *   - jump / slide clear 'jump' / 'slide' hazards; a 'wall' must be avoided
 *   - switching between a jump and a slide needs NEED_SWITCH seconds
 *   - a ramp lifts you onto its roof; you can't enter a roof lane from the side
 *     at road level (that's a wall), but you can hop roof → roof or drop off
 */
export const LANE_TIME = 0.2
export const NEED_SWITCH = 0.2
/** Hazards closer than this (units) count as simultaneous (hitbox depth). */
export const MERGE = 2.5
/** Units between spawning and reaching the runner for a static object. */
export const ARRIVAL = CONFIG.runnerZ - CONFIG.spawnZ

export type Need = 'jump' | 'slide' | 'wall'
export interface Hazard {
  at: number
  lane: number
  need: Need
}
/** A ramp+roof: ramp foot arrives at `ramp`; the lane is a wall from `from` to `to`. */
export interface RoofSpan {
  lane: number
  ramp: number
  from: number
  to: number
}

const LANES = CONFIG.lanes.length

export function needOf(kind: ObstacleKind): Need {
  switch (kind) {
    case 'low':
    case 'car': // cars are jumpable (roof ≈ 1.3, jump peak ≈ 2.1)
      return 'jump'
    case 'overhead':
      return 'slide'
    default:
      return 'wall' // block, truck
  }
}

/** Arrival distance of a vehicle spawned at `spawnAt` while the world moves at `speed`. */
export function vehicleArrival(spawnAt: number, kind: ObstacleKind, speed: number): number {
  const own = kind === 'car' ? CONFIG.carSpeed : CONFIG.truckSpeed
  return spawnAt + (ARRIVAL * speed) / (speed + own)
}

/** Hazards + roofs of one row plan spawned when the world had covered `spawnAt`. */
export function planHazards(plan: RowPlan, spawnAt: number, speed: number): { hazards: Hazard[]; roofs: RoofSpan[] } {
  const hazards = plan.obstacles.map((o) => ({
    lane: o.lane,
    need: needOf(o.kind),
    at: isVehicle(o.kind) ? vehicleArrival(spawnAt, o.kind, speed) : spawnAt + ARRIVAL,
  }))
  const roofs: RoofSpan[] = []
  for (const s of plan.surfaces) {
    if (s.kind !== 'roof') continue
    const ramp = plan.surfaces.find((r) => r.kind === 'ramp' && r.lane === s.lane)
    const rampAt = spawnAt + ARRIVAL + (ramp ? ramp.offset : s.offset)
    const half = ramp ? ramp.length / 2 : 0
    roofs.push({ lane: s.lane, ramp: rampAt, from: rampAt + half, to: spawnAt + ARRIVAL + s.offset + s.length })
  }
  return { hazards, roofs }
}

interface State {
  lane: number
  roof: boolean
  need: Need | null
  at: number
}

/**
 * True if a perfect player can get through every hazard at `speed` (units/s).
 * The player may start in any lane (hazards are seen ~90 units ahead).
 */
export function isFair(hazards: Hazard[], roofs: RoofSpan[], speed: number): boolean {
  // Checkpoints: clusters of hazard / ramp arrival distances.
  const marks = [...hazards.map((h) => h.at), ...roofs.map((r) => r.ramp)].sort((a, b) => a - b)
  const points: number[] = []
  for (const m of marks) if (!points.length || m - points[points.length - 1] > MERGE) points.push(m)

  let states: State[] = []
  for (let lane = 0; lane < LANES; lane++) {
    states.push({ lane, roof: false, need: null, at: -Infinity })
    states.push({ lane, roof: true, need: null, at: -Infinity })
  }

  for (const p of points) {
    const near = (x: number) => x >= p - 1e-6 && x <= p + MERGE
    // Strongest need per lane at this checkpoint.
    const need: (Need | null)[] = Array(LANES).fill(null)
    for (const h of hazards) {
      if (!near(h.at)) continue
      // Two different needs at once (jump + slide, or anything + wall) = wall.
      const cur = need[h.lane]
      need[h.lane] = !cur || cur === h.need ? h.need : 'wall'
    }
    const covered = (lane: number) => roofs.some((r) => r.lane === lane && p > r.from && p <= r.to)
    const rampAt = (lane: number) => roofs.some((r) => r.lane === lane && near(r.ramp))

    const next = new Map<string, State>()
    for (const s of states) {
      for (let lane = 0; lane < LANES; lane++) {
        const dt = (p - s.at) / speed
        const moves = Math.abs(lane - s.lane)
        if (moves > 0 && moves * LANE_TIME > dt) continue
        let roof: boolean
        if (s.roof && (covered(lane) || rampAt(lane))) roof = true // stay up / hop roof → roof
        else if (rampAt(lane)) roof = true // run up the ramp
        else if (covered(lane)) continue // side of a roof at road level = wall
        else roof = false
        // Roof lanes never carry obstacles, so a rooftop runner ignores them.
        const n = roof ? null : need[lane]
        if (n === 'wall') continue
        if (n && s.need && n !== s.need && dt < NEED_SWITCH) continue
        const key = `${lane}${roof ? 'r' : 'g'}${n ?? ''}`
        if (!next.has(key)) next.set(key, { lane, roof, need: n, at: p })
      }
    }
    if (next.size === 0) return false
    states = [...next.values()]
  }
  return true
}
