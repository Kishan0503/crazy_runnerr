import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Shape,
  SphereGeometry,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
  BoxGeometry,
  type BufferGeometry,
  type Material,
  type Object3D,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { PickupKind } from '../game/pickups'

/**
 * Pickup models (art pass, 2026-11): chunky low-poly icons built in code to the
 * user's reference — bevelled shapes, bright flat-shaded colours, a little
 * self-glow for the night city, and a soft coloured glow on the road below.
 * No downloads; every model is a handful of small meshes. Built once and shared.
 *
 * Each builder returns a Group centred on its middle, ~0.8 units tall, facing +Z
 * (toward the runner / camera).
 */

const solid = (color: string, o: Partial<{ metalness: number; roughness: number; emissive: number }> = {}) =>
  new MeshStandardMaterial({
    color,
    flatShading: true,
    metalness: o.metalness ?? 0.08,
    roughness: o.roughness ?? 0.45,
    emissive: new Color(color),
    emissiveIntensity: o.emissive ?? 0.12,
  })
const glowing = (color: string, intensity = 1.6) =>
  new MeshStandardMaterial({ color, emissive: new Color(color), emissiveIntensity: intensity, flatShading: true, toneMapped: false })

function part(geo: BufferGeometry, mat: Material, pos: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0]) {
  const m = new Mesh(geo, mat)
  m.position.set(...pos)
  m.rotation.set(...rot)
  m.castShadow = true
  return m
}

function poly(points: [number, number][], scale = 1) {
  const s = new Shape()
  points.forEach(([x, y], i) => (i ? s.lineTo(x * scale, y * scale) : s.moveTo(x * scale, y * scale)))
  s.closePath()
  return s
}

/** Extruded, bevelled slab centred on z = 0 (the bevel gives the chunky "toy" edge). */
function slab(shape: Shape, depth: number, bevel: number) {
  const g = new ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1 })
  g.translate(0, 0, -depth / 2)
  return g
}

function starShape(outer: number, inner: number) {
  const pts: [number, number][] = []
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? inner : outer
    const a = Math.PI / 2 + (i * Math.PI) / 5
    pts.push([Math.cos(a) * r, Math.sin(a) * r])
  }
  return poly(pts)
}

// ------------------------------------------------------------------ shield
const SHIELD: [number, number][] = [
  [0, 0.41], [0.2, 0.36], [0.35, 0.3], [0.36, 0.03], [0.24, -0.22], [0, -0.41], [-0.24, -0.22], [-0.36, 0.03], [-0.35, 0.3], [-0.2, 0.36],
]
function shield() {
  const g = new Group()
  // Silver rim (the full silhouette, behind).
  g.add(part(slab(poly(SHIELD), 0.1, 0.035), solid('#c4cdea', { metalness: 0.3, roughness: 0.35, emissive: 0.03 })))
  // Blue face split light / dark down the middle, like a cut gem.
  const inner = SHIELD.map(([x, y]) => [x * 0.76, y * 0.76 - 0.01] as [number, number])
  const left = poly([...inner.slice(5), inner[0]].map(([x, y]) => [Math.min(x, 0), y] as [number, number]))
  const right = poly([inner[0], ...inner.slice(1, 6)].map(([x, y]) => [Math.max(x, 0), y] as [number, number]))
  g.add(part(slab(left, 0.06, 0.018), solid('#2d8bff', { emissive: 0.22 }), [0, 0, 0.06]))
  g.add(part(slab(right, 0.06, 0.018), solid('#1452d0', { emissive: 0.2 }), [0, 0, 0.06]))
  // White star.
  g.add(part(slab(starShape(0.15, 0.065), 0.05, 0.015), solid('#e9eeff', { metalness: 0.2, emissive: 0.12 }), [0, 0.01, 0.12]))
  return g
}

// ------------------------------------------------------------------ magnet
function magnet() {
  const g = new Group()
  const red = solid('#f0412b', { emissive: 0.2 })
  const silver = solid('#e6ebf5', { metalness: 0.25, roughness: 0.35 })
  const R = 0.2
  const T = 0.105
  // The U: a faceted half-torus with two straight arms; flat 6-sided cross-section.
  g.add(part(new TorusGeometry(R, T, 6, 9, Math.PI), red, [0, 0, 0], [0, 0, Math.PI]))
  for (const x of [-R, R]) {
    g.add(part(new CylinderGeometry(T, T, 0.16, 6), red, [x, 0.08, 0]))
    g.add(part(new CylinderGeometry(T * 1.02, T * 1.02, 0.13, 6), silver, [x, 0.225, 0]))
  }
  // Little yellow "sparks" by the right pole.
  const spark = glowing('#ffd23f', 1.4)
  g.add(part(new BoxGeometry(0.03, 0.12, 0.03), spark, [R + 0.06, 0.42, 0], [0, 0, -0.35]))
  g.add(part(new BoxGeometry(0.03, 0.09, 0.03), spark, [R + 0.17, 0.36, 0], [0, 0, -1.0]))
  g.rotation.z = -0.45 // tilted, like the reference
  g.scale.setScalar(1.25)
  const wrap = new Group()
  wrap.add(g)
  return wrap
}

// ------------------------------------------------------------------ 2× coins
/** "2x" label drawn once into a canvas; used as a camera-facing sprite. */
let labelTex: CanvasTexture | null = null
function label2x() {
  if (!labelTex) {
    const c = document.createElement('canvas')
    c.width = 256
    c.height = 160
    const ctx = c.getContext('2d')!
    ctx.font = '900 118px "Arial Black", Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    // drop shadow, dark outline, cream fill
    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    ctx.fillText('2x', 132, 88)
    ctx.lineWidth = 22
    ctx.strokeStyle = '#4a2a10'
    ctx.strokeText('2x', 128, 82)
    ctx.fillStyle = '#ffe9c4'
    ctx.fillText('2x', 128, 82)
    labelTex = new CanvasTexture(c)
    labelTex.colorSpace = SRGBColorSpace
  }
  const sprite = new Sprite(new SpriteMaterial({ map: labelTex, color: '#d9d9d9', depthWrite: false, transparent: true }))
  sprite.renderOrder = 10
  sprite.scale.set(0.5, 0.31, 1)
  return sprite
}

function coin(scale: number) {
  const g = new Group()
  const gold = solid('#ffb81a', { metalness: 0.3, roughness: 0.35, emissive: 0.28 })
  const goldDark = solid('#f29a0c', { metalness: 0.3, roughness: 0.4, emissive: 0.25 })
  // Faceted 12-sided coin body + a raised rim ring and a raised star.
  g.add(part(new CylinderGeometry(0.27, 0.27, 0.1, 12), goldDark, [0, 0, 0], [Math.PI / 2, 0, 0]))
  g.add(part(new TorusGeometry(0.215, 0.028, 4, 12), gold, [0, 0, 0.05]))
  g.add(part(new CylinderGeometry(0.19, 0.19, 0.03, 12), gold, [0, 0, 0.04], [Math.PI / 2, 0, 0]))
  g.add(part(slab(starShape(0.11, 0.048), 0.035, 0.01), goldDark, [0, 0.005, 0.07]))
  g.scale.setScalar(scale)
  return g
}
function doubleCoins() {
  const g = new Group()
  const back = coin(1)
  back.position.set(-0.11, 0.07, -0.05)
  back.rotation.y = 0.25
  const front = coin(0.82)
  front.position.set(0.15, -0.03, 0.07)
  front.rotation.y = -0.2
  const tag = label2x()
  tag.position.set(0.04, -0.24, 0.25)
  g.add(back, front, tag)
  return g
}

// ------------------------------------------------------------------ jetpack
function roundedRect(w: number, h: number, r: number) {
  const s = new Shape()
  const x = -w / 2
  const y = -h / 2
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y)
  s.quadraticCurveTo(x + w, y, x + w, y + r)
  s.lineTo(x + w, y + h - r)
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  s.lineTo(x + r, y + h)
  s.quadraticCurveTo(x, y + h, x, y + h - r)
  s.lineTo(x, y + r)
  s.quadraticCurveTo(x, y, x + r, y)
  return s
}
/** Flames are separate so the game can flicker them. */
export const JETPACK_FLAME_NAME = 'flame'
function jetpack() {
  const g = new Group()
  const white = solid('#cfd5e1', { roughness: 0.45, emissive: 0.03 })
  const grey = solid('#8a93a6', { roughness: 0.5, emissive: 0.02 })
  const dark = solid('#2f3546', { roughness: 0.5, emissive: 0.02 })
  const orange = solid('#ff7a00', { emissive: 0.35, roughness: 0.5 })
  const cyan = glowing('#3fd8ff', 1.5)
  // Centre body with a dark plate and a glowing window.
  g.add(part(slab(roundedRect(0.24, 0.42, 0.06), 0.18, 0.025), white, [0, 0.01, 0]))
  g.add(part(slab(roundedRect(0.16, 0.27, 0.04), 0.04, 0.012), dark, [0, -0.02, 0.135]))
  g.add(part(new BoxGeometry(0.05, 0.1, 0.03), cyan, [0, -0.02, 0.165]))
  for (const side of [-1, 1]) {
    const x = side * 0.205
    // Tank: faceted cylinder with a rounded top, orange band, cyan side light.
    g.add(part(new CylinderGeometry(0.1, 0.1, 0.36, 8), white, [x, 0.0, -0.01]))
    g.add(part(new SphereGeometry(0.1, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2), white, [x, 0.18, -0.01]))
    g.add(part(new CylinderGeometry(0.106, 0.106, 0.06, 8), orange, [x, 0.1, -0.01]))
    g.add(part(new BoxGeometry(0.03, 0.07, 0.05), cyan, [x + side * 0.1, 0.0, -0.01]))
    // Carry handle arching over the tank top.
    g.add(part(new TorusGeometry(0.065, 0.02, 4, 8, Math.PI), dark, [x, 0.27, -0.01]))
    g.add(part(new CylinderGeometry(0.101, 0.101, 0.07, 8), grey, [x, -0.15, -0.01]))
    // Nozzle + glowing blue flame (outer) with a white-hot core.
    g.add(part(new CylinderGeometry(0.06, 0.08, 0.07, 8), dark, [x, -0.215, -0.01]))
    const flame = new Group()
    flame.name = JETPACK_FLAME_NAME
    flame.position.set(x, -0.25, -0.01)
    const outer = part(new ConeGeometry(0.065, 0.26, 6), glowing('#2fa8ff', 2.2), [0, -0.13, 0], [Math.PI, 0, 0])
    const core = part(new ConeGeometry(0.03, 0.15, 6), glowing('#e8fbff', 2.4), [0, -0.08, 0], [Math.PI, 0, 0])
    outer.castShadow = core.castShadow = false
    flame.add(outer, core)
    g.add(flame)
  }
  g.scale.setScalar(1.15)
  return g
}

// ------------------------------------------------------------------ road glow
let glowTex: CanvasTexture | null = null
/** Soft coloured light pool on the road under a pickup (additive, unlit). */
export function makeGroundGlow(color: string) {
  if (!glowTex) {
    const c = document.createElement('canvas')
    c.width = c.height = 128
    const ctx = c.getContext('2d')!
    const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
    grad.addColorStop(0, 'rgba(255,255,255,0.9)')
    grad.addColorStop(0.45, 'rgba(255,255,255,0.35)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 128, 128)
    glowTex = new CanvasTexture(c)
  }
  const m = new Mesh(
    new PlaneGeometry(1.1, 0.8).rotateX(-Math.PI / 2),
    new MeshBasicMaterial({ map: glowTex, color, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false, side: DoubleSide }),
  )
  m.position.y = 0.02
  return m
}

/** Colour of each pickup's road glow (also its theme colour). */
export const PICKUP_GLOW: Record<PickupKind, string> = {
  shield: '#2f7bff',
  magnet: '#ff7a1f',
  double: '#ffb81a',
  jetpack: '#2fa8ff',
}

const BUILDERS: Record<PickupKind, () => Group> = { shield, magnet, double: doubleCoins, jetpack }

/**
 * Merge every part that shares a material into ONE mesh (transforms baked in),
 * so a pickup costs a few draw calls instead of ~20. Jetpack flames (animated)
 * and the "2x" sprite stay separate objects.
 */
function compact(model: Group): Group {
  const outer = new Group()
  outer.add(model)
  outer.updateMatrixWorld(true)
  const buckets = new Map<Material, BufferGeometry[]>()
  const keep: Object3D[] = []
  const walk = (o: Object3D) => {
    for (const c of o.children) {
      if (c.name === JETPACK_FLAME_NAME || (c as Sprite).isSprite) {
        keep.push(c)
        continue
      }
      const mesh = c as Mesh
      if (mesh.isMesh) {
        let g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()
        g = g.applyMatrix4(mesh.matrixWorld)
        for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name)
        const mat = mesh.material as Material
        const list = buckets.get(mat) ?? []
        list.push(g)
        buckets.set(mat, list)
      }
      walk(c)
    }
  }
  walk(outer)
  const result = new Group()
  for (const [mat, geos] of buckets) {
    const m = new Mesh(mergeGeometries(geos), mat)
    m.castShadow = true
    result.add(m)
  }
  for (const k of keep) {
    // Keep its world transform, re-parented under the compact group.
    k.matrixWorld.decompose(k.position, k.quaternion, k.scale)
    result.add(k)
  }
  return result
}

/** Build a pickup model, compacted for drawing (call once per kind and clone it). */
export function buildPickupModel(kind: PickupKind): Group {
  const g = compact(BUILDERS[kind]())
  g.name = `pickup-${kind}`
  return g
}
