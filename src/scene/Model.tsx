import { Component, Suspense, useLayoutEffect, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import { useGLTF } from '@react-three/drei'
import { Box3, Group, Mesh, type Material } from 'three'
import { prepareMaterial } from './bakeModel'
import { MODELS } from '../game/modelRegistry'
import type { ModelSlot } from '../game/modelRegistry'

/**
 * Loads a registry model, tints it, and drops it onto the ground so its base
 * sits at y=0 regardless of the source model's origin (PRD §9.3). Suspends while
 * loading; the parent <Suspense> shows the placeholder until it's ready.
 */
function GltfModel({ slot }: { slot: ModelSlot }) {
  const { url, scale, rotationY = 0, tint, glow = 0 } = MODELS[slot]
  const { scene } = useGLTF(url)

  // Clone per instance. Geometry AND materials are shared between instances
  // (cheap); a material is only copied when a tint override needs it.
  const object = useMemo(() => {
    const c = scene.clone(true)
    c.traverse((o) => {
      const mesh = o as Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.material = prepareMaterial(mesh.material as Material, glow, tint)
    })
    return c
  }, [scene, tint, glow])

  const group = useRef<Group>(null)
  useLayoutEffect(() => {
    const g = group.current
    if (!g) return
    g.position.y = 0
    g.updateWorldMatrix(true, true)
    const box = new Box3().setFromObject(g)
    g.position.y = -box.min.y // base to ground
  }, [object, scale, rotationY])

  const s: [number, number, number] = Array.isArray(scale) ? scale : [scale, scale, scale]
  return (
    <group ref={group} scale={s} rotation={[0, rotationY, 0]}>
      <primitive object={object} />
    </group>
  )
}

/** Falls back to the placeholder if a model fails to load (missing/invalid, §9.3). */
export class ModelBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    console.warn('[models] load failed; using placeholder.', error)
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

/**
 * Renders the registry model for a slot, with a placeholder fallback shown both
 * while loading (Suspense) and if the model is missing/broken (ErrorBoundary),
 * so the game never hard-crashes on a bad asset (PRD §8.5, §9.3).
 */
export function Model({ slot, fallback }: { slot: ModelSlot; fallback: ReactNode }) {
  return (
    <Suspense fallback={fallback}>
      <ModelBoundary fallback={fallback}>
        <GltfModel slot={slot} />
      </ModelBoundary>
    </Suspense>
  )
}
