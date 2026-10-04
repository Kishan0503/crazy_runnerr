import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { InstancedMesh, Mesh, MeshStandardMaterial, Object3D, type BufferGeometry } from 'three'
import { world } from '../game/world'

/** Floating height of a coin's centre above the ground. */
export const COIN_Y = 1.0
const COIN_URL = '/models/coin.glb'
/** Max coins on screen at once (rows × up to 10 coins). */
const MAX_COINS = 128

/**
 * Live coin positions, written by each ActiveCoin (which owns movement and
 * collection) and drawn by <CoinField/> as ONE instanced mesh — a single draw
 * call for every coin on screen (Phase 3).
 */
export const coinSlots = new Map<number, { x: number; z: number }>()

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

  useEffect(() => () => coinSlots.clear(), [])

  useFrame((state, delta) => {
    const m = mesh.current
    if (!m) return
    // Spin while the world runs; freeze with it (pause / game over).
    if (world.running) spin.current += Math.min(delta, 0.05) * world.timeScale * 3
    const bob = Math.sin(state.clock.elapsedTime * 3) * 0.06
    let i = 0
    for (const c of coinSlots.values()) {
      if (i >= MAX_COINS) break
      dummy.position.set(c.x, COIN_Y + bob, c.z)
      dummy.rotation.set(0, spin.current, 0)
      dummy.updateMatrix()
      m.setMatrixAt(i++, dummy.matrix)
    }
    m.count = i
    m.instanceMatrix.needsUpdate = true
  })

  return <instancedMesh ref={mesh} args={[geometry, material, MAX_COINS]} castShadow frustumCulled={false} />
}

useGLTF.preload(COIN_URL)
