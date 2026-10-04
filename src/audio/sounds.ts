/**
 * Sound manifest (Phase 2). Files are produced by `npm run audio:build` from
 * tools/audio-manifest.json into public/audio. Each sound ships as .webm (Opus)
 * + .mp3 fallback; Howler plays the first format the browser supports.
 */
export type SfxId =
  | 'jump'
  | 'land'
  | 'landHard'
  | 'whoosh'
  | 'coin'
  | 'stumble'
  | 'crash'
  | 'crashMetal'
  | 'speedUp'
  | 'milestone'
  | 'newBest'
  | 'abilityOn'
  | 'abilityOff'
  | 'click'
  | 'toggle'
  | 'jingleGameOver'
  | 'jingleNewBest'

export type MusicId = 'musicMenu' | 'musicRun'

/** Base volume per sound (before the player's SFX volume). */
export const SFX: Record<SfxId, number> = {
  jump: 0.45,
  land: 0.35,
  landHard: 0.6,
  whoosh: 0.5,
  coin: 0.5,
  stumble: 0.8,
  crash: 0.9,
  crashMetal: 0.6,
  speedUp: 0.55,
  milestone: 0.55,
  newBest: 0.6,
  abilityOn: 0.6,
  abilityOff: 0.5,
  click: 0.5,
  toggle: 0.5,
  jingleGameOver: 0.7,
  jingleNewBest: 0.75,
}

export const MUSIC: Record<MusicId, number> = {
  musicMenu: 0.8,
  musicRun: 0.9,
}

const BASE = `${import.meta.env.BASE_URL}audio`
export const sfxSrc = (id: SfxId) => [`${BASE}/sfx/${id}.webm`, `${BASE}/sfx/${id}.mp3`]
export const musicSrc = (id: MusicId) => [`${BASE}/music/${id}.webm`, `${BASE}/music/${id}.mp3`]
