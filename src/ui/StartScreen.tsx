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
 * Start screen (PRD §5): title, tagline, a primary "Tap to start" action, and a
 * compact control legend. Tapping anywhere (or Enter/Space via useMetaControls)
 * begins a fresh run. Shown only in the `start` phase.
 */
export function StartScreen() {
  const phase = useGameStore((s) => s.phase)
  const best = useGameStore((s) => s.best)
  const start = useGameStore((s) => s.start)

  if (phase !== 'start') return null

  return (
    <div
      className="absolute inset-0 z-20 flex cursor-pointer flex-col items-center justify-center gap-7 bg-gradient-to-b from-black/40 via-black/60 to-black/80 px-6 text-center backdrop-blur-sm"
      onClick={() => start()}
    >
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-5xl font-black tracking-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)] sm:text-6xl">
          Lane Runner
        </h1>
        <p className="max-w-xs text-sm text-white/70">
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
        className="pointer-events-auto rounded-2xl bg-white px-8 py-4 text-lg font-bold text-black shadow-lg transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-95"
      >
        Tap to start
      </button>

      <div className="flex flex-col gap-2 rounded-xl bg-black/30 p-4">
        <Legend keys="← →  /  A D  /  swipe" label="Switch lane" />
        <Legend keys="↑  /  W  /  Space  /  swipe up" label="Jump" />
        <Legend keys="↓  /  S  /  swipe down" label="Slide" />
      </div>

      {best > 0 && (
        <p className="text-xs uppercase tracking-widest text-white/50">
          Best distance {best}
        </p>
      )}
    </div>
  )
}
