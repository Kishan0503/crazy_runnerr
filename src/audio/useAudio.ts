import { useEffect } from 'react'
import { emit, on } from '../game/events'
import { coinPitch } from '../game/feedback'
import { CONFIG } from '../game/config'
import { useGameStore, type Phase } from '../game/store'
import { duckMusic, initAudio, playMusic, playSfx, slowMoMusic } from './audio'

const jitter = (amount: number) => 1 + (Math.random() * 2 - 1) * amount

/**
 * Wires game events + phases to sound (Phase 2). Mount once at the app root.
 *
 * Music: menu loop on the start/game-over screens, run loop while playing,
 * ducked under pause, pitch-bent down during the death slow-mo. SFX: one per
 * gameplay event, plus a click for every button press anywhere in the UI.
 */
export function useAudio() {
  const ready = useGameStore((s) => s.ready)

  useEffect(() => {
    if (!ready) return // load audio after the first frame is on screen
    initAudio()

    // ---- Gameplay SFX ----
    const offs = [
      on('jump', () => playSfx('jump', { rate: jitter(0.05) })),
      on('land', ({ hard }) => (hard ? playSfx('landHard') : playSfx('land', { rate: jitter(0.08) }))),
      on('slide', () => playSfx('whoosh', { rate: 0.85 })),
      on('fastFall', () => playSfx('whoosh', { rate: 1.2, volume: 1.2 })),
      on('laneChange', () => playSfx('whoosh', { rate: jitter(0.06) * 1.5, volume: 0.45 })),
      on('nearMiss', () => playSfx('whoosh', { rate: 1.05, volume: 1.4 })),
      on('coin', ({ streak }) => playSfx('coin', { rate: coinPitch(streak) })),
      on('stumble', () => playSfx('stumble')),
      on('crash', () => {
        playSfx('crash')
        playSfx('crashMetal')
        slowMoMusic(0.6, CONFIG.deathSlowMoTime * 1000)
      }),
      on('speedTier', () => playSfx('speedUp')),
      on('milestone', () => playSfx('milestone')),
      on('newBest', () => playSfx('newBest')),
      on('abilityOn', () => playSfx('abilityOn')),
      on('abilityOff', () => playSfx('abilityOff')),
      on('gameOver', ({ newBest }) => playSfx(newBest ? 'jingleNewBest' : 'jingleGameOver')),
      on('uiClick', () => playSfx('click')),
    ]

    // ---- UI clicks: any button press (except the dev panel) ----
    const onPointerDown = (e: PointerEvent) => {
      const el = e.target as HTMLElement | null
      if (el?.closest?.('button') && !el.closest('.lil-gui')) emit('uiClick')
    }
    window.addEventListener('pointerdown', onPointerDown, { capture: true })

    // ---- Music follows the game phase ----
    let gameOverTimer: ReturnType<typeof setTimeout> | undefined
    const applyPhase = (phase: Phase, prev?: Phase) => {
      clearTimeout(gameOverTimer)
      if (phase === 'playing') {
        if (prev === 'paused') duckMusic(false)
        else playMusic('musicRun')
      } else if (phase === 'paused') {
        duckMusic(true)
      } else if (phase === 'start') {
        playMusic('musicMenu')
      } else if (phase === 'gameover') {
        // Let the jingle play first, then bring the menu loop back in.
        gameOverTimer = setTimeout(() => playMusic('musicMenu'), 1400)
      }
      // 'dying' → the crash handler bends the run music down (above).
    }
    applyPhase(useGameStore.getState().phase)
    const unsubscribe = useGameStore.subscribe((s, prev) => {
      if (s.phase !== prev.phase) applyPhase(s.phase, prev.phase)
    })

    return () => {
      offs.forEach((off) => off())
      unsubscribe()
      clearTimeout(gameOverTimer)
      window.removeEventListener('pointerdown', onPointerDown, { capture: true })
    }
  }, [ready])
}
