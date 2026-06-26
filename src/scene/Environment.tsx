import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  InstancedMesh,
  Object3D,
  Points,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three'
import { SCENE_BG, SCENE_HORIZON } from '../game/config'
import { world } from '../game/world'

/**
 * Environment for the elevated cyberpunk highway (latest art direction).
 *
 * The track runs through the middle of a dense city: three depth layers of
 * instanced skyscrapers flank both sides — large near buildings just beyond the
 * rails, medium ones behind, and a tall distant layer dissolving into fog. Every
 * layer scrolls toward the camera and wraps, so the city loops forever; the near
 * layer scrolls at full world speed and far layers slightly slower, so on top of
 * natural 3D perspective the parallax sells continuous forward motion.
 *
 * Premium/minimal, not busy-neon: dark navy masses with sparse blue (and a few
 * amber) emissive windows, soft bloom (added in GameCanvas), atmospheric fog,
 * and a thin drift of floating particles.
 */

/* ----------------------------- shared window map ------------------------- */
/** A reusable emissive façade texture: mostly dark with vertical strips of small
 *  lit windows (mostly cool blue, a few warm). Vertical strips stretch gracefully
 *  on taller instanced buildings. */
function makeWindowTexture() {
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 128
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, 64, 128)
  let seed = 9173
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)
  const cols = 8
  const rows = 22
  const cw = 64 / cols
  const rh = 128 / rows
  for (let cx = 0; cx < cols; cx++) {
    for (let cy = 0; cy < rows; cy++) {
      const r = rnd()
      if (r < 0.62) continue // mostly-dark façade reads more premium than busy neon
      const warm = rnd() < 0.08 // sparse warm windows; city stays cool blue
      const lvl = 0.45 + rnd() * 0.55
      ctx.fillStyle = warm
        ? `rgba(255,${Math.floor(170 * lvl)},${Math.floor(70 * lvl)},1)`
        : `rgba(${Math.floor(90 * lvl)},${Math.floor(160 * lvl)},255,1)`
      ctx.fillRect(cx * cw + cw * 0.22, cy * rh + rh * 0.2, cw * 0.56, rh * 0.5)
    }
  }
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.wrapS = RepeatWrapping
  t.wrapT = RepeatWrapping
  return t
}

/* ------------------------------ gradient sky ----------------------------- */
function GradientSky() {
  const scene = useThree((s) => s.scene)
  const texture = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 4
    c.height = 256
    const ctx = c.getContext('2d')!
    const g = ctx.createLinearGradient(0, 0, 0, 256)
    g.addColorStop(0, '#0b1530')
    g.addColorStop(0.5, SCENE_HORIZON)
    g.addColorStop(0.7, '#080d1a')
    g.addColorStop(1, SCENE_BG)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 4, 256)
    const t = new CanvasTexture(c)
    t.colorSpace = SRGBColorSpace
    return t
  }, [])
  useEffect(() => {
    const prev = scene.background
    scene.background = texture
    return () => {
      scene.background = prev
      texture.dispose()
    }
  }, [scene, texture])
  return null
}

/* -------------------------------- city band ------------------------------ */
const LOOP_START = -140 // far end (deep in fog)
const LOOP_END = 24 // just behind the camera
const LOOP_LEN = LOOP_END - LOOP_START

interface BandSpec {
  count: number
  xMin: number
  xMax: number
  hMin: number
  hMax: number
  wMin: number
  wMax: number
  body: string
  emissive: number
  scroll: number
}

/**
 * One depth layer of skyscrapers flanking both sides of the track. A single
 * InstancedMesh (one draw call) holds the whole layer; only each building's z is
 * advanced per frame and wrapped, so the layer is an endless city corridor.
 */
function CityBand({ spec, windowMap }: { spec: BandSpec; windowMap: CanvasTexture }) {
  const ref = useRef<InstancedMesh>(null)
  const dummy = useMemo(() => new Object3D(), [])

  // Deterministic per-building geometry + z, computed once.
  const data = useMemo(() => {
    let seed = 4096 + spec.count * 31 + Math.round(spec.xMin * 7)
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)
    return Array.from({ length: spec.count }, (_, i) => {
      const side = i % 2 === 0 ? -1 : 1
      const x = side * (spec.xMin + rnd() * (spec.xMax - spec.xMin))
      const z = LOOP_START + (LOOP_LEN / spec.count) * i + (rnd() - 0.5) * (LOOP_LEN / spec.count)
      const w = spec.wMin + rnd() * (spec.wMax - spec.wMin)
      const d = spec.wMin + rnd() * (spec.wMax - spec.wMin)
      const h = spec.hMin + rnd() * (spec.hMax - spec.hMin)
      return { x, z, w, d, h }
    })
  }, [spec])

  const zs = useRef<number[]>(data.map((b) => b.z))
  useEffect(() => {
    zs.current = data.map((b) => b.z)
  }, [data])

  // Tint a few windows per layer (far = dimmer) via emissive intensity; the map
  // supplies the window pattern. Clone the shared map so repeat can differ.
  const map = useMemo(() => {
    const m = windowMap.clone()
    m.needsUpdate = true
    return m
  }, [windowMap])

  useFrame(() => {
    const mesh = ref.current
    if (!mesh) return
    const arr = zs.current
    for (let i = 0; i < spec.count; i++) {
      let z = arr[i] + world.dz * spec.scroll
      if (z > LOOP_END) z -= LOOP_LEN
      arr[i] = z
      const b = data[i]
      dummy.position.set(b.x, b.h / 2, z)
      dummy.scale.set(b.w, b.h, b.d)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, spec.count]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        color={new Color(spec.body)}
        emissive={new Color('#ffffff')}
        emissiveMap={map}
        emissiveIntensity={spec.emissive}
        roughness={0.85}
        metalness={0.1}
      />
    </instancedMesh>
  )
}

const BANDS: BandSpec[] = [
  // Near: large detailed buildings right beyond the guard rails.
  { count: 26, xMin: 6.5, xMax: 13, hMin: 9, hMax: 26, wMin: 3, wMax: 6, body: '#0c1730', emissive: 1.0, scroll: 1.0 },
  // Mid: medium towers behind the near layer.
  { count: 34, xMin: 14, xMax: 30, hMin: 8, hMax: 38, wMin: 4, wMax: 9, body: '#091122', emissive: 0.7, scroll: 0.92 },
  // Far: tall distant skyline dissolving into fog.
  { count: 40, xMin: 30, xMax: 66, hMin: 14, hMax: 60, wMin: 6, wMax: 14, body: '#070d1c', emissive: 0.45, scroll: 0.8 },
]

/* ------------------------------- particles ------------------------------- */
const PARTICLE_COUNT = 130

/** Slow drift of fine blue motes around the track — subtle atmosphere/depth.
 *  They scroll with the world and rise gently, wrapping forever. */
function Particles() {
  const ref = useRef<Points>(null)
  const sprite = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 32
    const ctx = c.getContext('2d')!
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16)
    g.addColorStop(0, 'rgba(150,195,255,0.9)')
    g.addColorStop(1, 'rgba(150,195,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 32, 32)
    return new CanvasTexture(c)
  }, [])

  const geom = useMemo(() => {
    let seed = 271
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)
    const pos = new Float32Array(PARTICLE_COUNT * 3)
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      pos[i * 3] = (rnd() - 0.5) * 40
      pos[i * 3 + 1] = rnd() * 22
      pos[i * 3 + 2] = LOOP_START + rnd() * LOOP_LEN
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(pos, 3))
    return g
  }, [])

  useFrame((_, delta) => {
    const pts = ref.current
    if (!pts) return
    const attr = pts.geometry.getAttribute('position') as BufferAttribute
    const a = attr.array as Float32Array
    const dt = Math.min(delta, 0.05)
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      a[i * 3 + 1] += dt * 0.4 // gentle rise
      let z = a[i * 3 + 2] + world.dz * 0.6
      if (z > LOOP_END) z -= LOOP_LEN
      if (a[i * 3 + 1] > 24) a[i * 3 + 1] = 0
      a[i * 3 + 2] = z
    }
    attr.needsUpdate = true
  })

  return (
    <points ref={ref} geometry={geom} frustumCulled={false}>
      <pointsMaterial
        size={0.22}
        map={sprite}
        color="#9ec3ff"
        transparent
        opacity={0.5}
        depthWrite={false}
        blending={AdditiveBlending}
        sizeAttenuation
        toneMapped={false}
      />
    </points>
  )
}

export function Environment() {
  const windowMap = useMemo(makeWindowTexture, [])
  return (
    <>
      <GradientSky />
      {BANDS.map((spec, i) => (
        <CityBand key={i} spec={spec} windowMap={windowMap} />
      ))}
      <Particles />
    </>
  )
}
