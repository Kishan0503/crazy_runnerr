#!/usr/bin/env node
// Converts the raw audio sources (raw/audio, gitignored) into web-ready files in
// public/audio, per tools/audio-manifest.json:
//   - every sound → .webm (Opus: small, gapless) + .mp3 (fallback for old Safari)
//   - SFX + jingles: mono, leading/trailing silence trimmed
//   - music: trimmed to its usable region and turned into a seamless loop by
//     crossfading the tail back into the head
// Usage: npm run audio:build
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ffmpeg from 'ffmpeg-static'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const rawDir = join(root, 'raw', 'audio')
const outDir = join(root, 'public', 'audio')
const manifest = JSON.parse(readFileSync(join(root, 'tools', 'audio-manifest.json'), 'utf8'))

if (!ffmpeg || !existsSync(ffmpeg)) {
  console.error('ffmpeg binary missing — run `npm approve-scripts ffmpeg-static && npm rebuild ffmpeg-static`.')
  process.exit(1)
}

const TRIM_SILENCE =
  'silenceremove=start_periods=1:start_threshold=-55dB,areverse,silenceremove=start_periods=1:start_threshold=-55dB,areverse'

const run = (args) => {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error(r.stderr || `ffmpeg exited ${r.status}`)
}

const duration = (file) => {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-i', file], { encoding: 'utf8' })
  const m = r.stderr.match(/Duration: (\d+):(\d+):([\d.]+)/)
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : NaN
}

/** Encode one filter graph to both formats. `stereo` keeps 2 channels (music). */
function encode(src, base, { filter, complex, stereo }) {
  const ch = stereo ? [] : ['-ac', '1']
  const graph = complex ? ['-filter_complex', complex, '-map', '[out]'] : filter ? ['-af', filter] : []
  run(['-i', src, ...graph, ...ch, '-c:a', 'libopus', '-b:a', stereo ? '96k' : '48k', `${base}.webm`])
  run(['-i', src, ...graph, ...ch, '-c:a', 'libmp3lame', '-b:a', stereo ? '128k' : '64k', `${base}.mp3`])
}

const kb = (f) => Math.round(statSync(f).size / 1024)
let total = 0
const report = (id, base) => {
  const w = kb(`${base}.webm`)
  const m = kb(`${base}.mp3`)
  total += w + m
  console.log(`  ✓ ${id.padEnd(15)} webm ${String(w).padStart(5)} KB   mp3 ${String(m).padStart(5)} KB`)
}

for (const [group, sub] of [['sfx', 'sfx'], ['jingles', 'sfx']]) {
  console.log(`== ${group}`)
  mkdirSync(join(outDir, sub), { recursive: true })
  for (const [id, rel] of Object.entries(manifest[group])) {
    const src = join(rawDir, rel)
    if (!existsSync(src)) throw new Error(`missing source for ${id}: ${src}`)
    const base = join(outDir, sub, id)
    encode(src, base, { filter: TRIM_SILENCE })
    report(id, base)
  }
}

console.log('== music (seamless loops)')
mkdirSync(join(outDir, 'music'), { recursive: true })
for (const [id, m] of Object.entries(manifest.music)) {
  const src = join(rawDir, m.src)
  if (!existsSync(src)) throw new Error(`missing source for ${id}: ${src}`)
  const d = duration(src)
  const start = m.start ?? 0
  const end = m.end > 0 ? m.end : d + (m.end ?? 0)
  const x = m.crossfade ?? 0.5
  const len = end - start
  // Loop = body [start+x, end-x] then a crossfade of the tail [end-x, end]
  // into the head [start, start+x]. Wrapping from the crossfade's end back to
  // the body's start (= head's end) is continuous → no seam, no fade dip.
  const complex = [
    `[0:a]atrim=${start}:${end},asetpts=PTS-STARTPTS,asplit=3[a][b][c]`,
    `[a]atrim=${x}:${len - x},asetpts=PTS-STARTPTS[body]`,
    `[b]atrim=${len - x}:${len},asetpts=PTS-STARTPTS[tail]`,
    `[c]atrim=0:${x},asetpts=PTS-STARTPTS[head]`,
    `[tail][head]acrossfade=d=${x}:c1=tri:c2=tri[seam]`,
    `[body][seam]concat=n=2:v=0:a=1[out]`,
  ].join(';')
  const base = join(outDir, 'music', id)
  encode(src, base, { complex, stereo: true })
  report(`${id} (${(len - x).toFixed(1)}s)`, base)
}

console.log(`\nTotal: ${(total / 1024).toFixed(2)} MB in public/audio (both formats)`)


