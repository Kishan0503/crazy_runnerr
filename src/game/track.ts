import { MathUtils } from 'three'
import { CONFIG, isVehicle, type ObstacleKind } from './config'
import { world } from './world'
import { player } from './playerState'
import { isMagnetActive } from './ability'
import { classifyHit, COIN_PICKUP_Z, overlap, verticalClearance } from './collisions'
import { emit } from './events'
import { bumpStreak, isNearMiss } from './feedback'
import { fx, nowSec } from './fxState'
import { bounceBack, stumble } from './player'
import { activatePickup, coinValue, consumeShield, inGrace, isPickupActive, type PickupKind } from './pickups'
import { surfaceOverlap, surfaces, type Surface, type SurfaceKind } from './floor'
import { COIN_SPACING, nextObstacleId, tickSpawner, type RowPlan } from './spawn'
import { useGameStore } from './store'
import { debugObstacles, useDebugStore } from './debug/flags'

/**
 * Track simulation (Phase 4P): everything spawned on the road — obstacles &
 * vehicles, ramps & rooftops, coins, pickups — lives here as plain data in
 * reusable pools. ONE `stepTrack()` per frame spawns, moves, collides, collects
 * and recycles. No React state, no per-frame allocations: renderers just read
 * these arrays and write instance matrices.
 */

/** Floating height of a ground coin's centre. */
export const COIN_Y = 1.0
/** Depth past the player at which an obstacle counts as "passed" (near-miss check). */
const PASS_Z = 0.8
/** Distance ahead at which an oncoming vehicle sounds its horn. */
const HORN_DISTANCE = 60
/** Magnet pull range (units ahead of the runner). */
const MAGNET_RANGE = 28

export interface TrackObstacle {
  id: number
  kind: ObstacleKind
  lane: number
  /** look index (random per spawn) into OBSTACLE_SLOTS[kind] */
  variant: number
  z: number
  /** extra speed toward the runner (vehicles) */
  ownSpeed: number
  /** last frame's per-axis overlap — tells a head-on hit from a side swerve */
  prevX: boolean
  prevZ: boolean
  /** caused a stumble / broke a shield: can't hit again */
  spent: boolean
  /** smashed by a shield: no longer drawn */
  hidden: boolean
  minClearance: number
  judged: boolean
  horned: boolean
}

export interface TrackCoin {
  id: number
  lane: number
  x: number
  y: number
  z: number
  /** rooftop / jetpack-trail coin: needs the runner up at its height */
  raised: boolean
}

export interface TrackPickup {
  id: number
  kind: PickupKind
  lane: number
  z: number
}

/** A ramp or rooftop; also registered in floor.ts `surfaces` (same object). */
export interface TrackSurface extends Surface {
  id: number
  prevX: boolean
  prevZ: boolean
  spent: boolean
}

export const track = {
  obstacles: [] as TrackObstacle[],
  coins: [] as TrackCoin[],
  pickups: [] as TrackPickup[],
  surfaces: [] as TrackSurface[],
}

// Free lists: recycled objects are reused, so steady play allocates nothing.
const freeObstacles: TrackObstacle[] = []
const freeCoins: TrackCoin[] = []
const freePickups: TrackPickup[] = []
const freeSurfaces: TrackSurface[] = []

/** Remove index i from an unordered array in O(1) (swap with last). */
function swapRemove<T>(list: T[], i: number): T {
  const item = list[i]
  const last = list.pop()!
  if (i < list.length) list[i] = last
  return item
}

const god = () => import.meta.env.DEV && useDebugStore.getState().godMode

/**
 * A fatal hit (head-on, or a stumble inside the stumble window). A shield or the
 * post-shield / jetpack-landing grace saves the run instead. True = run continues.
 */
function survivesFatalHit(): boolean {
  if (inGrace()) return true
  if (consumeShield()) {
    emit('shieldBreak')
    return true
  }
  return false
}

/** Shared hit handling for obstacles and roof walls. Returns false on a crash. */
function resolveHit(o: { prevX: boolean; prevZ: boolean; spent: boolean }, lane: number): 'crash' | 'saved' | 'stumble' {
  // Head-on = game over; swerving into its side or clipping a corner while
  // already leaving its lane = a stumble (a second one inside the window kills).
  const kindOfHit = classifyHit(o.prevX, o.prevZ, player.lane, lane)
  if (kindOfHit === 'headOn' || (!inGrace() && stumble(player) === 'dead')) {
    if (!survivesFatalHit()) return 'crash'
    o.spent = true
    return 'saved'
  }
  o.spent = true
  if (kindOfHit === 'side') bounceBack(player)
  if (!inGrace()) emit('stumble')
  return 'stumble'
}

// ---------------------------------------------------------------- spawning

function spawnPlan(plan: RowPlan) {
  for (const p of plan.obstacles) {
    const o = freeObstacles.pop() ?? ({} as TrackObstacle)
    o.id = nextObstacleId()
    o.kind = p.kind
    o.lane = p.lane
    o.variant = Math.floor(Math.random() * 840) // any look-list length 1–8 divides evenly
    o.z = CONFIG.spawnZ
    o.ownSpeed = p.kind === 'car' ? CONFIG.carSpeed : p.kind === 'truck' ? CONFIG.truckSpeed : 0
    o.prevX = o.prevZ = o.spent = o.hidden = o.judged = o.horned = false
    o.minClearance = Infinity
    track.obstacles.push(o)
    if (import.meta.env.DEV) debugObstacles.set(o.id, { kind: o.kind, lane: o.lane, z: o.z })
  }
  for (const p of plan.surfaces) {
    const s = freeSurfaces.pop() ?? ({} as TrackSurface)
    s.id = nextObstacleId()
    s.kind = p.kind as SurfaceKind
    s.lane = p.lane
    s.length = p.length
    s.front = CONFIG.spawnZ - p.offset
    s.prevX = s.prevZ = s.spent = false
    track.surfaces.push(s)
    surfaces.set(s.id, s)
  }
  for (const run of plan.coins) {
    for (let i = 0; i < run.count; i++) {
      const c = freeCoins.pop() ?? ({} as TrackCoin)
      c.id = nextObstacleId()
      c.lane = run.lanes?.[i] ?? run.lane
      c.x = CONFIG.lanes[c.lane]
      c.y = run.y ?? COIN_Y
      c.z = CONFIG.spawnZ - (run.offset ?? 0) - i * COIN_SPACING
      c.raised = c.y > COIN_Y + 0.5
      track.coins.push(c)
    }
  }
  if (plan.pickup) {
    const p = freePickups.pop() ?? ({} as TrackPickup)
    p.id = nextObstacleId()
    p.kind = plan.pickup.kind
    p.lane = plan.pickup.lane
    p.z = CONFIG.spawnZ
    track.pickups.push(p)
  }
}

// ---------------------------------------------------------------- per frame

/** Did something moving from z0 to z1 pass within `half` of the runner's depth? */
const crossesRunner = (z0: number, z1: number, half: number) =>
  z1 > CONFIG.runnerZ - half && z0 < CONFIG.runnerZ + half

function stepObstacles(dt: number) {
  const list = track.obstacles
  for (let i = list.length - 1; i >= 0; i--) {
    const o = list[i]
    o.z += world.dz + o.ownSpeed * dt
    if (import.meta.env.DEV) {
      const dbg = debugObstacles.get(o.id)
      if (dbg) dbg.z = o.z
    }

    // Oncoming vehicles honk once when they get close (fair warning).
    if (!o.horned && isVehicle(o.kind) && o.z > CONFIG.runnerZ - HORN_DISTANCE) {
      o.horned = true
      emit('vehicleNear', { kind: o.kind as 'car' | 'truck' })
    }

    const ov = overlap(player, o.kind, o.lane, o.z)
    const hit = ov.x && ov.y && ov.z
    if (hit && !o.spent && !god()) {
      const r = resolveHit(o, o.lane)
      if (r === 'crash') {
        useGameStore.getState().crash()
        return
      }
      if (r === 'saved') o.hidden = true // the shield smashes it out of the way
    }
    o.prevX = ov.x
    o.prevZ = ov.z

    // Near miss (visual only): judged once, the moment it passes the player
    // without having hit — a late lane dodge or a tight jump/slide over/under.
    if (ov.x && ov.z && !hit) o.minClearance = Math.min(o.minClearance, verticalClearance(player, o.kind))
    if (!o.judged && o.z > CONFIG.runnerZ + PASS_Z) {
      o.judged = true
      const now = nowSec()
      if (
        !o.spent &&
        !player.flying &&
        useGameStore.getState().phase === 'playing' &&
        isNearMiss({
          sinceLeftLane: player.lane === o.lane ? Infinity : now - fx.laneLeftAt[o.lane],
          clearance: o.minClearance,
          sinceLast: now - fx.lastNearMiss,
        })
      ) {
        fx.lastNearMiss = now
        emit('nearMiss')
      }
    }

    if (o.z > CONFIG.recycleZ + 4) {
      if (import.meta.env.DEV) debugObstacles.delete(o.id)
      freeObstacles.push(swapRemove(list, i))
    }
  }
}

function stepSurfaces() {
  const list = track.surfaces
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i]
    s.front += world.dz
    if (!player.flying) {
      const ov = surfaceOverlap(s, player.x, player.y)
      if (ov.wall && !s.spent && !god()) {
        if (resolveHit(s, s.lane) === 'crash') {
          useGameStore.getState().crash()
          return
        }
      }
      s.prevX = ov.x
      s.prevZ = ov.z
    }
    if (s.front - s.length > CONFIG.recycleZ) {
      surfaces.delete(s.id)
      freeSurfaces.push(swapRemove(list, i))
    }
  }
}

function stepCoins(dt: number) {
  const list = track.coins
  // Magnet (pickup or legacy ability): pull nearby coins (any lane, any height)
  // toward the runner; they're then collected by proximity.
  const magnet = isPickupActive('magnet') || isMagnetActive()
  for (let i = list.length - 1; i >= 0; i--) {
    const c = list[i]
    const z0 = c.z
    c.z += world.dz
    let collected: boolean
    if (magnet && c.z > CONFIG.runnerZ - MAGNET_RANGE && c.z < CONFIG.recycleZ + 2) {
      c.x = MathUtils.damp(c.x, player.x, 9, dt)
      c.z = MathUtils.damp(c.z, CONFIG.runnerZ, 7, dt)
      c.y = MathUtils.damp(c.y, player.y + 1.0, 7, dt)
      collected = Math.abs(c.x - player.x) < 0.7 && Math.abs(c.z - CONFIG.runnerZ) < 0.9
    } else {
      // Ground coins don't care about jump/slide pose (§4.5); raised coins need
      // the runner up at their height. Swept along z so a long frame can't skip one.
      const atHeight = c.raised ? Math.abs(player.y + 1.0 - c.y) < 1.3 : !player.flying
      collected = atHeight && c.lane === player.lane && crossesRunner(z0, c.z, COIN_PICKUP_Z)
    }
    if (collected) {
      useGameStore.getState().collectCoin(coinValue())
      emit('coin', { streak: bumpStreak(fx.streak, nowSec()) })
      freeCoins.push(swapRemove(list, i))
    } else if (c.z > CONFIG.recycleZ) {
      freeCoins.push(swapRemove(list, i))
    }
  }
}

function stepPickups() {
  const list = track.pickups
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i]
    const z0 = p.z
    p.z += world.dz
    if (!player.flying && p.lane === player.lane && crossesRunner(z0, p.z, COIN_PICKUP_Z)) {
      activatePickup(p.kind)
      emit('pickup', { kind: p.kind })
      freePickups.push(swapRemove(list, i))
    } else if (p.z > CONFIG.recycleZ) {
      freePickups.push(swapRemove(list, i))
    }
  }
}

/**
 * Advance everything on the track by this frame (`world.dz` / `world.dt` are set
 * by GameLoop first). Movement first, then this frame's new row spawns at the
 * horizon (it starts moving next frame).
 */
export function stepTrack() {
  if (!world.running) return
  const dt = world.dt
  stepObstacles(dt)
  stepSurfaces()
  stepCoins(dt)
  stepPickups()
  const plan = tickSpawner(world.dz, world.distance, world.speed)
  if (plan) spawnPlan(plan)
}

/** Clear the track for a fresh run (objects go back to the free lists). */
export function resetTrack() {
  freeObstacles.push(...track.obstacles)
  freeCoins.push(...track.coins)
  freePickups.push(...track.pickups)
  freeSurfaces.push(...track.surfaces)
  track.obstacles.length = 0
  track.coins.length = 0
  track.pickups.length = 0
  track.surfaces.length = 0
  surfaces.clear()
  if (import.meta.env.DEV) debugObstacles.clear()
}

/** Test helper: spawn a row plan directly. */
export const spawnPlanForTest = spawnPlan
