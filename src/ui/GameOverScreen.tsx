import { useGameStore } from '../game/store'

/** A labeled stat block for the game-over summary. */
function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <span
        className={`text-3xl font-black tabular-nums ${accent ? 'text-amber-300' : 'text-white'}`}
      >
        {value}
      </span>
      <span className="text-xs uppercase tracking-widest text-white/50">{label}</span>
    </div>
  )
}

/**
 * Game Over screen (PRD §5): final distance, best distance, coins collected, and
 * a primary "Tap to retry" action. Tapping anywhere (or Enter/Space via
 * useMetaControls) starts a fresh run. Shown only in the `gameover` phase.
 */
export function GameOverScreen() {
  const phase = useGameStore((s) => s.phase)
  const start = useGameStore((s) => s.start)
  const lastDistance = useGameStore((s) => s.lastDistance)
  const best = useGameStore((s) => s.best)
  const coins = useGameStore((s) => s.coins)

  if (phase !== 'gameover') return null

  const isNewBest = lastDistance >= best && lastDistance > 0

  return (
    <div
      className="absolute inset-0 z-20 flex cursor-pointer flex-col items-center justify-center gap-6 bg-black/65 px-6 text-center backdrop-blur-sm"
      onClick={() => start()}
    >
      <div className="flex flex-col items-center gap-1">
        {isNewBest && (
          <span className="rounded-full bg-amber-400/90 px-3 py-1 text-xs font-bold uppercase tracking-widest text-black">
            New best!
          </span>
        )}
        <h2 className="text-5xl font-black tracking-tight text-white">Game Over</h2>
      </div>

      <div className="flex items-start gap-8">
        <Stat label="Distance" value={lastDistance} />
        <Stat label="Best" value={best} />
        <Stat label="Coins" value={coins} accent />
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          start()
        }}
        className="pointer-events-auto rounded-2xl bg-white px-8 py-4 text-lg font-bold text-black shadow-lg transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-95"
      >
        Tap to retry
      </button>
    </div>
  )
}
