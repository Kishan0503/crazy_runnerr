import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '../game/store'
import { useAuthStore } from '../game/auth'
import { useCharacterStore } from '../game/characterStore'
import { cosmeticTint } from '../game/characters'
import { useAuthUi } from './AuthModal'
import { useCharacterUi } from './CharacterSelect'

/* ----------------------------- inline icons ------------------------------ */
function CoinIcon({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-block rounded-full ${className}`}
      style={{
        background: 'radial-gradient(circle at 35% 30%, #ffe89a, #f5b21f 60%, #c8860a)',
        boxShadow: '0 0 10px rgba(245,178,31,0.6), inset 0 1px 2px rgba(255,255,255,0.5)',
      }}
    />
  )
}
function PlayGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
      <path d="M8 5.5v13a1 1 0 0 0 1.54.84l10-6.5a1 1 0 0 0 0-1.68l-10-6.5A1 1 0 0 0 8 5.5z" />
    </svg>
  )
}
function CrownGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        d="M3 7l4 4 5-7 5 7 4-4-1.5 12H4.5L3 7z"
        fill="#f5b21f"
        stroke="#ffd970"
        strokeWidth="0.6"
      />
    </svg>
  )
}
function TrophyGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4z" />
      <path d="M7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3" />
      <path d="M12 13v3M9 20h6M10 20l.5-4h3l.5 4" />
    </svg>
  )
}
function GearGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" />
    </svg>
  )
}
function ArrowGlyph({ dir }: { dir: 'left' | 'up' | 'down' }) {
  const rot = dir === 'left' ? 0 : dir === 'up' ? 90 : -90
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: `rotate(${rot}deg)` }} aria-hidden="true">
      <path d="M19 12H5M5 12l6-6M5 12l6 6" />
    </svg>
  )
}

function UserGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-3.5 3.6-6 8-6s8 2.5 8 6" />
    </svg>
  )
}

/**
 * Account control (top bar). Guest → a "Log In" button that opens the auth
 * modal. Logged in → the display name (or "Player") with a Log Out action.
 */
function AccountControl() {
  const status = useAuthStore((s) => s.status)
  const profile = useAuthStore((s) => s.profile)
  const signOut = useAuthStore((s) => s.signOut)
  const openModal = useAuthUi((s) => s.openModal)

  if (status === 'authed') {
    const name = profile?.display_name || 'Player'
    return (
      <div className="cr-panel flex items-center gap-2 py-1.5 pl-3 pr-1.5">
        <span className="text-white/80"><UserGlyph /></span>
        <span className="max-w-[7rem] truncate text-sm font-semibold text-white">{name}</span>
        <button
          type="button"
          onClick={() => signOut()}
          className="cr-label ml-1 rounded-lg px-2 py-1 hover:text-white/90 hover:underline"
        >
          Log Out
        </button>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => openModal()}
      className="cr-panel flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10"
    >
      <UserGlyph />
      Log In
    </button>
  )
}

/** Clickable "Character" cell on the start screen — opens the picker. */
function CharacterCard() {
  const activeId = useCharacterStore((s) => s.activeId)
  const active = useCharacterStore((s) => s.activeCharacter())
  const openPicker = useCharacterUi((s) => s.openModal)
  const name = active?.name ?? 'Runner'
  return (
    <button
      type="button"
      onClick={() => openPicker()}
      className="pointer-events-auto flex items-center gap-3 px-5 py-3 text-left transition hover:bg-white/5"
    >
      <span
        className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--cr-panel-border)]"
        style={{ background: cosmeticTint(activeId), boxShadow: `0 0 10px ${cosmeticTint(activeId)}66` }}
      />
      <div>
        <div className="cr-label !text-[0.55rem]">Character</div>
        <div className="flex items-center gap-1 text-sm font-semibold text-white">
          {name}
          <span className="text-[0.6rem] text-[var(--cr-blue-bright)]">▸ change</span>
        </div>
      </div>
    </button>
  )
}

/** A how-to-play control hint cell. */
function HowTo({ glyph, label }: { glyph: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--cr-panel-border)] bg-white/5 text-white/90">
        {glyph}
      </span>
      <span className="cr-label !text-[0.55rem]">{label}</span>
    </div>
  )
}

/**
 * Start screen (PRD §5), styled to the reference: a night-city neon look with a
 * heavy white/blue title, a glowing PLAY NOW pill, a best-distance card, and the
 * currently-selected character/track shown below the button.
 *
 * Flow: the player stays in Idle behind this screen (world is frozen). Pressing
 * PLAY NOW (or Enter/Space) flags `starting`, which plays a polished fade/lift-out
 * of all UI; only when that finishes does start() run — flipping the world on and
 * switching the character to the Run animation.
 */
export function StartScreen() {
  const phase = useGameStore((s) => s.phase)
  const best = useGameStore((s) => s.best)
  const wallet = useGameStore((s) => s.wallet)
  const ready = useGameStore((s) => s.ready)
  const starting = useGameStore((s) => s.starting)
  const beginStart = useGameStore((s) => s.beginStart)
  const start = useGameStore((s) => s.start)

  // Reveal the screen once the scene has painted (fallback timer if it never does).
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (ready) {
      setArmed(true)
      return
    }
    const t = setTimeout(() => setArmed(true), 1500)
    return () => clearTimeout(t)
  }, [ready])

  // When the exit transition is requested, the player rig plays the 180° turn
  // and calls start() the instant it blends into the run (the intended trigger).
  // This timer is only a SAFETY FALLBACK: if the rig can't run the turn (model
  // missing / placeholder), start() still fires so the game never hangs. start()
  // is idempotent, so whichever fires first wins.
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!starting) return
    exitTimer.current = setTimeout(() => start(), 1300)
    return () => {
      if (exitTimer.current) clearTimeout(exitTimer.current)
    }
  }, [starting, start])

  if (phase !== 'start') return null

  const reveal = (_i?: number) => (armed && !starting ? 'cr-enter' : '')
  const style = (i: number): React.CSSProperties =>
    armed ? { animationDelay: `${i * 0.08}s` } : { visibility: 'hidden' }

  return (
    <div
      className={`absolute inset-0 z-20 overflow-hidden bg-[radial-gradient(120%_80%_at_50%_-10%,rgba(20,40,90,0.35),transparent_60%)] ${
        starting ? 'cr-exit' : ''
      }`}
    >
      {/* Top bar: coin wallet (left), trophy + settings (right) */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4 sm:p-5">
        <div className={`cr-panel flex items-center gap-2 py-1.5 pl-2 pr-1.5 ${reveal(0)}`} style={style(0)}>
          <CoinIcon className="h-5 w-5" />
          <span className="text-base font-bold tabular-nums text-amber-200">{wallet}</span>
          <button type="button" aria-label="Add coins" className="cr-icon-btn ml-1 h-7 w-7 rounded-xl text-lg leading-none">
            +
          </button>
        </div>

        <div className={`flex items-center gap-2.5 ${reveal(0)}`} style={style(0)}>
          <AccountControl />
          <button type="button" aria-label="Leaderboard" className="cr-icon-btn h-10 w-10 rounded-xl">
            <TrophyGlyph />
          </button>
          <button type="button" aria-label="Settings" className="cr-icon-btn h-10 w-10 rounded-xl">
            <GearGlyph />
          </button>
        </div>
      </div>

      {/* Best distance card (left, vertically centered) */}
      <div
        className={`cr-panel absolute left-4 top-1/2 hidden -translate-y-1/2 px-5 py-4 sm:left-6 sm:block ${reveal(3)}`}
        style={style(3)}
      >
        <div className="cr-label">Best Distance</div>
        <div className="mt-1 flex items-end gap-1">
          <span className="text-3xl font-extrabold tabular-nums text-white">{best}</span>
          <span className="mb-1 text-sm font-semibold text-white/55">m</span>
        </div>
        <div className="mt-1"><CrownGlyph /></div>
      </div>

      {/* Center stack — nudged up so the runner/track below stays uncluttered.
          pointer-events-none so this full-screen layer doesn't swallow clicks
          meant for the top-bar buttons behind it; interactive children (the Play
          button) re-enable pointer events themselves. */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center -translate-y-[9vh] sm:-translate-y-[11vh]">
        <p className={`cr-label !tracking-[0.32em] ${reveal(0)}`} style={style(0)}>
          How far can you go?
        </p>

        <h1 className={`cr-title my-2 text-6xl sm:text-8xl ${armed && !starting ? 'cr-title-enter' : ''}`} style={style(1)}>
          <span className="cr-word cr-word-1">Crazzy</span>
          <span className="cr-word cr-word-2">Runnerr</span>
        </h1>

        <p className={`cr-tagline ${reveal(2)}`} style={style(2)}>
          Switch Lanes. Jump. Slide. Survive.
        </p>

        <button
          type="button"
          onClick={() => beginStart()}
          className={`cr-play pointer-events-auto mt-7 flex items-center gap-3 px-9 py-4 text-lg ${reveal(3)}`}
          style={style(3)}
        >
          <PlayGlyph />
          Play Now
        </button>

        {/* Selected character (opens the picker) + track */}
        <div
          className={`cr-panel mt-7 flex items-stretch divide-x divide-[var(--cr-panel-border)] ${reveal(4)}`}
          style={style(4)}
        >
          <CharacterCard />
          <div className="flex items-center gap-3 px-5 py-3 text-left">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--cr-panel-border)]"
              style={{ background: 'radial-gradient(circle at 50% 35%, rgba(59,130,246,0.5), rgba(8,12,22,0.6))' }}
            >
              <span className="h-2 w-2 rounded-full bg-[var(--cr-blue-bright)] shadow-[0_0_8px_var(--cr-blue-bright)]" />
            </span>
            <div>
              <div className="cr-label !text-[0.55rem]">Track</div>
              <div className="text-sm font-semibold text-white">Neon City</div>
            </div>
          </div>
        </div>
      </div>

      {/* How to play (bottom center) */}
      <div className={`absolute inset-x-0 bottom-6 flex justify-center ${reveal(5)}`} style={style(5)}>
        <div className="cr-panel flex items-center gap-6 px-6 py-3">
          <span className="cr-label hidden sm:block">How to Play</span>
          <HowTo glyph={<ArrowGlyph dir="left" />} label="Switch" />
          <HowTo glyph={<ArrowGlyph dir="up" />} label="Jump" />
          <HowTo glyph={<ArrowGlyph dir="down" />} label="Slide" />
        </div>
      </div>
    </div>
  )
}
