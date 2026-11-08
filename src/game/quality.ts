import { create } from 'zustand'
import { useGameStore } from './store'
import { requestWarmup } from './warmup'

/**
 * Graphics quality (Phase 4P). Three tiers trade looks for speed; "auto"
 * (default) picks one from the device, then steps down if the frame rate is
 * too low and remembers that for the next visit.
 *
 * Rule: switching effects changes shader variants (a recompile = a hitch), so a
 * new tier is only APPLIED between runs (menu / game over). Mid-run, auto can
 * only lower the pixel ratio, which is free.
 */
export type Tier = 'high' | 'medium' | 'low'
export type QualitySetting = 'auto' | Tier

export interface TierSpec {
  /** max device pixel ratio rendered */
  dpr: number
  /** bloom (neon glow) post-processing */
  bloom: boolean
  /** MSAA samples on the post-processing buffer (0 = none) */
  msaa: number
  /** bloom buffer resolution scale */
  bloomScale: number
  /** directional light shadow map size */
  shadowMap: number
}

export const TIERS: Record<Tier, TierSpec> = {
  high: { dpr: 1.5, bloom: true, msaa: 2, bloomScale: 0.75, shadowMap: 1024 },
  medium: { dpr: 1, bloom: true, msaa: 0, bloomScale: 0.5, shadowMap: 1024 },
  low: { dpr: 0.8, bloom: false, msaa: 0, bloomScale: 0.5, shadowMap: 512 },
}
const ORDER: Tier[] = ['high', 'medium', 'low']

const SETTING_KEY = 'lane-runner:quality'
const AUTO_KEY = 'lane-runner:quality-auto'

const read = (k: string) => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v)
  } catch {
    /* storage unavailable */
  }
}

/** First guess from the hardware: few cores / little memory → low; phones / tablets → medium. */
export function guessTier(): Tier {
  if (typeof navigator === 'undefined') return 'high'
  const nav = navigator as Navigator & { deviceMemory?: number }
  const cores = nav.hardwareConcurrency ?? 4
  const memory = nav.deviceMemory ?? 4
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
  if (cores <= 2 || memory <= 2) return 'low'
  if (coarse || cores <= 4) return 'medium'
  return 'high'
}

const isTier = (v: unknown): v is Tier => v === 'high' || v === 'medium' || v === 'low'

interface QualityStore {
  /** player's choice (auto or a fixed tier) */
  setting: QualitySetting
  /** auto mode's current tier (persisted) */
  autoTier: Tier
  /** tier the renderer is using right now (changes only between runs) */
  applied: Tier
  /** extra pixel-ratio cap applied mid-run when auto detects a struggle (1 = none) */
  dprCap: number
  setSetting: (s: QualitySetting) => void
  /** frame rate too low: step down (pixel ratio now, effects next run) */
  decline: () => void
  /** switch the renderer to the wanted tier (only call between runs) */
  apply: () => void
}

const wanted = (s: Pick<QualityStore, 'setting' | 'autoTier'>): Tier => (s.setting === 'auto' ? s.autoTier : s.setting)

const savedSetting = read(SETTING_KEY)
const savedAuto = read(AUTO_KEY)
const initialSetting: QualitySetting = savedSetting === 'auto' || isTier(savedSetting) ? savedSetting : 'auto'
const initialAuto: Tier = isTier(savedAuto) ? savedAuto : guessTier()

export const useQuality = create<QualityStore>((set, get) => ({
  setting: initialSetting,
  autoTier: initialAuto,
  applied: wanted({ setting: initialSetting, autoTier: initialAuto }),
  dprCap: 1,

  setSetting: (setting) => {
    write(SETTING_KEY, setting)
    set({ setting, dprCap: 1 })
    // Safe to switch right away when not mid-run.
    const phase = useGameStore.getState().phase
    if (phase !== 'playing' && phase !== 'dying') get().apply()
  },

  decline: () => {
    const s = get()
    if (s.setting !== 'auto') return
    const i = ORDER.indexOf(s.autoTier)
    // Mid-run: lower the resolution once (resizing the effect buffers costs a
    // short hitch on slow devices, so never more than once per run) …
    if (s.dprCap === 1) set({ dprCap: 0.8 })
    // … and remember a lower tier for the next run / visit.
    if (i < ORDER.length - 1) {
      const next = ORDER[i + 1]
      write(AUTO_KEY, next)
      set({ autoTier: next })
    }
  },

  apply: () => {
    const s = get()
    const tier = wanted(s)
    if (tier === s.applied) return
    set({ applied: tier, dprCap: 1 })
    // Effects changed → shader variants changed: re-warm every pooled renderer
    // now (on the menu / game-over screen), not when objects appear mid-run.
    requestWarmup()
  },
}))

/** Pixel ratio to render at for a tier on this screen. */
export function pixelRatio(tier: Tier, cap = 1): number {
  const device = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1
  return Math.max(0.5, Math.min(device, TIERS[tier].dpr) * cap)
}

// Apply a pending tier change whenever we're between runs.
useGameStore.subscribe((s, prev) => {
  if (s.phase === prev.phase) return
  if (s.phase === 'start' || s.phase === 'gameover') useQuality.getState().apply()
})
