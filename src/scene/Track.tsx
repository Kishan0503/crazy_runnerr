import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { InstancedMesh, Object3D } from 'three'
import { CONFIG } from '../game/config'
import { world } from '../game/world'

const TRACK_WIDTH = 9
const HALF = TRACK_WIDTH / 2
const RUNG_SPACING = 3 // gap between faint grid cross-ties along the track

/**
 * Faint scrolling grid cross-ties (PRD §3 M3) — the lateral lines of the floor
 * grid. Dim so they read as texture, not as the bright neon edges. One
 * InstancedMesh = one draw call, recycled at the camera plane (§13).
 */
function Rungs() {
  const ref = useRef<InstancedMesh>(null)
  const dummy = useMemo(() => new Object3D(), [])

  const count = Math.ceil((CONFIG.recycleZ - CONFIG.spawnZ) / RUNG_SPACING) + 2
  const span = count * RUNG_SPACING
  const zs = useRef<number[]>(
    Array.from({ length: count }, (_, i) => CONFIG.recycleZ - i * RUNG_SPACING),
  )

  useFrame(() => {
    const mesh = ref.current
    if (!mesh) return
    const arr = zs.current
    for (let i = 0; i < count; i++) {
      let z = arr[i] + world.dz
      if (z > CONFIG.recycleZ) z -= span
      arr[i] = z
      dummy.position.set(0, 0.02, z)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} frustumCulled={false}>
      <boxGeometry args={[TRACK_WIDTH, 0.02, 0.05]} />
      <meshStandardMaterial color="#16233f" emissive="#26406e" emissiveIntensity={0.5} toneMapped={false} />
    </instancedMesh>
  )
}

/**
 * Glowing neon edge dashes that frame the runway (the signature look of the
 * reference). A row of bright emissive segments with gaps runs along one side,
 * scrolling toward the camera and wrapping at the recycle plane. High emissive +
 * toneMapped:false makes the bloom pass light them up.
 */
const DASH_LEN = 2.4
const DASH_GAP = 1.6
const DASH_SPACING = DASH_LEN + DASH_GAP

function NeonEdge({ side }: { side: -1 | 1 }) {
  const ref = useRef<InstancedMesh>(null)
  const dummy = useMemo(() => new Object3D(), [])

  const count = Math.ceil((CONFIG.recycleZ - CONFIG.spawnZ) / DASH_SPACING) + 2
  const span = count * DASH_SPACING
  const zs = useRef<number[]>(
    Array.from({ length: count }, (_, i) => CONFIG.recycleZ - i * DASH_SPACING),
  )
  const x = side * (HALF + 0.12)

  useFrame(() => {
    const mesh = ref.current
    if (!mesh) return
    const arr = zs.current
    for (let i = 0; i < count; i++) {
      let z = arr[i] + world.dz
      if (z > CONFIG.recycleZ) z -= span
      arr[i] = z
      dummy.position.set(x, 0.06, z)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} frustumCulled={false}>
      <boxGeometry args={[0.22, 0.1, DASH_LEN]} />
      <meshStandardMaterial
        color="#0a1830"
        emissive="#4f9dff"
        emissiveIntensity={3.2}
        toneMapped={false}
      />
    </instancedMesh>
  )
}

/**
 * The track: a dark ground plane with a faint blue grid (longitudinal lane lines
 * + scrolling cross-ties) framed by bright scrolling neon edge dashes (PRD §4.1).
 * Collision is unaffected — this is purely the runway's look.
 */
export function Track() {
  const length = CONFIG.recycleZ - CONFIG.spawnZ
  const centerZ = (CONFIG.recycleZ + CONFIG.spawnZ) / 2

  // Longitudinal floor lines: both outer edges + the two lane dividers.
  const [l, , r] = CONFIG.lanes
  const longLines = [-HALF, l / 2, r / 2, HALF]

  return (
    <group>
      {/* Ground plane — near-black with a faint blue cast */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, centerZ]} receiveShadow>
        <planeGeometry args={[TRACK_WIDTH, length]} />
        <meshStandardMaterial color="#080c16" roughness={0.85} metalness={0.15} />
      </mesh>

      {/* Elevated-deck edges: a low glowing rail + a fascia that drops into the
          dark below, so the highway reads as a raised platform above the city.
          Kept low so it never blocks the surrounding skyline. */}
      {[-1, 1].map((s) => (
        <group key={s}>
          {/* low edge rail (subtle, non-blocking) */}
          <mesh position={[s * HALF, 0.18, centerZ]}>
            <boxGeometry args={[0.16, 0.36, length]} />
            <meshStandardMaterial color="#0e1830" emissive="#2f6bff" emissiveIntensity={0.5} toneMapped={false} />
          </mesh>
          {/* fascia dropping below the deck */}
          <mesh position={[s * (HALF + 0.05), -2.6, centerZ]}>
            <boxGeometry args={[0.3, 5.2, length]} />
            <meshStandardMaterial color="#060a14" roughness={1} metalness={0} />
          </mesh>
        </group>
      ))}

      {/* Longitudinal grid lines (faint) */}
      {longLines.map((x) => (
        <mesh key={x} position={[x, 0.015, centerZ]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.05, length]} />
          <meshStandardMaterial color="#1a2a4a" emissive="#2c4a82" emissiveIntensity={0.55} toneMapped={false} />
        </mesh>
      ))}

      <Rungs />
      <NeonEdge side={-1} />
      <NeonEdge side={1} />
    </group>
  )
}
