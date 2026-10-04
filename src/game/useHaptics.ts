import { useEffect } from 'react'
import { on } from './events'
import { useSettings } from './settings'

/** Vibrate briefly if supported (Android Chrome) and enabled. iOS ignores it. */
function buzz(ms: number) {
  if (!useSettings.getState().vibration) return
  try {
    navigator.vibrate?.(ms)
  } catch {
    /* unsupported — ignore */
  }
}

/** Haptic feedback for impacts (Phase 2). Mount once at the app root. */
export function useHaptics() {
  useEffect(() => {
    const offs = [
      on('crash', () => buzz(80)),
      on('stumble', () => buzz(35)),
      on('nearMiss', () => buzz(15)),
    ]
    return () => offs.forEach((off) => off())
  }, [])
}
