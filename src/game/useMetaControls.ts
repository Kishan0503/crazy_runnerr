import { useEffect } from 'react'
import { useGameStore } from './store'
import { useAuthUi } from '../ui/AuthModal'
import { useCharacterUi } from '../ui/CharacterSelect'

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
      // Ignore keys typed into a form field (login/signup) — they must not start
      // or control the game.
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) {
        return
      }
      // A modal is open (auth / character picker) → no key starts the game.
      if (useAuthUi.getState().open || useCharacterUi.getState().open) return

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
