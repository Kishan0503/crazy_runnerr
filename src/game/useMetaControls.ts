import { useEffect } from 'react'
import { useGameStore } from './store'

/**
 * Meta (non-gameplay) keyboard controls (PRD §6):
 *   - Enter / Space → start or retry (start & game-over screens), or resume (paused)
 *   - Esc / P       → pause (playing) / resume (paused)
 *
 * Gameplay keys (lanes/jump/slide) are handled separately and only while playing,
 * so Space means "jump" mid-run but "start/retry" on the menus — no conflict.
 */
export function useMetaControls() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { phase, start, beginStart, pause, resume } = useGameStore.getState()

      if (e.code === 'Enter' || e.code === 'Space') {
        if (phase === 'start') {
          // Route through the polished exit transition (StartScreen owns it).
          e.preventDefault()
          beginStart()
        } else if (phase === 'gameover') {
          e.preventDefault()
          start()
        } else if (phase === 'paused') {
          e.preventDefault()
          resume()
        }
        // phase === 'playing' → Space is "jump", handled by gameplay controls.
      } else if (e.code === 'Escape' || e.code === 'KeyP') {
        if (phase === 'playing') {
          e.preventDefault()
          pause()
        } else if (phase === 'paused') {
          e.preventDefault()
          resume()
        }
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
