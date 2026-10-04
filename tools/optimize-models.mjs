#!/usr/bin/env node
// Model optimization pipeline (Phase 3). Reads tools/models-manifest.json:
//   - props (obstacles, coin): take a Kenney kit model, rotate / stack / fit it
//     to the gameplay hitbox, bake everything into one mesh (1 draw call)
//   - characters: compress textures to WebP, simplify heavy meshes, resample
//     animation keys, meshopt-compress geometry + animation
// Missing character sources are downloaded from the public character bucket
// (URLs from supabase/seed.sql). Usage: npm run models:optimize [-- <id> ...]
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NodeIO, getBounds } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import {
  clearNodeTransform,
  dedup,
  flatten,
  join as joinPrimitives,
  meshopt,
  prune,
  resample,
  simplify,
  textureCompress,
  weld,
} from '@gltf-transform/functions'
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(readFileSync(join(root, 'tools', 'models-manifest.json'), 'utf8'))
const only = new Set(process.argv.slice(2))
const wanted = (id) => only.size === 0 || only.has(id)

await MeshoptEncoder.ready
await MeshoptSimplifier.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder })

const kb = (f) => (statSync(f).size / 1024).toFixed(0)
const triangles = (doc) => {
  let t = 0
  for (const m of doc.getRoot().listMeshes())
    for (const p of m.listPrimitives()) t += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3
  return Math.round(t)
}
const texKB = (doc) =>
  Math.round(doc.getRoot().listTextures().reduce((s, t) => s + (t.getImage()?.byteLength ?? 0), 0) / 1024)

/** Final compression shared by every job. */
async function finish(doc, { textureSize }) {
  await doc.transform(
    dedup(),
    prune(),
    resample(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [textureSize, textureSize], quality: 85 }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  )
}

/** Quaternion for a rotation about Y (degrees). */
const rotY = (deg) => {
  const h = (deg * Math.PI) / 360
  return [0, Math.sin(h), 0, Math.cos(h)]
}

/** A mesh copy with its own primitives and vertex/index accessors. */
function deepCopyMesh(mesh) {
  const copy = mesh.clone()
  for (const prim of copy.listPrimitives()) {
    const p = prim.clone()
    for (const sem of p.listSemantics()) p.setAttribute(sem, p.getAttribute(sem).clone())
    if (p.getIndices()) p.setIndices(p.getIndices().clone())
    copy.removePrimitive(prim)
    copy.addPrimitive(p)
  }
  return copy
}

/** Copy a node subtree (sharing meshes) — gltf-transform nodes can't clone(). */
function copyTree(doc, node) {
  const n = doc
    .createNode(node.getName())
    .setTranslation(node.getTranslation())
    .setRotation(node.getRotation())
    .setScale(node.getScale())
  if (node.getMesh()) n.setMesh(node.getMesh())
  for (const c of node.listChildren()) n.addChild(copyTree(doc, c))
  return n
}

async function buildProp(id, job) {
  const [kit, name] = job.src.split(':')
  const src = join(root, manifest.kits[kit], `${name}.glb`)
  const doc = await io.read(src)
  const r = doc.getRoot()
  const scene = r.getDefaultScene() ?? r.listScenes()[0]

  // inner: rotation + stacked copies; outer: per-axis fit scale + placement.
  const inner = doc.createNode('inner').setRotation(rotY(job.rotateY ?? 0))
  const children = scene.listChildren()
  for (const c of children) {
    scene.removeChild(c)
    inner.addChild(c)
  }
  if (job.stack) {
    const b = getBounds(inner)
    const size = b.max.map((v, i) => v - b.min[i])
    const [nx, ny, nz] = job.stack
    const proto = children
    for (let ix = 0; ix < nx; ix++)
      for (let iy = 0; iy < ny; iy++)
        for (let iz = 0; iz < nz; iz++) {
          if (ix === 0 && iy === 0 && iz === 0) continue
          const cell = doc.createNode(`cell_${ix}${iy}${iz}`).setTranslation([ix * size[0], iy * size[1], iz * size[2]])
          for (const c of proto) cell.addChild(copyTree(doc, c))
          inner.addChild(cell)
        }
  }
  const outer = doc.createNode('outer')
  outer.addChild(inner)
  scene.addChild(outer)

  const b = getBounds(outer)
  const size = b.max.map((v, i) => v - b.min[i])
  const s = job.fit.map((f, i) => f / size[i])
  // Base on the ground, centred in x/z (or fully centred, e.g. the coin).
  const cx = (b.min[0] + b.max[0]) / 2
  const cy = job.center ? (b.min[1] + b.max[1]) / 2 : b.min[1]
  const cz = (b.min[2] + b.max[2]) / 2
  outer.setScale(s).setTranslation([-cx * s[0], -cy * s[1], -cz * s[2]])

  // Bake every transform into the vertices and merge into as few meshes as
  // possible (one per material → typically ONE draw call).
  await doc.transform(flatten())
  // Stacked copies share one mesh; give each node its own vertex data first,
  // otherwise baking N transforms would move the SAME geometry N times.
  for (const n of r.listNodes()) if (n.getMesh()) n.setMesh(deepCopyMesh(n.getMesh()))
  for (const n of r.listNodes()) if (n.getMesh()) clearNodeTransform(n)
  await doc.transform(joinPrimitives(), prune(), dedup())
  // Collapse to a single mesh node.
  const meshNodes = r.listNodes().filter((n) => n.getMesh())
  if (meshNodes.length > 1) {
    const keep = meshNodes[0].getMesh()
    for (const n of meshNodes.slice(1)) {
      for (const p of n.getMesh().listPrimitives()) keep.addPrimitive(p)
      n.dispose()
    }
    await doc.transform(joinPrimitives(), prune())
  }
  await finish(doc, { textureSize: 512 })

  const out = join(root, job.out)
  mkdirSync(dirname(out), { recursive: true })
  await io.write(out, doc)
  const fb = getBounds(r.getDefaultScene() ?? r.listScenes()[0])
  const dims = fb.max.map((v, i) => (v - fb.min[i]).toFixed(2)).join(' x ')
  console.log(`  ✓ ${id.padEnd(18)} ${String(kb(src)).padStart(5)} KB → ${String(kb(out)).padStart(4)} KB   tris ${triangles(doc)}   size ${dims}   meshes ${r.listMeshes().length}`)
}

/** Character model URLs from the seed (public bucket — no key needed to read). */
function seedUrl(id) {
  const seed = readFileSync(join(root, 'supabase', 'seed.sql'), 'utf8')
  const line = seed.split('\n').find((l) => l.includes(`'${id}'`))
  return line?.match(/'(https:\/\/[^']+\.glb)'/)?.[1]
}

async function buildCharacter(id, job) {
  const src = join(root, job.src)
  if (!existsSync(src)) {
    const url = seedUrl(id)
    if (!url) throw new Error(`no source and no seed URL for ${id}`)
    process.stdout.write(`  ↓ downloading ${id}… `)
    const res = await fetch(url)
    if (!res.ok) throw new Error(`download ${id} failed: ${res.status}`)
    mkdirSync(dirname(src), { recursive: true })
    writeFileSync(src, Buffer.from(await res.arrayBuffer()))
    console.log(`${kb(src)} KB`)
  }
  const doc = await io.read(src)
  const before = { kb: kb(src), tris: triangles(doc), tex: texKB(doc) }
  await doc.transform(weld())
  if (job.simplifyAbove && before.tris > job.simplifyAbove) {
    const ratio = job.simplifyAbove / before.tris
    await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.001 }))
  }
  await finish(doc, { textureSize: job.textureSize ?? 1024 })
  const out = join(root, job.out)
  mkdirSync(dirname(out), { recursive: true })
  await io.write(out, doc)
  console.log(
    `  ✓ ${id.padEnd(18)} ${String(before.kb).padStart(5)} KB → ${String(kb(out)).padStart(4)} KB   tris ${before.tris} → ${triangles(doc)}   textures ${before.tex} KB → ${texKB(doc)} KB`,
  )
}

console.log('== props (obstacles, coin)')
for (const [id, job] of Object.entries(manifest.props)) if (wanted(id)) await buildProp(id, job)
console.log('== characters')
for (const [id, job] of Object.entries(manifest.characters)) if (wanted(id)) await buildCharacter(id, job)
