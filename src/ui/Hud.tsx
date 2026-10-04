import { useEffect, useRef, useState } from 'react'
import { world } from '../game/world'
import { player } from '../game/playerState'
import { on } from '../game/events'
import { MuteButton } from './MuteButton'
import { CONFIG } from '../game/config'
import { scoreOf, useGameStore } from '../game/store'
import { activateAbility, getAbilitySnapshot } from '../game/ability'

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
 * Equipped-character ability control (HUD). Shows the ability name, charges left,
 * and an active countdown; tap (or press E) to activate. Hidden when the equipped
 * character has no ability. Polls the ability singleton on a rAF but only
 * re-renders when the meaningful state changes (charges / active / whole seconds).
 */
function AbilityButton() {
  const [snap, setSnap] = useState(getAbilitySnapshot())
  useEffect(() => {
    let raf = 0
    let prevKey = ''
    const tick = () => {
      const s = getAbilitySnapshot()
      const key = `${s.id}|${s.charges}|${s.active}|${Math.ceil(s.timeLeft)}`
      if (key !== prevKey) {
        prevKey = key
        setSnap(s)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  if (!snap.id) return null // equipped character has no ability
  const disabled = snap.charges <= 0 || snap.active

  return (
    <div className="pointer-events-none absolute bottom-24 left-1/2 -translate-x-1/2">
      <button
        type="button"
        onClick={() => activateAbility()}
        disabled={disabled}
        aria-label={`Activate ${snap.name}`}
        className={`pointer-events-auto flex flex-col items-center gap-1 rounded-2xl border px-5 py-2.5 backdrop-blur-sm transition active:scale-95 ${
          snap.active
            ? 'border-[var(--cr-blue-bright)] bg-[var(--cr-blue)]/30'
            : disabled
              ? 'border-white/10 bg-white/5 opacity-60'
              : 'border-[var(--cr-blue-bright)]/60 bg-white/10 hover:bg-white/15'
        }`}
      >
        <span className="text-sm font-bold uppercase tracking-wide text-white">
          {snap.active ? `${snap.name} ${Math.ceil(snap.timeLeft)}s` : snap.name}
        </span>
        <span className="flex items-center gap-1">
          {Array.from({ length: snap.maxCharges }, (_, i) => (
            <span
              key={i}
              className={`h-1.5 w-4 rounded-full ${
                i < snap.charges ? 'bg-[var(--cr-blue-bright)]' : 'bg-white/20'
              }`}
            />
          ))}
          <span className="ml-1 text-[0.6rem] font-semibold uppercase tracking-wider text-white/50">
            Tap / E
          </span>
        </span>
      </button>
    </div>
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
  const warnRef = useRef<HTMLDivElement>(null)
  const warnBarRef = useRef<HTMLDivElement>(null)
  const flashRef = useRef<HTMLDivElement>(null)
  const coinPillRef = useRef<HTMLDivElement>(null)

  // Coin pill pops on every pickup (Web Animations — no React re-render).
  useEffect(
    () =>
      on('coin', () =>
        coinPillRef.current?.animate(
          [{ transform: 'scale(1)' }, { transform: 'scale(1.22)' }, { transform: 'scale(1)' }],
          { duration: 180, easing: 'ease-out' },
        ),
      ),
    [],
  )

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
    let lastStumble = player.stumbleSeq
    let lastRun = world.runId
    const tick = () => {
      const coins = useGameStore.getState().coins
      if (distRef.current) distRef.current.textContent = String(Math.floor(world.distance))
      if (coinRef.current) coinRef.current.textContent = String(coins)
      if (scoreRef.current)
        scoreRef.current.textContent = String(scoreOf(world.distance, coins, CONFIG.coinValue))

      // Stumble warning: visible while the "next stumble is fatal" window runs,
      // its bar draining to empty. Updated imperatively like the numbers above.
      const left = player.stumbleTimer
      if (warnRef.current) warnRef.current.style.opacity = left > 0 ? '1' : '0'
      if (warnBarRef.current)
        warnBarRef.current.style.transform = `scaleX(${Math.min(1, left / CONFIG.stumbleWindow)})`

      // Red edge flash, once per new stumble (counters reset on a new run).
      if (world.runId !== lastRun) {
        lastRun = world.runId
        lastStumble = player.stumbleSeq
      }
      if (player.stumbleSeq !== lastStumble) {
        lastStumble = player.stumbleSeq
        flashRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 350, easing: 'ease-out' })
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  // Visible during play and pause (frozen numbers behind the pause overlay).
  if (phase !== 'playing' && phase !== 'paused' && phase !== 'dying') return null

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {/* Stumble: red edge flash (animated imperatively on each new stumble). */}
      <div
        ref={flashRef}
        className="absolute inset-0 opacity-0"
        style={{ boxShadow: 'inset 0 0 90px 24px rgba(255,40,60,0.55)' }}
      />

      {/* Stumble warning: shown while another stumble would end the run. */}
      <div
        ref={warnRef}
        className="absolute left-1/2 top-[6.5rem] -translate-x-1/2 opacity-0 transition-opacity duration-200"
      >
        <div className="cr-panel flex flex-col items-center gap-1.5 border-red-400/60 px-4 py-2">
          <span className="text-sm font-bold uppercase tracking-wider text-red-300">⚠ Careful!</span>
          <div className="h-1 w-24 overflow-hidden rounded-full bg-white/10">
            <div ref={warnBarRef} className="h-full w-full origin-left rounded-full bg-red-400" />
          </div>
        </div>
      </div>

      {/* Top-left: coin pill + best-distance card */}
      <div className="cr-hud-in absolute left-4 top-4 flex flex-col gap-3">
        <div ref={coinPillRef} className="cr-panel flex w-fit origin-left items-center gap-2 px-3 py-2">
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

      {/* Top-right: sound toggle + pause */}
      <MuteButton className="cr-hud-in absolute right-16 top-4 h-10 w-10 rounded-xl" />
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

      {/* Bottom-center: equipped-character ability control */}
      <AbilityButton />
    </div>
  )
}
