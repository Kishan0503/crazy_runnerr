import { useEffect } from 'react'
import { useGameStore } from './store'
import { suspendAudio } from '../audio/audio'

/**
 * Auto-pause (Phase 2): when the tab is hidden, the app is backgrounded or the
 * window loses focus mid-run, pause the game (resume is manual, via the pause
 * overlay). Audio is suspended whenever the page is hidden, in any phase, and
 * comes back when it's visible again.
 */
export function useAutoPause() {
  useEffect(() => {
    const pauseIfPlaying = () => {
      const { phase, pause } = useGameStore.getState()
      if (phase === 'playing') pause()
    }
    const onVisibility = () => {
      if (document.hidden) {
        pauseIfPlaying()
        suspendAudio(true)
      } else {
        suspendAudio(false)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('blur', pauseIfPlaying)
    window.addEventListener('pagehide', pauseIfPlaying)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('blur', pauseIfPlaying)
      window.removeEventListener('pagehide', pauseIfPlaying)
    }
  }, [])
}
