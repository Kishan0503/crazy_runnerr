import { useMemo, useRef } from 'react'
import { CONFIG } from '../game/config'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { InstancedMesh, Mesh, MeshStandardMaterial, Object3D, type BufferGeometry } from 'three'
import { world } from '../game/world'
import { track } from '../game/track'
import { WARM_Z, WarmTracker } from '../game/warmup'

const COIN_URL = '/models/coin.glb'
/** Max coins on screen at once (rows × up to 10 coins). */
const MAX_COINS = 128

/**
 * All coins in one InstancedMesh: the Kenney gold coin (pre-sized by
 * tools/optimize-models.mjs), spinning and bobbing, with an emissive glow so it
 * catches the bloom.
 */
export function CoinField() {
  const { scene } = useGLTF(COIN_URL)
  const mesh = useRef<InstancedMesh>(null)
  const dummy = useMemo(() => new Object3D(), [])
  const spin = useRef(0)

  const { geometry, material } = useMemo(() => {
    let geometry: BufferGeometry | undefined
    let material: MeshStandardMaterial | undefined
    scene.updateMatrixWorld(true)
    scene.traverse((o) => {
      const m = o as Mesh
      if (m.isMesh && !geometry) {
        // Meshopt-quantized models keep their real scale/offset on the NODE
        // (the vertices are normalized) — bake it in, or the coin renders at
        // the wrong size.
        geometry = m.geometry.clone().applyMatrix4(m.matrixWorld)
        material = (m.material as MeshStandardMaterial).clone()
      }
    })
    if (!geometry || !material) throw new Error('coin.glb has no mesh')
    // Gentle self-glow from its own gold texture (catches the bloom without
    // washing the coin out to flat orange).
    material.emissive.set('#ffffff')
    material.emissiveMap = material.map
    material.emissiveIntensity = 0.45
    material.metalness = 0.5
    material.roughness = 0.3
    material.toneMapped = false
    return { geometry, material }
  }, [scene])

  const warm = useMemo(() => new WarmTracker(), [])

  useFrame((state, delta) => {
    const m = mesh.current
    if (!m) return
    // Spin while the world runs; freeze with it (pause / game over).
    if (world.running) spin.current += Math.min(delta, CONFIG.maxFrameDt) * world.timeScale * 3
    const bob = Math.sin(state.clock.elapsedTime * 3) * 0.06
    let i = 0
    // Coin positions come straight from the track simulation (game/track.ts).
    for (const c of track.coins) {
      if (i >= MAX_COINS) break
      dummy.position.set(c.x, c.y + bob, c.z)
      dummy.rotation.set(0, spin.current, 0)
      dummy.updateMatrix()
      m.setMatrixAt(i++, dummy.matrix)
    }
    if (warm.shouldWarm() && i < MAX_COINS) {
      dummy.position.set(0, 0, WARM_Z)
      dummy.updateMatrix()
      m.setMatrixAt(i++, dummy.matrix)
    }
    m.count = i
    m.visible = i > 0
    if (i > 0) m.instanceMatrix.needsUpdate = true
  })

  return <instancedMesh ref={mesh} args={[geometry, material, MAX_COINS]} castShadow frustumCulled={false} />
}

useGLTF.preload(COIN_URL)
