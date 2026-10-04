#!/usr/bin/env node
// Uploads the optimized characters (dist-characters/<id>/model-v2.glb, built by
// `npm run models:optimize`) to a Supabase project's public `character-assets`
// bucket, then points that project's catalog rows at them (same change as
// supabase/migrations/*_character_models_v2.sql).
//
// New file names (model-v2.glb) — the old files are never overwritten, so the
// previous catalog URLs keep working as a fallback.
//
// Credentials come from the gitignored .env.db.local:
//   DEV_SUPABASE_URL / DEV_SERVICE_ROLE_KEY   (target: dev)
//   PROD_SUPABASE_URL / PROD_SERVICE_ROLE_KEY (target: live)
// Usage: node tools/upload-characters.mjs dev|live
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const target = process.argv[2]
if (target !== 'dev' && target !== 'live') {
  console.error('usage: node tools/upload-characters.mjs dev|live')
  process.exit(1)
}

const envFile = join(root, '.env.db.local')
if (!existsSync(envFile)) throw new Error('.env.db.local not found (see tools/upload-characters.mjs header)')
const env = Object.fromEntries(
  readFileSync(envFile, 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim().replace(/^['"]|['"]$/g, '')]),
)
const prefix = target === 'dev' ? 'DEV' : 'PROD'
const url = env[`${prefix}_SUPABASE_URL`]?.replace(/\/$/, '')
const key = env[`${prefix}_SERVICE_ROLE_KEY`]
if (!url || !key) throw new Error(`${prefix}_SUPABASE_URL and ${prefix}_SERVICE_ROLE_KEY are required in .env.db.local`)

const BUCKET = 'character-assets'
const IDS = ['rookie', 'techy', 'magno', 'ninja', 'cyborg', 'inferno']
const auth = { apikey: key, Authorization: `Bearer ${key}` }

console.log(`Target: ${target} (${new URL(url).host})`)
for (const id of IDS) {
  const file = join(root, 'dist-characters', id, 'model-v2.glb')
  if (!existsSync(file)) throw new Error(`missing ${file} — run npm run models:optimize first`)
  const body = readFileSync(file)
  const path = `characters/${id}/model-v2.glb`
  const up = await fetch(`${url}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'model/gltf-binary', 'x-upsert': 'true', 'Cache-Control': 'max-age=31536000' },
    body,
  })
  if (!up.ok) throw new Error(`upload ${id} failed: ${up.status} ${await up.text()}`)
  const publicUrl = `${url}/storage/v1/object/public/${BUCKET}/${path}`
  // Verify it's publicly downloadable before switching the catalog to it.
  const check = await fetch(publicUrl, { method: 'HEAD' })
  if (!check.ok) throw new Error(`uploaded ${id} but public URL returns ${check.status}`)
  const patch = await fetch(`${url}/rest/v1/characters?id=eq.${id}`, {
    method: 'PATCH',
    headers: { ...auth, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ model_url: publicUrl }),
  })
  const rows = patch.ok ? await patch.json() : []
  if (!patch.ok || rows.length !== 1) throw new Error(`catalog update for ${id} failed: ${patch.status}`)
  console.log(`  ✓ ${id.padEnd(8)} ${(body.length / 1024).toFixed(0)} KB uploaded, catalog → model-v2.glb`)
}
console.log('done')
