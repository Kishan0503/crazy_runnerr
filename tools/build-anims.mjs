#!/usr/bin/env node
// Builds the shared animation library public/models/anims.glb (Phase 3) from
// Mixamo FBX clips in raw/anims (gitignored, downloaded "Without Skin"):
//   FBX → glTF (FBX2glTF) → merge all clips into one file → rename each clip to
//   its file name → resample + meshopt-compress.
// The game applies these clips to every character at runtime (shared Mixamo
// skeleton). Usage: npm run anims:build
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Document, NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, mergeDocuments, meshopt, prune, resample, unpartition } from '@gltf-transform/functions'
import { MeshoptEncoder } from 'meshoptimizer'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = join(root, 'raw', 'anims')
const out = join(root, 'public', 'models', 'anims.glb')
const fbx2gltf = fbxBinary()

function fbxBinary() {
  const dir = join(root, 'node_modules', 'fbx2gltf', 'bin', process.platform === 'win32' ? 'Windows_NT' : process.platform === 'darwin' ? 'Darwin' : 'Linux')
  return join(dir, process.platform === 'win32' ? 'FBX2glTF.exe' : 'FBX2glTF')
}

await MeshoptEncoder.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder })

const clips = readdirSync(srcDir).filter((f) => f.toLowerCase().endsWith('.fbx'))
if (clips.length === 0) throw new Error(`no .fbx clips in ${srcDir}`)

const tmp = join(tmpdir(), 'crazy-runnerr-anims')
rmSync(tmp, { recursive: true, force: true })
mkdirSync(tmp, { recursive: true })

const doc = new Document()
// One shared skeleton: every clip's channels are re-pointed at the FIRST clip's
// bones (by name). Separate skeleton copies would get renamed on load
// ("mixamorigHips_1"…) and those clips would no longer bind to a character.
const bonesByName = new Map()
for (const file of clips) {
  const name = file.replace(/\.fbx$/i, '')
  execFileSync(fbx2gltf, ['--binary', '--input', join(srcDir, file), '--output', join(tmp, name)], { stdio: 'pipe' })
  const part = await io.read(join(tmp, `${name}.glb`))
  const anims = part.getRoot().listAnimations()
  if (anims.length !== 1) throw new Error(`${file}: expected 1 clip, found ${anims.length}`)
  anims[0].setName(name)
  const before = new Set(doc.getRoot().listNodes())
  mergeDocuments(doc, part)
  const added = doc.getRoot().listNodes().filter((n) => !before.has(n))
  if (bonesByName.size === 0) {
    for (const n of added) bonesByName.set(n.getName(), n)
  } else {
    const anim = doc.getRoot().listAnimations().find((a) => a.getName() === name)
    let missing = 0
    for (const ch of anim.listChannels()) {
      const target = bonesByName.get(ch.getTargetNode()?.getName())
      if (target) ch.setTargetNode(target)
      else missing++
    }
    // Drop this clip's now-unused skeleton copy (and its scene).
    for (const n of added) n.dispose()
    for (const s of doc.getRoot().listScenes().slice(1)) s.dispose()
    if (missing) console.warn(`  ! ${name}: ${missing} channels target bones not in the shared skeleton`)
  }
  console.log(`  ✓ ${name}`)
}

await doc.transform(unpartition(), resample(), dedup(), prune({ keepLeaves: true }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }))
mkdirSync(dirname(out), { recursive: true })
await io.write(out, doc)
rmSync(tmp, { recursive: true, force: true })
console.log(`\n${doc.getRoot().listAnimations().length} clips → public/models/anims.glb (${(statSync(out).size / 1024).toFixed(0)} KB)`)
