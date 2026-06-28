/**
 * Build a game-ready character GLB from raw assets (see docs/character-asset-architecture.md).
 *
 * Inputs (a character folder), e.g. characters/Rookie/:
 *   - <Name>.glb        textured static mesh (UVs + albedo texture) — the look
 *   - idle/run/jump/slide/turn180 .fbx   Mixamo rigs (same mixamorig skeleton), 1 clip each
 *
 * What it does (all offline, no browser):
 *   1. fbx2gltf each animation FBX → a temp GLB (clean indexed mesh + skin + 1 clip).
 *   2. Use the idle conversion as the BASE (mesh + skeleton + skin).
 *   3. Copy the other 4 clips into the base, bound to the base skeleton by bone name,
 *      and rename all five to the standard: idle / run / jump / slide / turn180.
 *   4. Strip horizontal root motion (Hips X/Z) so animations stay in place on the
 *      treadmill (the world moves, not the character); keep vertical (jump/crouch)
 *      and keep Hips rotation (the real 180° body turn lives there).
 *   5. Apply the source GLB's albedo texture (highest-quality original art).
 *   6. Optimize: dedup, weld, prune, and compress textures to WebP.
 *   7. Write dist-characters/<id>/model.glb (+ thumb.webp from the reference sheet).
 *
 * Usage:
 *   node scripts/build-character.mjs --id rookie --src characters/Rookie \
 *     --tex characters/Rookie/Rookie.glb --ref characters/Rookie/Rookie.png
 */
import { NodeIO } from '@gltf-transform/core'
import { EXTTextureWebP } from '@gltf-transform/extensions'
import { dedup, weld, prune, textureCompress } from '@gltf-transform/functions'
import sharp from 'sharp'
import fbx2gltf from 'fbx2gltf'
import { mkdirSync, rmSync } from 'fs'
import { resolve } from 'path'

/* ----------------------------- args ----------------------------- */
const argv = process.argv.slice(2)
const arg = (k, d) => {
  const i = argv.indexOf(`--${k}`)
  return i >= 0 ? argv[i + 1] : d
}
const ID = arg('id', 'rookie')
const SRC = arg('src', 'characters/Rookie')
const TEX_GLB = arg('tex', `${SRC}/Rookie.glb`)
const REF_PNG = arg('ref', `${SRC}/Rookie.png`)
const OUT_DIR = arg('out', `dist-characters/${ID}`)
const TMP = `/tmp/charbuild-${ID}`

// fbx filename (in SRC) → standard clip name
const CLIPS = {
  idle: 'idle.fbx',
  run: 'run.fbx',
  jump: 'jump.fbx',
  slide: 'slide.fbx',
  turn180: 'turn180.fbx',
}

// Register EXT_texture_webp so the compressed WebP texture is declared in the
// output (three's GLTFLoader needs the extension flag to load it).
const io = new NodeIO().registerExtensions([EXTTextureWebP])

/* -------------------- 1. convert FBX → temp GLB ------------------- */
rmSync(TMP, { recursive: true, force: true })
mkdirSync(TMP, { recursive: true })
const tmpGlb = {}
for (const [name, file] of Object.entries(CLIPS)) {
  const out = `${TMP}/${name}.glb`
  await fbx2gltf(resolve(SRC, file), out, ['--binary'])
  tmpGlb[name] = out
  console.log(`converted ${file} → ${name}.glb`)
}

/* -------------------- 2. base = idle conversion ------------------ */
const doc = await io.read(tmpGlb.idle)
const root = doc.getRoot()
const buffer = root.listBuffers()[0]

// Drop the auto-generated animation(s); we re-add all five cleanly by name.
for (const a of root.listAnimations()) a.dispose()

const nodesByName = new Map(root.listNodes().map((n) => [n.getName(), n]))

/* -------- helper: copy one clip from a temp glb into the base ----- */
async function addClip(stdName, glbPath) {
  const srcDoc = await io.read(glbPath)
  const srcAnim = srcDoc.getRoot().listAnimations()[0]
  if (!srcAnim) {
    console.warn(`  (no animation in ${glbPath})`)
    return
  }
  const anim = doc.createAnimation(stdName)
  const samplerMap = new Map()
  for (const ch of srcAnim.listChannels()) {
    const tgt = nodesByName.get(ch.getTargetNode().getName())
    if (!tgt) continue // bone not in base skeleton — skip
    const srcS = ch.getSampler()
    let dstS = samplerMap.get(srcS)
    if (!dstS) {
      const input = doc
        .createAccessor()
        .setType('SCALAR')
        .setArray(Float32Array.from(srcS.getInput().getArray()))
        .setBuffer(buffer)
      const o = srcS.getOutput()
      const output = doc
        .createAccessor()
        .setType(o.getType())
        .setArray(Float32Array.from(o.getArray()))
        .setBuffer(buffer)
      dstS = doc
        .createAnimationSampler()
        .setInput(input)
        .setOutput(output)
        .setInterpolation(srcS.getInterpolation())
      anim.addSampler(dstS)
      samplerMap.set(srcS, dstS)
    }
    const dstCh = doc
      .createAnimationChannel()
      .setTargetNode(tgt)
      .setTargetPath(ch.getTargetPath())
      .setSampler(dstS)
    anim.addChannel(dstCh)
  }
  console.log(`  added clip "${stdName}" (${anim.listChannels().length} channels)`)
}

for (const name of Object.keys(CLIPS)) await addClip(name, tmpGlb[name])

/* ------- 4. strip horizontal root motion (keep Y + rotation) ----- */
// Treadmill runner: the world moves, the character stays put. Pin Hips X/Z to
// their first-frame value so no clip drags the character forward/sideways; keep
// Y (jump/crouch) and keep rotation (turn180's real body turn).
for (const anim of root.listAnimations()) {
  for (const ch of anim.listChannels()) {
    const node = ch.getTargetNode()
    if (ch.getTargetPath() !== 'translation') continue
    if (!node?.getName().endsWith('Hips')) continue
    const out = ch.getSampler().getOutput()
    const arr = Float32Array.from(out.getArray()) // [x,y,z, x,y,z, ...]
    const x0 = arr[0]
    const z0 = arr[2]
    for (let i = 0; i < arr.length; i += 3) {
      arr[i] = x0 // pin X
      arr[i + 2] = z0 // pin Z
      // arr[i+1] (Y) kept
    }
    out.setArray(arr)
  }
  console.log(`  pinned root motion: ${anim.getName()}`)
}

/* ----------------- 5. apply the source albedo texture ------------ */
const texDoc = await io.read(TEX_GLB)
const srcTex =
  texDoc.getRoot().listMaterials()[0]?.getBaseColorTexture() ??
  texDoc.getRoot().listTextures()[0]
if (srcTex) {
  const tex = doc
    .createTexture('albedo')
    .setImage(srcTex.getImage())
    .setMimeType(srcTex.getMimeType())
  for (const mat of root.listMaterials()) {
    mat.setBaseColorTexture(tex)
    mat.setBaseColorFactor([1, 1, 1, 1])
    mat.setMetallicFactor(0)
    mat.setRoughnessFactor(0.85)
  }
  console.log('  applied albedo texture from', TEX_GLB)
} else {
  console.warn('  no texture found in', TEX_GLB)
}

/* ----------------------- 6. optimize ----------------------------- */
await doc.transform(
  dedup(),
  weld(),
  prune(),
  // PNG (not WebP): WebP needs EXT_texture_webp, which becomes a REQUIRED
  // extension — if the browser's webp decode stalls, the whole model fails to
  // load. PNG is universally loadable with no extension. Resize keeps size sane.
  textureCompress({ encoder: sharp, targetFormat: 'png', resize: [1024, 1024] }),
)

/* ----------------------- 7. write output ------------------------- */
mkdirSync(OUT_DIR, { recursive: true })
await io.write(`${OUT_DIR}/model.glb`, doc)
console.log(`\nWrote ${OUT_DIR}/model.glb`)
console.log(
  'clips:',
  root.listAnimations().map((a) => a.getName()),
  '| verts:',
  root.listMeshes()[0]?.listPrimitives()[0]?.getAttribute('POSITION')?.getCount(),
)

/* ----------------------- 8. thumbnail ---------------------------- */
try {
  const meta = await sharp(REF_PNG).metadata()
  const third = Math.floor(meta.width / 3)
  await sharp(REF_PNG)
    .extract({ left: 0, top: 0, width: third, height: meta.height }) // front view
    .resize(512, 640, { fit: 'cover', position: 'top' })
    .webp({ quality: 88 })
    .toFile(`${OUT_DIR}/thumb.webp`)
  console.log(`Wrote ${OUT_DIR}/thumb.webp`)
} catch (e) {
  console.warn('thumbnail skipped:', e.message)
}

rmSync(TMP, { recursive: true, force: true })
