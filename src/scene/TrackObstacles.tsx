import { Suspense, useLayoutEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import {
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  DoubleSide,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  type BufferGeometry,
  type Material,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { CONFIG, HITBOXES, isVehicle, type ObstacleKind } from '../game/config'
import { MODELS, OBSTACLE_SLOTS, type ModelSlot } from '../game/modelRegistry'
import { track } from '../game/track'
import { WARM_Z, WarmTracker } from '../game/warmup'
import { useGameStore } from '../game/store'
import { bakeModel, compileInBackground } from './bakeModel'

/**
 * Obstacles & vehicles (Phase 4P): ONE InstancedMesh per model look, filled
 * every frame from the track simulation's data. Nothing mounts or unmounts
 * during a run, and draw calls = distinct looks on screen, not object count.
 * Vehicles also get instanced headlights and a road "!" warning marker.
 */

/** Max simultaneous instances per look (the busiest rows show ~25 objects in total). */
const CAP = 24
const KINDS: ObstacleKind[] = ['low', 'overhead', 'block', 'car', 'truck']
const VEHICLE_KINDS = ['car', 'truck'] as const
/** Vehicles / ramp load after the loading screen (see modelRegistry DEFERRED). */
const LATE_KINDS = new Set<ObstacleKind>(['car', 'truck'])

/** Live instanced meshes per look, registered by <SlotInstances> once loaded. */
const slotMeshes = new Map<ModelSlot, { meshes: InstancedMesh[]; warm: WarmTracker }>()

function makeInstanced(geometry: BufferGeometry, material: Material, cap = CAP, shadow = true) {
  const m = new InstancedMesh(geometry, material, cap)
  m.instanceMatrix.setUsage(DynamicDrawUsage)
  m.count = 0
  m.visible = false
  m.frustumCulled = false
  m.castShadow = shadow
  return m
}

/** Loads one look, bakes it and registers its instanced meshes. Suspends while loading. */
function SlotInstances({ slot }: { slot: ModelSlot }) {
  const entry = MODELS[slot]
  const { scene } = useGLTF(entry.url)
  const { gl, camera, scene: root } = useThree()
  const meshes = useMemo(() => bakeModel(scene, entry).map((p) => makeInstanced(p.geometry, p.material)), [scene, entry])
  useLayoutEffect(() => {
    let alive = true
    // Compile its shaders in the background (parallel shader compile) BEFORE it
    // is ever drawn, so a look that loads mid-menu can't stall a frame. Only
    // then is it registered for drawing (+ the usual warm-up for shadow passes).
    compileInBackground(gl, camera, root, meshes).then(() => {
      if (alive) slotMeshes.set(slot, { meshes, warm: new WarmTracker() })
    })
    return () => {
      alive = false
      slotMeshes.delete(slot)
      for (const m of meshes) m.dispose()
    }
  }, [slot, meshes, gl, camera, root])
  return (
    <>
      {meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </>
  )
}

// ---- vehicle warnings: headlights + road marker (shared, instanced) ----

let warningTexture: CanvasTexture | null = null
function getWarningTexture() {
  if (warningTexture) return warningTexture
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = '#ff2a2a'
  g.beginPath()
  g.moveTo(64, 8)
  g.lineTo(122, 116)
  g.lineTo(6, 116)
  g.closePath()
  g.fill()
  g.fillStyle = '#ffffff'
  g.font = 'bold 76px sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('!', 64, 78)
  warningTexture = new CanvasTexture(c)
  warningTexture.colorSpace = SRGBColorSpace
  return warningTexture
}

/** Both headlights of one vehicle kind as ONE geometry, on its front face (+Z). */
function headlightGeometry(kind: ObstacleKind): BufferGeometry {
  const [w, , d] = HITBOXES[kind].size
  const y = kind === 'truck' ? 0.75 : 0.55
  const lights = [-1, 1].map((side) => new CircleGeometry(0.13, 16).translate(side * w * 0.32, y, d / 2 + 0.02))
  const geo = mergeGeometries(lights)
  lights.forEach((g) => g.dispose())
  return geo
}

/** Colour-coded hitbox box per kind, drawn while a look is still loading. */
const PLACEHOLDER_COLORS: Record<ObstacleKind, string> = {
  low: '#e23b3b',
  overhead: '#f4b914',
  block: '#bd7b34',
  car: '#3b82f6',
  truck: '#e8e8e8',
}

const tmp = new Matrix4()


export function TrackObstacles() {
  const booted = useGameStore((s) => s.booted)

  // Always-present helpers (created once, never remounted).
  const helpers = useMemo(() => {
    const placeholders = new Map<ObstacleKind, InstancedMesh>()
    for (const kind of KINDS) {
      const [w, h, d] = HITBOXES[kind].size
      const geo = new BoxGeometry(w, h, d).translate(0, HITBOXES[kind].centerY, 0)
      placeholders.set(kind, makeInstanced(geo, new MeshStandardMaterial({ color: PLACEHOLDER_COLORS[kind], roughness: 0.7 })))
    }
    const lightMat = new MeshBasicMaterial({ color: '#fff6d8', toneMapped: false })
    const headlights = new Map<ObstacleKind, InstancedMesh>()
    for (const kind of VEHICLE_KINDS) headlights.set(kind, makeInstanced(headlightGeometry(kind), lightMat, CAP, false))
    const markerGeo = new PlaneGeometry(1.3, 1.3).rotateX(-Math.PI / 2).translate(0, 0.03, 0)
    const markerMat = new MeshBasicMaterial({ map: getWarningTexture(), transparent: true, toneMapped: false, side: DoubleSide, depthWrite: false })
    const marker = makeInstanced(markerGeo, markerMat, CAP, false)
    const all = [...placeholders.values(), ...headlights.values(), marker]
    return { placeholders, headlights, marker, all, warm: new WarmTracker() }
  }, [])

  useFrame(() => {
    // Reset every instanced mesh, then refill from the simulation.
    for (const { meshes } of slotMeshes.values()) for (const m of meshes) m.count = 0
    for (const m of helpers.all) m.count = 0

    const add = (m: InstancedMesh, x: number, y: number, z: number) => {
      if (m.count >= CAP) return
      m.setMatrixAt(m.count++, tmp.makeTranslation(x, y, z))
    }

    for (const o of track.obstacles) {
      if (o.hidden) continue
      const x = CONFIG.lanes[o.lane]
      const looks = OBSTACLE_SLOTS[o.kind]
      const look = slotMeshes.get(looks[o.variant % looks.length])
      if (look) for (const m of look.meshes) add(m, x, 0, o.z)
      else add(helpers.placeholders.get(o.kind)!, x, 0, o.z)
      if (isVehicle(o.kind)) {
        add(helpers.headlights.get(o.kind)!, x, 0, o.z)
        // Road marker 10 units in front of the vehicle (toward the runner).
        add(helpers.marker, x, 0, o.z + HITBOXES[o.kind].size[2] / 2 + 10)
      }
    }

    // Shader warm-up: one hidden dummy per mesh for a few frames (see warmup.ts).
    for (const look of slotMeshes.values()) {
      if (look.warm.shouldWarm()) for (const m of look.meshes) add(m, 0, 0, WARM_Z)
    }
    if (helpers.warm.shouldWarm()) for (const m of helpers.all) add(m, 0, 0, WARM_Z)

    for (const { meshes } of slotMeshes.values()) for (const m of meshes) finish(m)
    for (const m of helpers.all) finish(m)
  })

  // Obstacle looks load with the game; vehicle looks only after the loading
  // screen (keeps the first download small), each in its own Suspense.
  const slots = KINDS.filter((k) => booted || !LATE_KINDS.has(k)).flatMap((k) => OBSTACLE_SLOTS[k])
  return (
    <>
      {helpers.all.map((m, i) => (
        <primitive key={`h${i}`} object={m} />
      ))}
      {slots.map((slot) => (
        <Suspense key={slot} fallback={null}>
          <SlotInstances slot={slot} />
        </Suspense>
      ))}
    </>
  )
}

function finish(m: InstancedMesh) {
  m.visible = m.count > 0
  if (m.visible) m.instanceMatrix.needsUpdate = true
}
