import { useEffect, useState } from 'react'
import { useGameStore } from '../game/store'

/** A single control-legend row. */
function Legend({ keys, label }: { keys: string; label: string }) {
  return (
    <div className="flex items-center justify-between gap-6 text-sm">
      <span className="rounded-md bg-white/10 px-2 py-1 font-mono text-xs text-white/90">
        {keys}
      </span>
      <span className="text-white/70">{label}</span>
    </div>
  )
}

/**
 * Start screen (PRD §5) with an animated title reveal.
 *
 * Once the 3D scene is visible (store.ready, set on the canvas's first frame),
 * the running figure (player_running.gif) sweeps left→right and the game name
 * "Crazzyy Runnerr" is wiped in behind it, in sync — as if the runner unveils
 * the title. Gating on `ready` (with a fallback timer) ensures the reveal plays
 * for the user instead of behind the initial load. Reduced-motion shows it
 * instantly. Tapping anywhere (or Enter/Space) starts a fresh run.
 */
export function StartScreen() {
  const phase = useGameStore((s) => s.phase)
  const best = useGameStore((s) => s.best)
  const start = useGameStore((s) => s.start)
  const ready = useGameStore((s) => s.ready)

  // Play the reveal when the scene is up; fall back after a short wait so the
  // screen can never get stuck hidden if the ready signal never arrives.
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (ready) {
      setArmed(true)
      return
    }
    const t = setTimeout(() => setArmed(true), 1500)
    return () => clearTimeout(t)
  }, [ready])

  if (phase !== 'start') return null

  // Hidden until armed, then revealed via the play/animation classes.
  const hide = (style?: React.CSSProperties): React.CSSProperties | undefined =>
    armed ? style : { ...style, visibility: 'hidden' }

  return (
    <div
      className="absolute inset-0 z-20 flex cursor-pointer flex-col items-center justify-center gap-7 bg-gradient-to-b from-black/40 via-black/60 to-black/80 px-6 text-center backdrop-blur-sm"
      onClick={() => start()}
    >
      <div className="flex flex-col items-center gap-3">
        {/* Runner sweep + synced title wipe */}
        <div className="cr-title-wrap text-5xl sm:text-7xl">
          {armed && (
            <img src="/player_running.gif" alt="" aria-hidden="true" className="cr-runner" />
          )}
          <h1
            className={`cr-title whitespace-nowrap ${armed ? 'cr-title-play' : ''}`}
            style={hide()}
          >
            Crazzyy Runnerr
          </h1>
        </div>

        <p
          className={armed ? 'cr-reveal-delayed max-w-xs text-sm text-white/70' : 'max-w-xs text-sm text-white/70'}
          style={hide({ animationDelay: '1.5s' })}
        >
          Read the track. Switch, jump, and slide to survive — chase a longer
          distance every run.
        </p>
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          start()
        }}
        className={`pointer-events-auto rounded-2xl bg-white px-8 py-4 text-lg font-bold text-black shadow-lg transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-95 ${armed ? 'cr-reveal-delayed' : ''}`}
        style={hide({ animationDelay: '1.6s' })}
      >
        Tap to start
      </button>

      <div
        className={`flex flex-col gap-2 rounded-xl bg-black/30 p-4 ${armed ? 'cr-reveal-delayed' : ''}`}
        style={hide({ animationDelay: '1.7s' })}
      >
        <Legend keys="← →  /  A D  /  swipe" label="Switch lane" />
        <Legend keys="↑  /  W  /  Space  /  swipe up" label="Jump" />
        <Legend keys="↓  /  S  /  swipe down" label="Slide" />
      </div>

      {best > 0 && (
        <p
          className={`text-xs uppercase tracking-widest text-white/50 ${armed ? 'cr-reveal-delayed' : ''}`}
          style={hide({ animationDelay: '1.8s' })}
        >
          Best distance {best}
        </p>
      )}
    </div>
  )
}
