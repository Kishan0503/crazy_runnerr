import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { SphereGeometry, Mesh, type Group } from 'three'
import { isPickupActive, pickups } from '../game/pickups'
import { CONFIG } from '../game/config'
import { WarmTracker } from '../game/warmup'
import { buildPickupModel, JETPACK_FLAME_NAME } from './pickupModels'
import { makeBubbleMaterial } from './shieldLook'

/** Jetpack size on the runner's back (the pickup model is built ~0.9 m tall). */
const BACKPACK_SCALE = 0.75

/**
 * Pickup effects worn by the runner. Mounted inside the player rig's outer
 * group, so they follow the lane, jumps, flight and the flying lean.
 *   - Shield: a soft glowing bubble; it flickers during the post-hit grace.
 *   - Jetpack: the same model as the pickup, on the back, flames flickering.
 */
export function PickupVisuals() {
  const jet = useRef<Group>(null)
  const t = useRef(0)
  // Shown for a few frames after mount so their shaders compile on the loading
  // screen, not when the first shield / jetpack is picked up (Phase 4P).
  const warm = useMemo(() => new WarmTracker(), [])

  const bubble = useMemo(() => {
    const m = new Mesh(new SphereGeometry(0.95, 32, 20), makeBubbleMaterial())
    m.position.y = CONFIG.runnerHeight * 0.55
    m.frustumCulled = false
    m.visible = false
    return m
  }, [])
  const pack = useMemo(() => {
    const g = buildPickupModel('jetpack')
    g.scale.setScalar(BACKPACK_SCALE)
    // Back of the runner = +Z (it faces down the track, −Z); the pack's window
    // faces +Z too, so the camera behind sees its front.
    g.position.set(0, CONFIG.runnerHeight * 0.6, 0.26)
    g.traverse((o) => (o.frustumCulled = false))
    return { g, flames: g.children.filter((c) => c.name === JETPACK_FLAME_NAME) }
  }, [])

  useFrame((_, delta) => {
    t.current += Math.min(delta, CONFIG.maxFrameDt)
    const warming = warm.shouldWarm()
    const graceFlicker = pickups.grace > 0 && Math.sin(t.current * 40) > 0
    const shieldOn = isPickupActive('shield') || graceFlicker
    bubble.visible = shieldOn || warming
    bubble.scale.setScalar(1 + Math.sin(t.current * 3) * 0.025)
    ;(bubble.material as ReturnType<typeof makeBubbleMaterial>).uniforms.uTime.value = t.current

    const j = jet.current
    if (j) j.visible = isPickupActive('jetpack') || warming
    if (j?.visible) for (const f of pack.flames) f.scale.set(1, 0.8 + Math.random() * 0.6, 1)
  })

  return (
    <>
      <primitive object={bubble} />
      <group ref={jet} visible={false}>
        <primitive object={pack.g} />
      </group>
    </>
  )
}
