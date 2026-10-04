import { create } from 'zustand'

/**
 * Player preferences, persisted to localStorage. Phase 1 adds the first one;
 * the Settings menu (Phase 7) will extend this store (audio, quality, …).
 */
interface Settings {
  /** show the on-screen arrow buttons on touch devices (default: swipe only) */
  showTouchButtons: boolean
}

interface SettingsStore extends Settings {
  set: (patch: Partial<Settings>) => void
}

const KEY = 'lane-runner:settings'
const DEFAULTS: Settings = { showTouchButtons: false }

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
    const { showTouchButtons } = get()
    try {
      localStorage.setItem(KEY, JSON.stringify({ showTouchButtons }))
    } catch {
      /* storage unavailable — keep in memory */
    }
  },
}))
