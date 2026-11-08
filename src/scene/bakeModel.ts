import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  Float32BufferAttribute,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  WebGLRenderTarget,
  type Camera,
  type Material,
  type Object3D,
  type Scene,
  type WebGLRenderer,
} from 'three'
import type { ModelEntry } from '../game/modelRegistry'
import { TIERS, useQuality } from '../game/quality'

/**
 * Shared material setup for Kenney kit models: matte look + a self-lit glow
 * from the model's own texture so it reads at night and catches the bloom.
 * Materials are shared between every instance; `tint` makes a private copy.
 */
export function prepareMaterial(source: Material, glow = 0, tint?: string | null): Material {
  let mat = source as MeshStandardMaterial
  if (tint) {
    mat = mat.clone()
    mat.color.set(tint)
  }
  if (!mat.userData.prepared) {
    mat.userData.prepared = true
    mat.metalness = 0.05
    mat.roughness = 0.7
    if (glow > 0) {
      // Textured: glow with the texture's own colours. Flat-coloured parts
      // glow in their own colour, never white.
      if (mat.map) {
        mat.emissive.set('#ffffff')
        mat.emissiveMap = mat.map
      } else {
        mat.emissive.copy(mat.color)
      }
      mat.emissiveIntensity = glow
    }
  }
  return mat
}

/** Meshopt-quantized attributes are normalized integers in [-1, 1]; transforming
 *  them past that range would clip, so expand to float first. */
function toFloat(geo: BufferGeometry, name: string) {
  const a = geo.getAttribute(name) as BufferAttribute | undefined
  if (!a || a.array instanceof Float32Array) return
  const out = new Float32Array(a.count * a.itemSize)
  for (let i = 0; i < a.count; i++)
    for (let k = 0; k < a.itemSize; k++) out[i * a.itemSize + k] = a.getComponent(i, k)
  geo.setAttribute(name, new Float32BufferAttribute(out, a.itemSize))
}

export interface BakedPart {
  geometry: BufferGeometry
  material: Material
}

const Y = new Vector3(0, 1, 0)

/**
 * Turn a loaded glTF scene into instancing-ready parts: every mesh's node
 * transform + the registry's scale / facing are baked into its own geometry,
 * and the whole model is dropped so its base sits at y = 0 (PRD §9.3).
 * One part per mesh → one InstancedMesh (one draw call) per part.
 */
export function bakeModel(scene: Object3D, entry: ModelEntry): BakedPart[] {
  scene.updateMatrixWorld(true)
  const s = Array.isArray(entry.scale) ? entry.scale : [entry.scale, entry.scale, entry.scale]
  const root = new Matrix4().compose(
    new Vector3(),
    new Quaternion().setFromAxisAngle(Y, entry.rotationY ?? 0),
    new Vector3(s[0], s[1], s[2]),
  )
  const parts: BakedPart[] = []
  const m = new Matrix4()
  scene.traverse((o) => {
    const mesh = o as Mesh
    if (!mesh.isMesh) return
    const geometry = mesh.geometry.clone()
    toFloat(geometry, 'position')
    toFloat(geometry, 'normal')
    geometry.applyMatrix4(m.multiplyMatrices(root, mesh.matrixWorld))
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    parts.push({ geometry, material: prepareMaterial(mats[0], entry.glow ?? 0, entry.tint) })
  })
  const box = new Box3()
  for (const p of parts) {
    p.geometry.computeBoundingBox()
    box.union(p.geometry.boundingBox!)
  }
  for (const p of parts) {
    p.geometry.translate(0, -box.min.y, 0)
    p.geometry.computeBoundingSphere()
  }
  return parts
}

/** Stand-in render target: shaders drawn into the post-processing buffer are a
 *  different variant (no tone mapping, linear output) from screen ones. */
let offscreen: WebGLRenderTarget | null = null

/**
 * Compile objects' shaders in the background (three.js compileAsync + the
 * browser's parallel shader compile) so they're ready before first draw.
 * Objects that are normally hidden are shown only for the synchronous part of
 * the call (no frame is drawn in between). The variant must match the real
 * pipeline: with bloom on, scenes render into the composer's buffer, not the
 * screen — so compile against an off-screen target in that case.
 */
export function compileInBackground(gl: WebGLRenderer, camera: Camera, scene: Scene, objects: Object3D[]): Promise<unknown> {
  const was = objects.map((o) => o.visible)
  objects.forEach((o) => (o.visible = true))
  const prevTarget = gl.getRenderTarget()
  if (TIERS[useQuality.getState().applied].bloom) {
    offscreen ??= new WebGLRenderTarget(1, 1)
    gl.setRenderTarget(offscreen)
  }
  const done = Promise.all(objects.map((o) => gl.compileAsync(o, camera, scene).catch(() => undefined)))
  gl.setRenderTarget(prevTarget)
  objects.forEach((o, i) => (o.visible = was[i]))
  return done
}
