import { Edges } from '@react-three/drei'
import { HITBOXES } from '../game/config'
import type { ObstacleKind } from '../game/config'
import type { ModelSlot } from '../game/modelRegistry'
import { Model } from './Model'

/**
 * Obstacle visual (PRD §8.5, §9.2).
 *
 * Renders the registry model for this type (scaled/tinted/grounded to fit the
 * §4.3 hitbox), falling back to a labeled color-coded box of the exact hitbox
 * dimensions while the model loads or if it's missing. Collision always uses the
 * logical hitbox, never this mesh — art and gameplay stay decoupled.
 *
 *   - low      → red jersey barrier   → jump over
 *   - overhead → yellow gate          → slide under
 *   - block    → tall crate           → switch lane
 */
const COLORS: Record<ObstacleKind, string> = {
  low: '#e23b3b',
  overhead: '#f4b914',
  block: '#bd7b34',
}

interface ObstacleProps {
  kind: ObstacleKind
  x?: number
  z?: number
}

export function Obstacle({ kind, x = 0, z = 0 }: ObstacleProps) {
  const spec = HITBOXES[kind]
  return (
    <group position={[x, 0, z]}>
      <Model slot={spec.slot as ModelSlot} fallback={<ObstaclePlaceholder kind={kind} />} />
    </group>
  )
}

/** Color-coded hitbox-sized box, shown while the model loads or if it's missing. */
function ObstaclePlaceholder({ kind }: { kind: ObstacleKind }) {
  const spec = HITBOXES[kind]
  const [w, h, d] = spec.size
  return (
    <mesh position={[0, spec.centerY, 0]} castShadow>
      <boxGeometry args={[w, h, d]} />
      <meshStandardMaterial color={COLORS[kind]} roughness={0.7} metalness={0.05} />
      <Edges color="#0c0e14" lineWidth={1.5} />
    </mesh>
  )
}
