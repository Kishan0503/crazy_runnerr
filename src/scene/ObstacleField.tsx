import { useCallback, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { CONFIG } from '../game/config'
import type { ObstacleKind } from '../game/config'
import { world } from '../game/world'
import { player } from '../game/playerState'
import { collectsCoin, hits } from '../game/collisions'
import { nextObstacleId, tickSpawner } from '../game/spawn'
import { useGameStore } from '../game/store'
import { Obstacle } from './Obstacle'
import { Coin } from './Coin'

const COIN_SPACING = 2.2 // depth gap between coins in a run

interface ActiveObs {
  id: number
  kind: ObstacleKind
  lane: number
}

interface ActiveCoinData {
  id: number
  lane: number
  /** index within the 3-coin run, offsets its starting depth */
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
  const gameOver = useGameStore((s) => s.gameOver)

  useFrame(() => {
    if (!world.running) return

    z.current += world.dz
    const g = ref.current
    if (g) g.position.z = z.current

    if (hits(player, kind, lane, z.current)) {
      gameOver()
      return
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
  const ref = useRef<Group>(null)
  const z = useRef(CONFIG.spawnZ - runIndex * COIN_SPACING)
  const collectCoin = useGameStore((s) => s.collectCoin)

  useFrame(() => {
    if (!world.running) return

    z.current += world.dz
    const g = ref.current
    if (g) g.position.z = z.current

    // Collected on lane + depth overlap, regardless of jump/slide pose (§4.5).
    if (collectsCoin(player, lane, z.current)) {
      collectCoin()
      onRemove(id)
      return
    }

    if (z.current > CONFIG.recycleZ) onRemove(id)
  })

  return (
    <group ref={ref} position={[CONFIG.lanes[lane], 0, z.current]}>
      <Coin />
    </group>
  )
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
        ...Array.from({ length: CONFIG.coinsPerRun }, (_, i) => ({
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
    </>
  )
}
