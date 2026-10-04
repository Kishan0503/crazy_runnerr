import { useEffect } from 'react'
import { inputBus } from './input'
import { useGameStore } from './store'
import { activateAbility } from './ability'
import { CONFIG } from './config'
import type { Intent } from './types'

/**
 * Swipe distance needed to fire a move: ~3.5% of the short screen side
 * (≈22px on a phone, ≈35px on desktop), clamped, times the tunable scale.
 */
function swipeThreshold(): number {
  const base = Math.min(42, Math.max(18, 0.035 * Math.min(window.innerWidth, window.innerHeight)))
  return base * CONFIG.swipeThresholdScale
}

/** True when the user is typing in a form field — keep those keys out of the game. */
function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

/** Pointers that start on UI controls (pause, ability, dev panel) never swipe. */
function isUiTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  return !!el?.closest?.('button, a, input, select, textarea, [data-no-swipe], .lil-gui')
}

const KEY_MAP: Record<string, Intent> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'jump',
  KeyW: 'jump',
  Space: 'jump',
  ArrowDown: 'slide',
  KeyS: 'slide',
}

/**
 * Wires keyboard + swipe input to the shared input bus (PRD §6). Mount once near
 * the app root. On-screen buttons push to the same bus directly.
 *
 * Swipes use Pointer Events, so touch, mouse-drag and pen share one path. A
 * swipe fires the moment the pointer has travelled far enough — while the finger
 * is still moving, not on lift-off — then re-anchors, so one continuous drag can
 * chain moves (e.g. right, then up).
 */
export function useGameControls() {
  useEffect(() => {
    // Gameplay input only counts while actually playing — Enter/Space on the
    // Start / Game Over screens are meta actions (see useMetaControls).
    const isPlaying = () => useGameStore.getState().phase === 'playing'

    const onKeyDown = (e: KeyboardEvent) => {
      // Ignore auto-repeat so a held key doesn't spam lane switches.
      if (e.repeat) return
      // Don't hijack keys while the user is typing in a form (login/signup).
      if (isTypingTarget(e.target)) return
      // Ability key (E): activate the equipped character's ability.
      if (e.code === 'KeyE') {
        if (isPlaying()) {
          e.preventDefault()
          activateAbility()
        }
        return
      }
      const intent = KEY_MAP[e.code]
      if (!intent) return
      if (!isPlaying()) return
      e.preventDefault()
      inputBus.push(intent)
    }

    let anchorX = 0
    let anchorY = 0
    let pointerId: number | null = null

    const stopTracking = () => {
      pointerId = null
    }

    const onPointerDown = (e: PointerEvent) => {
      // Gate on the phase so a swipe started right before a collision can't stay
      // armed into game-over (where its stray click would eat the first tap on
      // the Game Over screen).
      if (!isPlaying() || pointerId !== null) return
      if (e.pointerType === 'mouse' && e.button !== 0) return
      if (isUiTarget(e.target)) return
      pointerId = e.pointerId
      anchorX = e.clientX
      anchorY = e.clientY
    }

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return
      if (!isPlaying()) {
        stopTracking()
        return
      }
      const dx = e.clientX - anchorX
      const dy = e.clientY - anchorY
      const adx = Math.abs(dx)
      const ady = Math.abs(dy)
      if (Math.max(adx, ady) < swipeThreshold()) return

      // Dominant axis decides the move; fire now, mid-gesture.
      if (adx > ady) inputBus.push(dx > 0 ? 'right' : 'left')
      else inputBus.push(dy > 0 ? 'slide' : 'jump')

      // Re-anchor so continuing the drag in a new direction is a second move.
      anchorX = e.clientX
      anchorY = e.clientY
    }

    const onPointerEnd = (e: PointerEvent) => {
      if (e.pointerId === pointerId) stopTracking()
    }

    // Belt and braces with CSS `touch-action: none`: stop iOS scroll/zoom mid-swipe.
    const onTouchMove = (e: TouchEvent) => {
      if (pointerId !== null) e.preventDefault()
    }

    // Leaving 'playing' (game over, pause) always drops an in-flight swipe.
    const unsubscribe = useGameStore.subscribe((s, prev) => {
      if (s.phase !== prev.phase && s.phase !== 'playing') stopTracking()
    })

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerEnd)
    window.addEventListener('pointercancel', onPointerEnd)
    window.addEventListener('touchmove', onTouchMove, { passive: false })

    return () => {
      unsubscribe()
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerEnd)
      window.removeEventListener('pointercancel', onPointerEnd)
      window.removeEventListener('touchmove', onTouchMove)
    }
  }, [])
}
