import { create } from 'zustand'

/**
 * Player preferences, persisted to localStorage. Phase 1 added touch buttons,
 * Phase 2 audio + vibration; the Settings menu (Phase 7) will expose them all.
 */
interface Settings {
  /** show the on-screen arrow buttons on touch devices (default: swipe only) */
  showTouchButtons: boolean
  /** master mute (music + sound effects) */
  muted: boolean
  /** music volume 0..1 */
  musicVolume: number
  /** sound-effect volume 0..1 */
  sfxVolume: number
  /** vibrate on impacts (Android only; iOS browsers can't vibrate) */
  vibration: boolean
}

interface SettingsStore extends Settings {
  set: (patch: Partial<Settings>) => void
}

const KEY = 'lane-runner:settings'
const DEFAULTS: Settings = {
  showTouchButtons: false,
  muted: false,
  musicVolume: 0.6,
  sfxVolume: 0.9,
  vibration: true,
}

function load(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return DEFAULTS
  }
}

export const useSettings = create<SettingsStore>((set, get) => ({
  ...load(),
  set: (patch) => {
    set(patch)
    const { showTouchButtons, muted, musicVolume, sfxVolume, vibration } = get()
    try {
      localStorage.setItem(KEY, JSON.stringify({ showTouchButtons, muted, musicVolume, sfxVolume, vibration }))
    } catch {
      /* storage unavailable — keep in memory */
    }
  },
}))
