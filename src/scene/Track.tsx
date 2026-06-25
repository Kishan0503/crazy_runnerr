import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { InstancedMesh, Object3D } from 'three'
import { CONFIG } from '../game/config'
import { world } from '../game/world'

const TRACK_WIDTH = 9
const RUNG_SPACING = 4 // gap between cross-ties along the track

/**
 * Scrolling cross-tie "rungs" that sell the sense of speed (PRD §3 M3).
 *
 * A single InstancedMesh holds the whole pool — one draw call, no per-rung React
 * nodes, no per-frame allocation (§13). Each frame every rung advances by
 * world.dz (+Z, toward the camera) and wraps back to the far end once it passes
 * the recycle plane, so a fixed set of rungs reads as an endless runway.
 */
function Rungs() {
  const ref = useRef<InstancedMesh>(null)
  const dummy = useMemo(() => new Object3D(), [])

  // Enough rungs to cover the runway plus a couple of spares for the wrap.
  const count = Math.ceil((CONFIG.recycleZ - CONFIG.spawnZ) / RUNG_SPACING) + 2
  const span = count * RUNG_SPACING

  // Per-rung z positions, evenly spaced back down the track from the recycle plane.
  const zs = useRef<number[]>(
    Array.from({ length: count }, (_, i) => CONFIG.recycleZ - i * RUNG_SPACING),
  )

  useFrame(() => {
    const mesh = ref.current
    if (!mesh) return
    const arr = zs.current
    for (let i = 0; i < count; i++) {
      let z = arr[i] + world.dz
      // Wrap to the far end once a rung scrolls past the camera/recycle plane.
      if (z > CONFIG.recycleZ) z -= span
      arr[i] = z
      dummy.position.set(0, 0.03, z)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} frustumCulled={false}>
      <boxGeometry args={[TRACK_WIDTH, 0.06, 0.35]} />
      <meshStandardMaterial color="#2c3450" emissive="#39507f" emissiveIntensity={0.5} />
    </instancedMesh>
  )
}

/**
 * The track: a long dark ground plane with lane dividers, side rails, and the
 * scrolling rungs (PRD §4.1). The ground/dividers/rails are static; the rungs
 * move to convey speed.
 */
export function Track() {
  const length = CONFIG.recycleZ - CONFIG.spawnZ // ~102 units
  const centerZ = (CONFIG.recycleZ + CONFIG.spawnZ) / 2

  // Lane boundaries sit halfway between adjacent lane centers.
  const [l, , r] = CONFIG.lanes
  const dividers = [l / 2, r / 2] // x = -1.1, 1.1

  return (
    <group>
      {/* Ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, centerZ]} receiveShadow>
        <planeGeometry args={[TRACK_WIDTH, length]} />
        <meshStandardMaterial color="#1a1f2e" roughness={0.95} metalness={0} />
      </mesh>

      {/* Lane divider lines (thin, faintly glowing) */}
      {dividers.map((x) => (
        <mesh key={x} position={[x, 0.012, centerZ]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.06, length]} />
          <meshStandardMaterial color="#3a4566" emissive="#4a5572" emissiveIntensity={0.6} />
        </mesh>
      ))}

      {/* Side rails to frame the runway */}
      {[-TRACK_WIDTH / 2, TRACK_WIDTH / 2].map((x) => (
        <mesh key={x} position={[x, 0.2, centerZ]}>
          <boxGeometry args={[0.18, 0.4, length]} />
          <meshStandardMaterial color="#2a3145" roughness={0.8} />
        </mesh>
      ))}

      <Rungs />
    </group>
  )
}
