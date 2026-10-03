import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Stats } from '@react-three/drei'
import { BoxGeometry, EdgesGeometry, LineBasicMaterial, LineSegments } from 'three'
import { CONFIG, HITBOXES, PLAYER_SIZE } from '../../game/config'
import { player } from '../../game/playerState'
import { debugObstacles, perfStats, useDebugStore } from '../../game/debug/flags'

/** Max obstacle wireframes drawn at once (live rows rarely exceed ~15 boxes). */
const POOL = 48

/**
 * Dev-only scene additions (Phase 0), lazy-loaded by GameCanvas only in debug
 * mode: the stats.js FPS counter, renderer draw-call stats, and the logical
 * hitbox overlay (what collision actually tests — not the visual meshes).
 */
export default function DebugScene() {
  const enabled = useDebugStore((s) => s.enabled)
  return enabled ? <DebugTools /> : null
}

function DebugTools() {
  const showHitboxes = useDebugStore((s) => s.showHitboxes)
  const gl = useThree((s) => s.gl)

  // Accumulate stats across every render pass in a frame (bloom/vignette render
  // several), then read + reset at the start of the next frame.
  useEffect(() => {
    gl.info.autoReset = false
    return () => {
      gl.info.autoReset = true
    }
  }, [gl])
  useFrame(() => {
    perfStats.drawCalls = gl.info.render.calls
    perfStats.triangles = gl.info.render.triangles
    gl.info.reset()
  }, -100)

  return (
    <>
      {/* Bottom-left so it doesn't cover the HUD's coin pill. */}
      <Stats className="top-auto! bottom-2 left-2!" />
      {showHitboxes && <HitboxOverlay />}
    </>
  )
}

/** Unit-cube wireframe, scaled per box. */
function useUnitEdges() {
  return useMemo(() => new EdgesGeometry(new BoxGeometry(1, 1, 1)), [])
}

function HitboxOverlay() {
  const edges = useUnitEdges()
  const obstacleMat = useMemo(() => new LineBasicMaterial({ color: '#ff3355', depthTest: false }), [])
  const playerMat = useMemo(() => new LineBasicMaterial({ color: '#33ff88', depthTest: false }), [])
  const pool = useMemo(
    () => Array.from({ length: POOL }, () => new LineSegments(edges, obstacleMat)),
    [edges, obstacleMat],
  )
  const playerBox = useMemo(() => new LineSegments(edges, playerMat), [edges, playerMat])

  useFrame(() => {
    // Player: collision uses the TARGET lane (player.lane), not the eased x —
    // drawn exactly as collisions.ts tests it.
    const h = CONFIG.runnerHeight * player.scaleY
    playerBox.position.set(CONFIG.lanes[player.lane], player.y + h / 2, CONFIG.runnerZ)
    playerBox.scale.set(PLAYER_SIZE.width, h, PLAYER_SIZE.depth)

    let i = 0
    for (const o of debugObstacles.values()) {
      if (i >= POOL) break
      const spec = HITBOXES[o.kind]
      const box = pool[i++]
      box.visible = true
      box.position.set(CONFIG.lanes[o.lane], spec.centerY, o.z)
      box.scale.set(...spec.size)
    }
    for (; i < POOL; i++) pool[i].visible = false
  })

  return (
    <group>
      <primitive object={playerBox} />
      {pool.map((b, i) => (
        <primitive key={i} object={b} />
      ))}
    </group>
  )
}
