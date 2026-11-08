import { CONFIG } from './config'
import type { ObstacleKind } from './config'
import type { SurfaceKind } from './floor'
import { isPickupActive, pickups, type PickupKind } from './pickups'
import { CELL_KIND, CHUNKS, DEFAULT_ROOF, mirrorRow, tierFor, type ChunkRow } from './chunks'
import { isFair, planHazards, type Hazard, type RoofSpan } from './fairness'

/** One obstacle placement within a spawned row. */
export interface RowObstacle {
  lane: number
  kind: ObstacleKind
}

/** A ramp or roof piece. `offset` pushes it further back than the row line. */
export interface RowSurface {
  lane: number
  kind: SurfaceKind
  length: number
  offset: number
}

/** A run of coins in a lane (or weaving across `lanes`), at an optional height. */
export interface CoinRun {
  lane: number
  count: number
  /** coin centre height (default: COIN_Y on the road) */
  y?: number
  /** extra depth before the first coin (e.g. coins on top of a roof) */
  offset?: number
  /** per-coin lanes for a weaving trail (overrides `lane`) */
  lanes?: number[]
}

/** Everything spawned on one row line (§4.6 fairness rule always holds). */
export interface RowPlan {
  obstacles: RowObstacle[]
  surfaces: RowSurface[]
  coins: CoinRun[]
  pickup: { lane: number; kind: PickupKind } | null
}

const KINDS: ObstacleKind[] = ['low', 'overhead', 'block']
const LANES = CONFIG.lanes.length // 3

/** Probability that a given row also carries a coin run. */
const COIN_ROW_CHANCE = 0.6
/** Coin runs are 1–10 coins, uniformly random, for unpredictable pickups (§4.5). */
const COIN_RUN_MIN = 1
const COIN_RUN_MAX = 10
/** Depth gap between coins in a run. */
export const COIN_SPACING = 2.2

/** Pickup mix (Phase 4A): magnet 35%, 2× 30%, shield 25%, jetpack 10%. */
const PICKUP_WEIGHTS: [PickupKind, number][] = [
  ['magnet', 0.35],
  ['double', 0.3],
  ['shield', 0.25],
  ['jetpack', 0.1],
]
const PICKUP_ROW_CHANCE = 0.3

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const pick = <T,>(list: T[], rng: () => number) => list[Math.floor(rng() * list.length)]

/**
 * Density difficulty 0→1 as a function of distance covered.
 *
 * Held at 0 (sparse, fair: wide spacing + mostly single-lane rows) until
 * `densityStartDistance` — which is the distance where speed reaches its cap.
 * Progression is "speed first, then density": while speed is still ramping the
 * track stays uncrowded; only once the player can't be sped up any further does
 * density climb 0→1 over `difficultyRampDistance`. Smoothstep so it feels organic.
 */
export function difficultyAt(distance: number): number {
  const past = distance - CONFIG.densityStartDistance
  if (past <= 0) return 0
  const t = clamp01(past / CONFIG.difficultyRampDistance)
  return t * t * (3 - 2 * t) // smoothstep
}

interface SpawnerState {
  /** distance accumulated since the last row was spawned */
  sinceLastRow: number
  /** monotonic id source for active obstacles */
  nextId: number
  /** per lane: remaining depth occupied by a ramp+roof (nothing else spawns there) */
  roofLeft: number[]
  /** distance at which the last pickup was placed */
  lastPickupAt: number
  /** queued chunk rows, each with its gap (units) from the previous row */
  queue: { row: ChunkRow; gap: number }[]
  /** whether the "chunk or random?" choice for the next row has been made */
  decided: boolean
  /** hazards / roofs already on the track (absolute arrival distance) for the fairness guard */
  upcoming: Hazard[]
  roofs: RoofSpan[]
}

const spawner: SpawnerState = {
  sinceLastRow: 0,
  nextId: 1,
  roofLeft: [0, 0, 0],
  lastPickupAt: -Infinity,
  queue: [],
  decided: false,
  upcoming: [],
  roofs: [],
}

/** Debug: 'mix' (normal), only chunks, or only random rows. */
export type SpawnMode = 'mix' | 'chunks' | 'random'
let spawnMode: SpawnMode = 'mix'
export const setSpawnMode = (m: SpawnMode) => {
  spawnMode = m
}

export function resetSpawner() {
  forced.length = 0
  spawner.sinceLastRow = 0
  spawner.nextId = 1
  spawner.roofLeft = [0, 0, 0]
  spawner.lastPickupAt = -Infinity
  spawner.queue = []
  spawner.decided = false
  spawner.upcoming = []
  spawner.roofs = []
}

/** Unique id for a freshly spawned obstacle (reset between runs). */
export function nextObstacleId(): number {
  return spawner.nextId++
}

/** Lanes currently covered by a ramp+roof. */
export const occupiedLanes = () => spawner.roofLeft.map((d, lane) => (d > 0 ? lane : -1)).filter((l) => l >= 0)

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
 * block 1–2 lanes — NEVER all of the free lanes — leaving at least one passable
 * road lane. Lanes in `occupied` (covered by a roof) are skipped entirely.
 * `twoLaneChance` is how often a row blocks two lanes (low early, higher later).
 */
export function makeRow(
  twoLaneChance = 0.5,
  rng: () => number = Math.random,
  occupied: number[] = [],
): RowObstacle[] {
  const free = Array.from({ length: LANES }, (_, i) => i).filter((l) => !occupied.includes(l))
  const maxBlock = Math.max(0, free.length - 1) // always leave one free lane open
  const blockCount = Math.min(rng() < twoLaneChance ? 2 : 1, maxBlock)

  // Pick `blockCount` distinct free lanes via a partial Fisher–Yates shuffle.
  const lanes = free.slice()
  for (let i = 0; i < blockCount; i++) {
    const j = i + Math.floor(rng() * (lanes.length - i))
    ;[lanes[i], lanes[j]] = [lanes[j], lanes[i]]
  }
  return lanes.slice(0, blockCount).map((lane) => ({ lane, kind: pick(KINDS, rng) }))
}

/** Context the spawner adds on top of the plain random row (Phase 4A features). */
export interface RowContext {
  /** metres covered (gates pickups / vehicles / roofs) */
  distance?: number
  /** lanes covered by a roof */
  occupied?: number[]
  /** allow a ramp + roof this row */
  allowRoof?: boolean
}

/**
 * Build a full row plan: obstacles (some may become vehicles), an optional
 * ramp+roof, coins in an open lane, and an optional pickup. Coins and pickups
 * only ever go in OPEN lanes (fairness rule §4.6).
 */
export function makeRowPlan(
  twoLaneChance = 0.5,
  rng: () => number = Math.random,
  ctx: RowContext = {},
): RowPlan {
  const distance = ctx.distance ?? 0
  const occupied = ctx.occupied ?? []
  const obstacles = makeRow(twoLaneChance, rng, occupied)

  // Vehicles: some blocked lanes become an oncoming car (jumpable) or truck.
  if (distance >= CONFIG.vehicleStartDistance) {
    const chance = lerp(0.12, 0.28, difficultyAt(distance))
    for (const o of obstacles) if (rng() < chance) o.kind = rng() < 0.7 ? 'car' : 'truck'
  }

  const blocked = new Set([...obstacles.map((o) => o.lane), ...occupied])
  let open = Array.from({ length: LANES }, (_, i) => i).filter((l) => !blocked.has(l))
  const surfaces: RowSurface[] = []
  const coins: CoinRun[] = []

  // Ramp + roof: only when no roof is active, in an open lane, and only if that
  // still leaves another open road lane (you never HAVE to take the ramp).
  if (ctx.allowRoof && occupied.length === 0 && open.length >= 2 && rng() < 0.08) {
    const lane = pick(open, rng)
    const roofLength = 20 + Math.floor(rng() * 17) // 20–36
    surfaces.push({ lane, kind: 'ramp', length: CONFIG.rampLength, offset: 0 })
    surfaces.push({ lane, kind: 'roof', length: roofLength, offset: CONFIG.rampLength })
    // A coin line along the rooftop.
    coins.push({
      lane,
      count: Math.max(3, Math.floor((roofLength - 2) / COIN_SPACING)),
      y: CONFIG.roofHeight + 1.0,
      offset: CONFIG.rampLength + 1,
    })
    open = open.filter((l) => l !== lane)
  }

  // Ground coin run in a random open lane some of the time.
  if (open.length > 0 && rng() < COIN_ROW_CHANCE) {
    coins.push({ lane: pick(open, rng), count: COIN_RUN_MIN + Math.floor(rng() * (COIN_RUN_MAX - COIN_RUN_MIN + 1)) })
  }

  const pickup = maybePickup(open, coins, distance, rng)
  return { obstacles, surfaces, coins, pickup }
}

/**
 * Pickup: spaced out, not before the start distance, never a duplicate of an
 * active one, placed in an open lane (replacing that lane's ground coins).
 */
function maybePickup(open: number[], coins: CoinRun[], distance: number, rng: () => number): RowPlan['pickup'] {
  if (
    open.length === 0 ||
    distance < CONFIG.pickupStartDistance ||
    distance - spawner.lastPickupAt < CONFIG.pickupMinGap ||
    rng() >= PICKUP_ROW_CHANCE
  )
    return null
  const kind = pickPickup(rng)
  if (!kind) return null
  const lane = pick(open, rng)
  spawner.lastPickupAt = distance
  for (let i = coins.length - 1; i >= 0; i--) if (coins[i].lane === lane && coins[i].y === undefined) coins.splice(i, 1)
  return { lane, kind }
}

/** Turn one hand-designed chunk row into a spawnable row plan. */
export function chunkRowPlan(r: ChunkRow, distance = 0, rng: () => number = Math.random): RowPlan {
  const obstacles: RowObstacle[] = []
  const surfaces: RowSurface[] = []
  const coins: CoinRun[] = []
  const open: number[] = []
  r.lanes.split('').forEach((c, lane) => {
    const kind = CELL_KIND[c]
    if (kind) obstacles.push({ lane, kind })
    else if (c === 'R') {
      const length = r.roof ?? DEFAULT_ROOF
      surfaces.push({ lane, kind: 'ramp', length: CONFIG.rampLength, offset: 0 })
      surfaces.push({ lane, kind: 'roof', length, offset: CONFIG.rampLength })
      coins.push({
        lane,
        count: Math.max(3, Math.floor((length - 2) / COIN_SPACING)),
        y: CONFIG.roofHeight + 1,
        offset: CONFIG.rampLength + 1,
      })
    } else if (spawner.roofLeft[lane] <= 0) open.push(lane)
  })
  if (r.coins) coins.push({ lane: r.coins[0], count: r.coins[1] })
  else if (open.length > 0 && rng() < COIN_ROW_CHANCE) {
    coins.push({ lane: pick(open, rng), count: COIN_RUN_MIN + Math.floor(rng() * (COIN_RUN_MAX - COIN_RUN_MIN + 1)) })
  }
  const pickup = maybePickup(open, coins, distance, rng)
  return { obstacles, surfaces, coins, pickup }
}

/** Queue a chunk's rows (mirrored or not). The first row uses firstGap. */
function enqueueChunk(rows: ChunkRow[], firstGap: number, scale: number, mirror: boolean) {
  rows.forEach((r, i) => spawner.queue.push({ row: mirror ? mirrorRow(r) : r, gap: i === 0 ? firstGap : r.gap * scale }))
}

/** Debug: queue a chunk by id so it spawns next. */
export function queueChunk(id: string, mirror = false): boolean {
  const chunk = CHUNKS.find((c) => c.id === id)
  if (!chunk) return false
  spawner.queue = []
  enqueueChunk(chunk.rows, CONFIG.spawnGapMin, 1, mirror)
  spawner.decided = true
  return true
}

/**
 * Runtime fairness guard: if this row + what's already on the track can't be
 * survived by a perfect player, soften it step by step (truck → car, block →
 * low, drop the roof, drop obstacles) until it can. Commits its hazards.
 */
export function guardRow(plan: RowPlan, distance: number, speed: number): RowPlan {
  // Plan for a speed bump mid-flight (tiers step +25%).
  const v = speed * 1.15
  spawner.upcoming = spawner.upcoming.filter((h) => h.at > distance - 4)
  spawner.roofs = spawner.roofs.filter((r) => r.to > distance)
  for (let tries = 0; tries < 12; tries++) {
    const { hazards, roofs } = planHazards(plan, distance, v)
    if (isFair([...spawner.upcoming, ...hazards], [...spawner.roofs, ...roofs], v)) {
      spawner.upcoming.push(...hazards)
      spawner.roofs.push(...roofs)
      return plan
    }
    const truck = plan.obstacles.find((o) => o.kind === 'truck')
    const block = plan.obstacles.find((o) => o.kind === 'block')
    if (truck) truck.kind = 'car'
    else if (block) block.kind = 'low'
    else if (plan.surfaces.length) {
      const lanes = new Set(plan.surfaces.map((s) => s.lane))
      plan.surfaces = []
      plan.coins = plan.coins.filter((c) => !(lanes.has(c.lane) && c.y !== undefined))
    } else plan.obstacles.pop()
  }
  return plan
}

/** Weighted pickup choice, excluding kinds that are already active. */
function pickPickup(rng: () => number): PickupKind | null {
  const options = PICKUP_WEIGHTS.filter(([k]) => !isPickupActive(k))
  const total = options.reduce((s, [, w]) => s + w, 0)
  if (total <= 0) return null
  let r = rng() * total
  for (const [k, w] of options) {
    r -= w
    if (r <= 0) return k
  }
  return options[options.length - 1][0]
}

/** Rows forced to spawn next (debug tools / scripted tests), ahead of the generator. */
const forced: RowPlan[] = []
export function queueRow(plan: Partial<RowPlan>) {
  forced.push({ obstacles: [], surfaces: [], coins: [], pickup: null, ...plan })
}

/** An empty row (no obstacles, coins, or pickups). */
const emptyRow = (): RowPlan => ({ obstacles: [], surfaces: [], coins: [], pickup: null })

/**
 * While a jetpack is up, rows only carry a weaving coin trail at flight height;
 * rows that would arrive around/after the landing stay empty so touchdown is
 * always safe. `arrival` = seconds until this row reaches the runner.
 */
export function jetpackRow(arrival: number, rng: () => number = Math.random): RowPlan {
  const left = pickups.timers.jetpack
  if (arrival > left - 0.4) return emptyRow() // lands before (or as) this row arrives
  const count = 6
  const lanes: number[] = []
  let lane = Math.floor(rng() * LANES)
  for (let i = 0; i < count; i++) {
    if (i > 0 && i % 2 === 0) lane = Math.max(0, Math.min(LANES - 1, lane + (rng() < 0.5 ? -1 : 1)))
    lanes.push(lane)
  }
  const row = emptyRow()
  row.coins.push({ lane: lanes[0], count, y: CONFIG.jetpackHeight + 1.0, lanes })
  return row
}

/**
 * Advance the spawner by this frame's world movement; return a new row plan when
 * the accumulated distance crosses the current gap, otherwise null. Keeps the
 * remainder so cadence stays smooth as the gap tightens (§8.4). `speed` (world
 * units/s) tells the jetpack logic when a row will reach the runner.
 */
export function tickSpawner(dz: number, distance: number, speed: number = CONFIG.speedStart): RowPlan | null {
  for (let l = 0; l < LANES; l++) spawner.roofLeft[l] = Math.max(0, spawner.roofLeft[l] - dz)

  // Forced rows (debug / tests) spawn immediately (not softened, but tracked).
  const next = forced.shift()
  if (next) {
    for (const s of next.surfaces) spawner.roofLeft[s.lane] = Math.max(spawner.roofLeft[s.lane], s.offset + s.length + 2)
    const { hazards, roofs } = planHazards(next, distance, speed)
    spawner.upcoming.push(...hazards)
    spawner.roofs.push(...roofs)
    return next
  }

  // Gentle on-ramp: no obstacles until the player has eased into the run.
  if (distance < CONFIG.spawnWarmup) {
    spawner.sinceLastRow = 0
    return null
  }
  spawner.sinceLastRow += dz
  const difficulty = difficultyAt(distance)

  // Once per row: a hand-designed chunk (25% → 60% with difficulty) or random?
  if (!spawner.decided) {
    spawner.decided = true
    const chance = spawnMode === 'chunks' ? 1 : spawnMode === 'random' ? 0 : lerp(0.25, 0.6, difficulty)
    if (occupiedLanes().length === 0 && !isPickupActive('jetpack') && Math.random() < chance) {
      const tier = tierFor(difficulty, Math.random)
      const chunk = pick(
        CHUNKS.filter((c) => c.tier === tier),
        Math.random,
      )
      enqueueChunk(chunk.rows, currentGap(distance), lerp(1.3, 1, difficulty), Math.random() < 0.5)
    }
  }

  const gap = spawner.queue.length ? spawner.queue[0].gap : currentGap(distance)
  if (spawner.sinceLastRow < gap) return null
  spawner.sinceLastRow -= gap

  // Jetpack: sky coins only, and nothing that would land on the touchdown.
  const arrival = (CONFIG.runnerZ - CONFIG.spawnZ) / Math.max(1, speed)
  if (isPickupActive('jetpack') && arrival < pickups.timers.jetpack + CONFIG.jetpackGrace) {
    spawner.queue = []
    spawner.decided = false
    return jetpackRow(arrival)
  }

  const entry = spawner.queue.shift()
  if (!spawner.queue.length) spawner.decided = false
  const raw = entry
    ? chunkRowPlan(entry.row, distance)
    : makeRowPlan(CONFIG.twoLaneMaxChance * difficulty, Math.random, {
        distance,
        occupied: occupiedLanes(),
        allowRoof: distance >= 200,
      })
  const plan = guardRow(raw, distance, speed)
  for (const s of plan.surfaces) {
    spawner.roofLeft[s.lane] = Math.max(spawner.roofLeft[s.lane], s.offset + s.length + 2)
  }
  return plan
}
