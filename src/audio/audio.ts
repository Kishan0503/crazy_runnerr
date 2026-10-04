import { Howl, Howler } from 'howler'
import { useSettings } from '../game/settings'
import { MUSIC, SFX, musicSrc, sfxSrc, type MusicId, type SfxId } from './sounds'

/**
 * Audio manager (Phase 2) on top of Howler (Web Audio, so music loops are
 * gapless and many SFX can overlap). Two channels:
 *   - SFX: short one-shots with optional pitch (rate) and volume tweaks
 *   - music: one looping track at a time, crossfaded on change, duckable and
 *     pitch-bendable (the death slow-mo drops its rate)
 * Volumes and mute come from the settings store and update live.
 *
 * Mobile browsers keep audio locked until the first user gesture; Howler
 * unlocks it automatically on the first tap (Play Now is always a tap).
 */

const CROSSFADE_MS = 600
const sfx = new Map<SfxId, Howl>()
const music = new Map<MusicId, Howl>()
let current: MusicId | null = null
let ducked = false
let initialized = false

const settings = () => useSettings.getState()
const sfxGain = () => settings().sfxVolume
const musicGain = (id: MusicId) => MUSIC[id] * settings().musicVolume * (ducked ? 0.25 : 1)

/** Preload every SFX (tiny) — call once after first paint. Music loads on demand. */
export function initAudio() {
  if (initialized) return
  initialized = true
  for (const id of Object.keys(SFX) as SfxId[]) {
    sfx.set(id, new Howl({ src: sfxSrc(id), preload: true, volume: SFX[id] }))
  }
  Howler.mute(settings().muted)
  // Live-apply mute / volume changes from the settings store.
  useSettings.subscribe((s, prev) => {
    if (s.muted !== prev.muted) Howler.mute(s.muted)
    if (s.musicVolume !== prev.musicVolume && current) music.get(current)?.volume(musicGain(current))
  })
}

/** Play a one-shot. `rate` shifts pitch+speed, `volume` scales the base volume. */
export function playSfx(id: SfxId, opts: { rate?: number; volume?: number } = {}) {
  const h = sfx.get(id)
  if (!h || settings().muted) return
  const soundId = h.play()
  h.volume(SFX[id] * (opts.volume ?? 1) * sfxGain(), soundId)
  if (opts.rate && opts.rate !== 1) h.rate(opts.rate, soundId)
}

function getMusic(id: MusicId): Howl {
  let h = music.get(id)
  if (!h) {
    h = new Howl({ src: musicSrc(id), loop: true, preload: true, volume: 0 })
    music.set(id, h)
  }
  return h
}

/** Switch the looping track with a crossfade (no-op if it's already playing). */
export function playMusic(id: MusicId | null) {
  if (id === current) {
    // Same track: make sure it's audible (e.g. after a slow-mo fade-out).
    if (id) restoreMusic()
    return
  }
  if (current) {
    const oldId = current
    const old = music.get(oldId)!
    old.fade(old.volume(), 0, CROSSFADE_MS)
    // Stop once faded — unless we switched back to it in the meantime.
    old.once('fade', () => {
      if (current !== oldId) old.stop()
    })
  }
  current = id
  ducked = false
  if (!id) return
  const h = getMusic(id)
  h.rate(1)
  if (!h.playing()) h.play()
  h.fade(0, musicGain(id), CROSSFADE_MS)
}

/** Lower the music under the pause overlay (true) or bring it back (false). */
export function duckMusic(on: boolean) {
  if (ducked === on || !current) return
  ducked = on
  const h = music.get(current)!
  h.fade(h.volume(), musicGain(current), 250)
}

/** Restore normal pitch and volume on the current track. */
function restoreMusic() {
  if (!current) return
  const h = music.get(current)!
  h.rate(1)
  if (!h.playing()) h.play()
  h.fade(h.volume(), musicGain(current), 300)
}

/**
 * Death slow-mo: bend the music's pitch down to `rate` over `ms`, fading it out.
 * Howler has no rate ramp, so we step it on a short interval.
 */
export function slowMoMusic(rate: number, ms: number) {
  if (!current) return
  const h = music.get(current)!
  const steps = 10
  let i = 0
  const timer = setInterval(() => {
    i++
    h.rate(1 + (rate - 1) * (i / steps))
    if (i >= steps) clearInterval(timer)
  }, ms / steps)
  h.fade(h.volume(), 0, ms)
}

/** Suspend / resume all audio (tab or app hidden). */
export function suspendAudio(on: boolean) {
  const ctx = Howler.ctx
  if (!ctx) return
  if (on && ctx.state === 'running') void ctx.suspend()
  else if (!on && ctx.state === 'suspended') void ctx.resume()
}

/** Every SFX id — for the debug panel's "play all" tester. */
export const ALL_SFX = Object.keys(SFX) as SfxId[]
