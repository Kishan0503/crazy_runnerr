import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { world } from '../game/world'

/** Floating height of a coin above the ground. */
export const COIN_Y = 1.0
/** Coin disc radius (~0.6 diameter, §9.2). */
const COIN_RADIUS = 0.3

/**
 * Spinning coin placeholder (PRD §4.5, §9.2). A thin gold disc that gently spins
 * for visual life; coin.glb can drop in later via the model registry (M8). The
 * disc faces down the track and spins about Y for the classic coin shimmer.
 * Movement/collection is handled by the parent ActiveCoin (in ObstacleField).
 */
export function Coin() {
  const spin = useRef<Group>(null)

  useFrame((_, delta) => {
    // Keep spinning even when frozen would look odd; pause with the world.
    if (!world.running) return
    if (spin.current) spin.current.rotation.y += delta * 3
  })

  return (
    <group ref={spin} position={[0, COIN_Y, 0]}>
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[COIN_RADIUS, COIN_RADIUS, 0.08, 20]} />
        <meshStandardMaterial color="#ffcf3f" emissive="#7a5a00" emissiveIntensity={0.4} metalness={0.6} roughness={0.3} />
      </mesh>
    </group>
  )
}
