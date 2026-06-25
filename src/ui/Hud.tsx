import { useEffect, useRef } from 'react'
import { world } from '../game/world'
import { useGameStore } from '../game/store'

/**
 * In-game HUD (PRD §5, §12): distance as the primary score (top, large, tabular)
 * and a coin counter, plus a pause button.
 *
 * The numbers change every frame, so they are updated IMPERATIVELY via a
 * requestAnimationFrame loop writing textContent — never React state — to keep
 * gameplay free of per-frame re-renders (§8.3, §13). Only the pause button is
 * interactive; the rest is pointer-events-none so it never eats gameplay input.
 */
export function Hud() {
  const phase = useGameStore((s) => s.phase)
  const pause = useGameStore((s) => s.pause)
  const distRef = useRef<HTMLSpanElement>(null)
  const coinRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    let raf = 0
    const tick = () => {
      if (distRef.current) distRef.current.textContent = String(Math.floor(world.distance))
      if (coinRef.current) coinRef.current.textContent = String(useGameStore.getState().coins)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  // Visible during play and pause (frozen numbers behind the pause overlay).
  if (phase !== 'playing' && phase !== 'paused') return null

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between p-4">
      {/* Coin counter (top-left) */}
      <div className="flex items-center gap-2 rounded-xl bg-black/30 px-3 py-2 backdrop-blur-sm">
        <span className="inline-block h-4 w-4 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.7)]" />
        <span ref={coinRef} className="text-lg font-bold tabular-nums text-amber-300">
          0
        </span>
      </div>

      {/* Distance (top-center, primary) */}
      <div className="absolute left-1/2 top-4 -translate-x-1/2 text-center">
        <div className="flex items-baseline gap-1">
          <span
            ref={distRef}
            className="text-4xl font-black tabular-nums text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]"
          >
            0
          </span>
          <span className="text-base font-semibold text-white/60">m</span>
        </div>
      </div>

      {/* Pause (top-right) */}
      <button
        type="button"
        aria-label="Pause"
        onClick={() => pause()}
        className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-xl bg-black/30 text-lg text-white/90 backdrop-blur-sm active:scale-95"
      >
        ⏸
      </button>
    </div>
  )
}
