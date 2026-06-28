import { useEffect } from 'react'
import { inputBus } from './input'
import { useGameStore } from './store'
import { activateAbility } from './ability'
import type { Intent } from './types'

/** Minimum touch travel to count as a swipe vs a tap (PRD §6). */
const SWIPE_THRESHOLD = 24

/** True when the user is typing in a form field — keep those keys out of the game. */
function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
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
 * Wires keyboard + touch-swipe input to the shared input bus (PRD §6).
 * Mount once near the app root. On-screen buttons push to the same bus directly.
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

    let startX = 0
    let startY = 0
    let tracking = false

    const onTouchStart = (e: TouchEvent) => {
      const t = e.changedTouches[0]
      startX = t.clientX
      startY = t.clientY
      tracking = true
    }

    const onTouchEnd = (e: TouchEvent) => {
      if (!tracking) return
      tracking = false
      if (!isPlaying()) return
      const t = e.changedTouches[0]
      const dx = t.clientX - startX
      const dy = t.clientY - startY
      const adx = Math.abs(dx)
      const ady = Math.abs(dy)

      // Below threshold → treat as a tap, not a swipe (used for start/retry later).
      if (Math.max(adx, ady) < SWIPE_THRESHOLD) return

      if (adx > ady) {
        inputBus.push(dx > 0 ? 'right' : 'left')
      } else {
        inputBus.push(dy > 0 ? 'slide' : 'jump')
      }
    }

    // touchmove preventDefault keeps the page from scrolling/zooming mid-swipe.
    const onTouchMove = (e: TouchEvent) => {
      if (tracking) e.preventDefault()
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', onTouchEnd, { passive: true })

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
    }
  }, [])
}
