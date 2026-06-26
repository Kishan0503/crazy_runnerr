import { useEffect, useRef, useState } from 'react'
import { world } from '../game/world'
import { CONFIG } from '../game/config'
import { scoreOf, useGameStore } from '../game/store'

function CoinIcon() {
  return (
    <span
      className="inline-block h-4 w-4 rounded-full"
      style={{
        background: 'radial-gradient(circle at 35% 30%, #ffe89a, #f5b21f 60%, #c8860a)',
        boxShadow: '0 0 8px rgba(245,178,31,0.6), inset 0 1px 2px rgba(255,255,255,0.5)',
      }}
    />
  )
}
function CrownGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <path d="M3 7l4 4 5-7 5 7 4-4-1.5 12H4.5L3 7z" fill="#f5b21f" stroke="#ffd970" strokeWidth="0.6" />
    </svg>
  )
}
function SwipeHand() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11M12 11V4.5a1.5 1.5 0 0 1 3 0V11M15 11V6.5a1.5 1.5 0 0 1 3 0V13c0 3.5-1.5 7-5 7h-1.5c-2 0-3-1-4-2.5L6 14a1.4 1.4 0 0 1 2.3-1.6L9 13V8.5a1.5 1.5 0 0 1 3 0" />
    </svg>
  )
}

/**
 * In-game HUD (PRD §5, §12), styled to the reference: coin pill + best-distance
 * card (top-left), the big distance read-out (top-center), a pause button and a
 * multiplier/score badge (top-right), and a swipe hint that fades after the run
 * begins.
 *
 * Distance and score change every frame, so they are updated IMPERATIVELY via a
 * requestAnimationFrame loop writing textContent — never React state — to keep
 * gameplay free of per-frame re-renders (§8.3, §13).
 */
export function Hud() {
  const phase = useGameStore((s) => s.phase)
  const pause = useGameStore((s) => s.pause)
  const best = useGameStore((s) => s.best)
  const distRef = useRef<HTMLSpanElement>(null)
  const coinRef = useRef<HTMLSpanElement>(null)
  const scoreRef = useRef<HTMLSpanElement>(null)

  // Swipe hint: visible briefly at the start of each run, then fades.
  const [hintFading, setHintFading] = useState(false)
  useEffect(() => {
    if (phase !== 'playing') return
    setHintFading(false)
    const t = setTimeout(() => setHintFading(true), 3200)
    return () => clearTimeout(t)
  }, [phase])

  useEffect(() => {
    let raf = 0
    const tick = () => {
      const coins = useGameStore.getState().coins
      if (distRef.current) distRef.current.textContent = String(Math.floor(world.distance))
      if (coinRef.current) coinRef.current.textContent = String(coins)
      if (scoreRef.current)
        scoreRef.current.textContent = String(scoreOf(world.distance, coins, CONFIG.coinValue))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  // Visible during play and pause (frozen numbers behind the pause overlay).
  if (phase !== 'playing' && phase !== 'paused') return null

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {/* Top-left: coin pill + best-distance card */}
      <div className="cr-hud-in absolute left-4 top-4 flex flex-col gap-3">
        <div className="cr-panel flex w-fit items-center gap-2 px-3 py-2">
          <CoinIcon />
          <span ref={coinRef} className="text-base font-bold tabular-nums text-amber-200">0</span>
        </div>
        <div className="cr-panel hidden px-4 py-3 sm:block">
          <div className="cr-label">Best Distance</div>
          <div className="mt-0.5 flex items-end gap-1.5">
            <span className="text-xl font-extrabold tabular-nums text-white">{best}</span>
            <span className="mb-0.5 text-xs font-semibold text-white/55">m</span>
            <span className="mb-1"><CrownGlyph /></span>
          </div>
        </div>
      </div>

      {/* Top-center: distance read-out */}
      <div className="cr-hud-in absolute left-1/2 top-5 -translate-x-1/2 text-center">
        <div className="flex items-baseline justify-center gap-1.5">
          <span
            ref={distRef}
            className="text-5xl font-extrabold tabular-nums text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)]"
          >
            0
          </span>
          <span className="text-lg font-semibold text-white/55">m</span>
        </div>
        <div className="mx-auto mt-1 h-px w-28 bg-gradient-to-r from-transparent via-[var(--cr-blue-bright)] to-transparent opacity-70" />
      </div>

      {/* Top-right: pause */}
      <button
        type="button"
        aria-label="Pause"
        onClick={() => pause()}
        className="cr-icon-btn cr-hud-in pointer-events-auto absolute right-4 top-4 h-10 w-10 rounded-xl"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
          <rect x="6" y="5" width="4" height="14" rx="1" />
          <rect x="14" y="5" width="4" height="14" rx="1" />
        </svg>
      </button>

      {/* Right-center: multiplier + score */}
      <div className="cr-hud-in absolute right-4 top-1/2 hidden -translate-y-1/2 flex-col items-center gap-2 sm:flex">
        <div
          className="flex h-14 w-14 items-center justify-center rounded-full border text-lg font-extrabold text-white"
          style={{
            borderColor: 'rgba(120,165,255,0.5)',
            background: 'radial-gradient(circle at 50% 35%, rgba(40,70,130,0.55), rgba(8,12,22,0.65))',
            boxShadow: '0 0 18px rgba(59,130,246,0.35), inset 0 0 14px rgba(70,130,240,0.25)',
          }}
        >
          x1
        </div>
        <div className="text-center">
          <div className="cr-label">Score</div>
          <span ref={scoreRef} className="text-2xl font-extrabold tabular-nums text-white">0</span>
        </div>
      </div>

      {/* Bottom-center: swipe-to-move hint (fades out) */}
      <div
        className={`absolute inset-x-0 bottom-7 flex justify-center ${hintFading ? 'cr-fade-out-slow' : ''}`}
      >
        <div className="cr-panel flex flex-col items-center gap-1.5 px-7 py-3">
          <span className="cr-label">Swipe to Move</span>
          <div className="flex items-center gap-3 text-[var(--cr-blue-bright)]">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M19 12H5M5 12l6-6M5 12l6 6" />
            </svg>
            <span className="cr-hint-hand text-white/90"><SwipeHand /></span>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14M19 12l-6-6M19 12l-6 6" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  )
}
