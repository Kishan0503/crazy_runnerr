import { useCallback, useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group, MathUtils } from 'three'
import { CONFIG } from '../game/config'
import type { ObstacleKind } from '../game/config'
import { world } from '../game/world'
import { player } from '../game/playerState'
import { isMagnetActive } from '../game/ability'
import { classifyHit, collectsCoin, overlap, verticalClearance } from '../game/collisions'
import { emit } from '../game/events'
import { bumpStreak, isNearMiss } from '../game/feedback'
import { fx, nowSec } from '../game/fxState'
import { bounceBack, stumble } from '../game/player'
import { nextObstacleId, tickSpawner } from '../game/spawn'
import { useGameStore } from '../game/store'
import { Obstacle } from './Obstacle'
import { CoinField, coinSlots } from './Coin'
import { debugObstacles, useDebugStore } from '../game/debug/flags'

const COIN_SPACING = 2.2 // depth gap between coins in a run
/** Depth past the player at which an obstacle counts as "passed" (near-miss check). */
const PASS_Z = 0.8

interface ActiveObs {
  id: number
  kind: ObstacleKind
  lane: number
}

interface ActiveCoinData {
  id: number
  lane: number
  /** index within the coin run, offsets its starting depth */
  runIndex: number
}

/**
 * One live obstacle. Owns its own z and advances it by world.dz each frame
 * (mutating the mesh directly — no per-frame React state, §8.3). Runs the
 * hitbox collision against the shared player state and recycles past the camera.
 */
function ActiveObstacle({
  id,
  kind,
  lane,
  onRecycle,
}: ActiveObs & { onRecycle: (id: number) => void }) {
  const ref = useRef<Group>(null)
  const z = useRef(CONFIG.spawnZ)
  // Last frame's per-axis overlap — tells a head-on hit from a side swerve.
  const prev = useRef({ x: false, z: false })
  // Once this obstacle caused a stumble it can't hit again (we may still overlap).
  const spent = useRef(false)
  // Near-miss bookkeeping: tightest vertical clearance while level with us,
  // and whether we've already judged this obstacle as it passed.
  const minClearance = useRef(Infinity)
  const judged = useRef(false)
  const crash = useGameStore((s) => s.crash)

  // Dev: register with the hitbox overlay; unregister on recycle/unmount.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    debugObstacles.set(id, { kind, lane, z: z.current })
    return () => void debugObstacles.delete(id)
  }, [id, kind, lane])

  useFrame(() => {
    if (!world.running) return

    z.current += world.dz
    const g = ref.current
    if (g) g.position.z = z.current
    if (import.meta.env.DEV) {
      const dbg = debugObstacles.get(id)
      if (dbg) dbg.z = z.current
    }

    const o = overlap(player, kind, lane, z.current)
    const hit = o.x && o.y && o.z
    // Dev god mode: collisions never end the run or stumble.
    const god = import.meta.env.DEV && useDebugStore.getState().godMode
    if (hit && !spent.current && !god) {
      // Head-on = game over; swerving into its side or clipping a corner while
      // already leaving its lane = a stumble (a second one inside the window kills).
      const kindOfHit = classifyHit(prev.current.x, prev.current.z, player.lane, lane)
      if (kindOfHit === 'headOn' || stumble(player) === 'dead') {
        crash()
        return
      }
      spent.current = true
      if (kindOfHit === 'side') bounceBack(player)
      emit('stumble')
    }
    prev.current.x = o.x
    prev.current.z = o.z

    // Near miss (visual only): judged once, the moment it passes the player
    // without having hit — a late lane dodge or a tight jump/slide over/under.
    if (o.x && o.z && !hit) minClearance.current = Math.min(minClearance.current, verticalClearance(player, kind))
    if (!judged.current && z.current > CONFIG.runnerZ + PASS_Z) {
      judged.current = true
      const now = nowSec()
      if (
        !spent.current &&
        useGameStore.getState().phase === 'playing' &&
        isNearMiss({
          sinceLeftLane: player.lane === lane ? Infinity : now - fx.laneLeftAt[lane],
          clearance: minClearance.current,
          sinceLast: now - fx.lastNearMiss,
        })
      ) {
        fx.lastNearMiss = now
        emit('nearMiss')
      }
    }

    if (z.current > CONFIG.recycleZ) onRecycle(id)
  })

  return (
    <group ref={ref} position={[CONFIG.lanes[lane], 0, CONFIG.spawnZ]}>
      <Obstacle kind={kind} />
    </group>
  )
}

/**
 * One live coin. Scrolls with the world, is collected when the player shares its
 * lane and overlaps in depth (height-independent, §4.5), and recycles otherwise.
 */
function ActiveCoin({
  id,
  lane,
  runIndex,
  onRemove,
}: ActiveCoinData & { onRemove: (id: number) => void }) {
  const z = useRef(CONFIG.spawnZ - runIndex * COIN_SPACING)
  const x = useRef<number>(CONFIG.lanes[lane])
  const collectCoin = useGameStore((s) => s.collectCoin)

  // Drawn by <CoinField/> (one instanced mesh): register our position slot.
  useEffect(() => {
    coinSlots.set(id, { x: x.current, z: z.current })
    return () => void coinSlots.delete(id)
  }, [id])

  useFrame((_, delta) => {
    if (!world.running) return
    const dt = Math.min(delta, 0.05) * world.timeScale

    z.current += world.dz

    // Magnet ability: pull nearby coins (any lane) toward the player, then they
    // get collected by the wider magnet check below (§ ability: magnet).
    const magnet = isMagnetActive()
    if (magnet && z.current > CONFIG.runnerZ - 28 && z.current < CONFIG.recycleZ + 2) {
      x.current = MathUtils.damp(x.current, player.x, 9, dt)
      z.current = MathUtils.damp(z.current, CONFIG.runnerZ, 7, dt)
    }

    const slot = coinSlots.get(id)
    if (slot) {
      slot.x = x.current
      slot.z = z.current
    }

    // Magnet active → collect by 3D proximity (lane-independent); otherwise the
    // normal lane + depth overlap (§4.5).
    const collected = magnet
      ? Math.abs(x.current - player.x) < 0.7 && Math.abs(z.current - CONFIG.runnerZ) < 0.9
      : collectsCoin(player, lane, z.current)
    if (collected) {
      coinSlots.delete(id) // vanish this frame, not on the next React commit
      collectCoin()
      emit('coin', { streak: bumpStreak(fx.streak, nowSec()) })
      onRemove(id)
      return
    }

    if (z.current > CONFIG.recycleZ) onRemove(id)
  })

  return null
}

/**
 * Manages the set of active obstacles AND coins (PRD §8.1, §8.4). React state
 * changes only on spawn/recycle events (a few per second), never per frame —
 * movement and collision/collection live in each child's useFrame. The fairness
 * rule and "coins prefer open lanes" both live in spawn.ts.
 */
export function ObstacleField() {
  // This component is keyed by runId in GameCanvas, so each fresh run mounts a
  // brand-new instance with empty arrays — no stale obstacle can survive into
  // the new run (instant, race-free restart). Resume from pause keeps the field.
  const [obstacles, setObstacles] = useState<ActiveObs[]>([])
  const [coins, setCoins] = useState<ActiveCoinData[]>([])

  const recycleObstacle = useCallback((id: number) => {
    setObstacles((prev) => prev.filter((o) => o.id !== id))
  }, [])
  const removeCoin = useCallback((id: number) => {
    setCoins((prev) => prev.filter((c) => c.id !== id))
  }, [])

  useFrame(() => {
    if (!world.running) return
    const plan = tickSpawner(world.dz, world.distance)
    if (!plan) return

    setObstacles((prev) => [
      ...prev,
      ...plan.obstacles.map((o) => ({ id: nextObstacleId(), kind: o.kind, lane: o.lane })),
    ])

    if (plan.coinLane !== null) {
      const lane = plan.coinLane
      setCoins((prev) => [
        ...prev,
        ...Array.from({ length: plan.coinCount }, (_, i) => ({
          id: nextObstacleId(),
          lane,
          runIndex: i,
        })),
      ])
    }
  })

  return (
    <>
      {obstacles.map((o) => (
        <ActiveObstacle key={o.id} {...o} onRecycle={recycleObstacle} />
      ))}
      {coins.map((c) => (
        <ActiveCoin key={c.id} {...c} onRemove={removeCoin} />
      ))}
      {/* Every coin above is drawn here in one instanced draw call. */}
      <CoinField />
    </>
  )
}
