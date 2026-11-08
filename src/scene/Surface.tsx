import { Suspense, useLayoutEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import {
  BoxGeometry,
  Color,
  DynamicDrawUsage,
  Float32BufferAttribute,
  InstancedMesh,
  Group,
  MeshBasicMaterial,
  type BufferGeometry,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { CONFIG } from '../game/config'
import { MODELS } from '../game/modelRegistry'
import { track } from '../game/track'
import { WARM_Z, WarmTracker } from '../game/warmup'
import { useGameStore } from '../game/store'
import { bakeModel, compileInBackground } from './bakeModel'

/**
 * Ramps & rooftops (Phase 4A visuals, Phase 4P pooled). Drawn from the track
 * simulation's data — nothing mounts during a run:
 *   - Ramp: the Kenney City Kit road slope, ONE InstancedMesh (fitted 1.8 × roofHeight × 6).
 *   - Roof: a fixed pool of neon blocks (dark body, glowing cyan edges, magenta
 *     front stripes), each a unit-length body stretched to its roof's length.
 * Collision and floor height come from game/floor.ts, never these meshes.
 */
const ROOF_WIDTH = 1.8
/** Roofs alive at once (spawner allows one roof at a time per lane; 6 is ample). */
const ROOF_POOL = 6
const RAMP_CAP = 8

/** Face colours of the neon roof block (BoxGeometry order: +x −x +y −y +z −z). */
const ROOF_FACES = ['#141a2b', '#141a2b', '#262e44', '#141a2b', '#161d30', '#141a2b'].map((c) => new Color(c))

const tmp = new Matrix4()

function Ramps() {
  const entry = MODELS.ramp
  const { scene } = useGLTF(entry.url)
  const parts = useMemo(() => {
    return bakeModel(scene, entry).map((p) => {
      const m = new InstancedMesh(p.geometry, p.material, RAMP_CAP)
      m.instanceMatrix.setUsage(DynamicDrawUsage)
      m.frustumCulled = false
      m.castShadow = true
      m.receiveShadow = true
      m.count = 0
      return m
    })
  }, [scene, entry])
  const warm = useMemo(() => new WarmTracker(), [])
  // Background shader compile first (it loads after the loading screen); not
  // drawn until ready, so it can't stall a frame.
  const { gl, camera, scene: root } = useThree()
  const ready = useMemo(() => ({ ok: false }), [])
  useLayoutEffect(() => {
    compileInBackground(gl, camera, root, parts).then(() => (ready.ok = true))
    return () => parts.forEach((m) => m.dispose())
  }, [parts, gl, camera, root, ready])

  useFrame(() => {
    for (const m of parts) m.count = 0
    if (!ready.ok) {
      for (const m of parts) m.visible = false
      return
    }
    const add = (x: number, z: number) => {
      for (const m of parts) if (m.count < RAMP_CAP) m.setMatrixAt(m.count++, tmp.makeTranslation(x, 0, z))
    }
    for (const s of track.surfaces) if (s.kind === 'ramp') add(CONFIG.lanes[s.lane], s.front - s.length / 2)
    if (warm.shouldWarm()) add(0, WARM_Z)
    for (const m of parts) {
      m.visible = m.count > 0
      if (m.visible) m.instanceMatrix.needsUpdate = true
    }
  })
  return (
    <>
      {parts.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </>
  )
}

/**
 * Neon block rooftops (user's pick): a dark block with glowing cyan strips
 * along both top edges and the front edge, and two magenta stripes across the
 * front. Each pooled roof is a group at its front edge; the body and side strips
 * live in a child stretched to the roof's length (unit-length geometry), the
 * front decorations stay unscaled.
 */
function Roofs() {
  const pool = useMemo(() => {
    const h = CONFIG.roofHeight
    const geo = new BoxGeometry(ROOF_WIDTH, h, 1).translate(0, h / 2, -0.5)
    const colors: number[] = []
    for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) colors.push(ROOF_FACES[f].r, ROOF_FACES[f].g, ROOF_FACES[f].b)
    geo.setAttribute('color', new Float32BufferAttribute(colors, 3))
    const body = new MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.15 })
    // Unlit, HDR-bright, untonemapped → the bloom makes them glow.
    const cyan = new MeshBasicMaterial({ color: new Color('#53e3ff').multiplyScalar(2.2), toneMapped: false })
    // Front decorations (cyan top edge + two magenta stripes) share ONE mesh,
    // coloured per vertex, so a roof costs 3 draw calls instead of 4.
    const front = new MeshBasicMaterial({ vertexColors: true, toneMapped: false })
    const tint = (g: BufferGeometry, hex: string, k: number) => {
      const c = new Color(hex).multiplyScalar(k)
      const n = g.getAttribute('position').count
      g.setAttribute('color', new Float32BufferAttribute(Array.from({ length: n * 3 }, (_, i) => [c.r, c.g, c.b][i % 3]), 3))
      return g
    }
    const sideStrips = mergeGeometries(
      [-1, 1].map((sx) => new BoxGeometry(0.06, 0.06, 1).translate((sx * ROOF_WIDTH) / 2, h, -0.5)),
    )
    const frontDecor = mergeGeometries([
      tint(new BoxGeometry(ROOF_WIDTH + 0.06, 0.06, 0.06).translate(0, h, 0.01), '#53e3ff', 2.2),
      ...[0.55, 0.35].map((f) => tint(new BoxGeometry(ROOF_WIDTH * 0.8, 0.08, 0.04).translate(0, h * f, 0.02), '#ff3df2', 2)),
    ])
    return Array.from({ length: ROOF_POOL }, () => {
      const root = new Group()
      root.visible = false
      const stretch = new Group()
      const block = new Mesh(geo, body)
      block.castShadow = block.receiveShadow = true
      stretch.add(block, new Mesh(sideStrips, cyan))
      root.add(stretch, new Mesh(frontDecor, front))
      // Pooled + warmed behind the camera: never frustum-culled.
      root.traverse((o) => (o.frustumCulled = false))
      return { root, stretch }
    })
  }, [])
  const warm = useMemo(() => new WarmTracker(), [])

  useFrame(() => {
    let i = 0
    const show = (x: number, z: number, length: number) => {
      const r = pool[i++]
      r.root.visible = true
      r.root.position.set(x, 0, z)
      r.stretch.scale.z = length
    }
    for (const s of track.surfaces) if (s.kind === 'roof' && i < ROOF_POOL) show(CONFIG.lanes[s.lane], s.front, s.length)
    if (warm.shouldWarm() && i < ROOF_POOL) show(0, WARM_Z, 1)
    for (; i < ROOF_POOL; i++) pool[i].root.visible = false
  })

  return (
    <>
      {pool.map((r, i) => (
        <primitive key={i} object={r.root} />
      ))}
    </>
  )
}

export function SurfacePool() {
  // The ramp model loads after the loading screen (rooftops appear from 200 m).
  const booted = useGameStore((s) => s.booted)
  return (
    <>
      <Roofs />
      {booted && (
        <Suspense fallback={null}>
          <Ramps />
        </Suspense>
      )}
    </>
  )
}
