/**
 * Upload a built character's assets to Supabase Storage (overwrites in place).
 *
 * Uses the SERVICE_ROLE key (full access) — so this is a LOCAL build tool only.
 * The key is read from .env.local as SUPABASE_SERVICE_ROLE (no VITE_ prefix, so
 * Vite never bundles it into the client) and .env.local is gitignored. Never put
 * the service_role key in any client code.
 *
 * Usage:
 *   node scripts/upload-character.mjs --id rookie
 *   (uploads dist-characters/<id>/model.glb + thumb.webp to
 *    character-assets/characters/<id>/)
 */
import { readFileSync } from 'fs'

const BUCKET = 'character-assets'

const argv = process.argv.slice(2)
const arg = (k, d) => {
  const i = argv.indexOf(`--${k}`)
  return i >= 0 ? argv[i + 1] : d
}
const ID = arg('id', 'rookie')
const DIR = arg('dir', `dist-characters/${ID}`)

// Read env from .env.local
const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)
const URL = (env.VITE_SUPABASE_URL || '').replace(/\/+$/, '')
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE
if (!URL || !SERVICE) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const FILES = [
  { name: 'model.glb', type: 'model/gltf-binary' },
  { name: 'thumb.webp', type: 'image/webp' },
]

for (const f of FILES) {
  const path = `${DIR}/${f.name}`
  let body
  try {
    body = readFileSync(path)
  } catch {
    console.warn(`skip (not found): ${path}`)
    continue
  }
  const dest = `characters/${ID}/${f.name}`
  const res = await fetch(`${URL}/storage/v1/object/${BUCKET}/${dest}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      'Content-Type': f.type,
      'x-upsert': 'true', // overwrite if it exists
      'cache-control': '3600',
    },
    body,
  })
  const txt = await res.text()
  console.log(`${f.name} → HTTP ${res.status} ${res.ok ? 'OK' : txt.slice(0, 200)} (${body.length} bytes)`)
}
