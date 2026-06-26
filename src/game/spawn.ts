import { CONFIG } from './config'
import type { ObstacleKind } from './config'

/** One obstacle placement within a spawned row. */
export interface RowObstacle {
  lane: number
  kind: ObstacleKind
}

/** A full row: obstacles plus an optional coin run in an open lane (§4.5). */
export interface RowPlan {
  obstacles: RowObstacle[]
  /** lane index for a 3-coin run, or null if this row has no coins */
  coinLane: number | null
}

const KINDS: ObstacleKind[] = ['low', 'overhead', 'block']

/** Probability that a given row also carries a coin run. */
const COIN_ROW_CHANCE = 0.6

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/**
 * Difficulty 0→1 as a function of distance covered. 0 right after warm-up, 1 at
 * `difficultyRampDistance`. Smoothstep so the increase feels organic, not linear.
 */
export function difficultyAt(distance: number): number {
  const t = clamp01(distance / CONFIG.difficultyRampDistance)
  return t * t * (3 - 2 * t) // smoothstep
}

interface SpawnerState {
  /** distance accumulated since the last row was spawned */
  sinceLastRow: number
  /** monotonic id source for active obstacles */
  nextId: number
}

const spawner: SpawnerState = { sinceLastRow: 0, nextId: 1 }

export function resetSpawner() {
  spawner.sinceLastRow = 0
  spawner.nextId = 1
}

/** Unique id for a freshly spawned obstacle (reset between runs). */
export function nextObstacleId(): number {
  return spawner.nextId++
}

/**
 * Row cadence (PRD §4.6), now distance-driven for a gentle on-ramp: rows are
 * widely spaced (`spawnGapEarly`) just after warm-up and tighten toward
 * `spawnGapMin` as difficulty climbs with distance.
 */
export function currentGap(distance: number): number {
  return lerp(CONFIG.spawnGapEarly, CONFIG.spawnGapMin, difficultyAt(distance))
}

/**
 * Build one row of obstacles (PRD §4.6 fairness rule, mandatory):
 * block 1–2 lanes — NEVER all three — leaving at least one passable lane.
 * `twoLaneChance` is how often a row blocks two lanes (low early, higher later).
 * Each blocked lane gets a random obstacle type. `rng` is injectable for tests.
 */
export function makeRow(twoLaneChance = 0.5, rng: () => number = Math.random): RowObstacle[] {
  const laneCount = CONFIG.lanes.length // 3
  // 1 or 2 blocked lanes → always ≥1 open lane (fairness).
  const blockCount = rng() < twoLaneChance ? 2 : 1

  // Pick `blockCount` distinct lanes via a partial Fisher–Yates shuffle.
  const lanes = Array.from({ length: laneCount }, (_, i) => i)
  for (let i = 0; i < blockCount; i++) {
    const j = i + Math.floor(rng() * (laneCount - i))
    ;[lanes[i], lanes[j]] = [lanes[j], lanes[i]]
  }

  return lanes.slice(0, blockCount).map((lane) => ({
    lane,
    kind: KINDS[Math.floor(rng() * KINDS.length)],
  }))
}

/**
 * Build a full row plan: obstacles + an optional coin run. Coins prefer OPEN
 * lanes (a lane with no obstacle this row), per the fairness rule (§4.6).
 */
export function makeRowPlan(twoLaneChance = 0.5, rng: () => number = Math.random): RowPlan {
  const obstacles = makeRow(twoLaneChance, rng)
  const blocked = new Set(obstacles.map((o) => o.lane))
  const open = Array.from({ length: CONFIG.lanes.length }, (_, i) => i).filter(
    (l) => !blocked.has(l),
  )

  // Place a coin run in a random open lane some of the time.
  const coinLane =
    open.length > 0 && rng() < COIN_ROW_CHANCE
      ? open[Math.floor(rng() * open.length)]
      : null

  return { obstacles, coinLane }
}

/**
 * Advance the spawner by this frame's world movement; return a new row plan when
 * the accumulated distance crosses the current gap, otherwise null. Keeps the
 * remainder so cadence stays smooth as the gap tightens (§8.4).
 */
export function tickSpawner(dz: number, distance: number): RowPlan | null {
  // Gentle on-ramp: no obstacles until the player has eased into the run.
  if (distance < CONFIG.spawnWarmup) {
    spawner.sinceLastRow = 0
    return null
  }
  spawner.sinceLastRow += dz
  const gap = currentGap(distance)
  if (spawner.sinceLastRow >= gap) {
    spawner.sinceLastRow -= gap
    const twoLaneChance = CONFIG.twoLaneMaxChance * difficultyAt(distance)
    return makeRowPlan(twoLaneChance)
  }
  return null
}
