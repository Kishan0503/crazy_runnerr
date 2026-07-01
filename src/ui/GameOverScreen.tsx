import { useGameStore } from '../game/store'

/** A labeled stat block for the game-over summary. */
function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <span
        className={`text-3xl font-extrabold tabular-nums ${accent ? 'text-amber-300' : 'text-white'}`}
      >
        {value}
      </span>
      <span className="cr-label mt-1">{label}</span>
    </div>
  )
}

/**
 * Game Over screen (PRD §5): final distance, best distance, coins collected, a
 * primary "Tap to retry" action, and a "Quit to Main Menu" action. Tapping
 * anywhere (or Enter/Space via useMetaControls) retries; uses pointerdown
 * (not click) so the action fires on first touch/click, immediately. Shown
 * only in the `gameover` phase.
 */
export function GameOverScreen() {
  const phase = useGameStore((s) => s.phase)
  const start = useGameStore((s) => s.start)
  const quit = useGameStore((s) => s.quit)
  const lastDistance = useGameStore((s) => s.lastDistance)
  const best = useGameStore((s) => s.best)
  const coins = useGameStore((s) => s.coins)

  if (phase !== 'gameover') return null

  const isNewBest = lastDistance >= best && lastDistance > 0

  return (
    <div
      className="absolute inset-0 z-20 flex cursor-pointer flex-col items-center justify-center gap-7 bg-[radial-gradient(120%_80%_at_50%_-10%,rgba(20,40,90,0.4),rgba(0,0,0,0.72))] px-6 text-center backdrop-blur-sm"
      // pointerdown (not click) so retry fires on first contact — a synthetic
      // click after touchend can land back on the canvas if a swipe/tap was
      // still in flight the instant gameOver() swapped this screen in.
      onPointerDown={() => start()}
    >
      <div className="flex flex-col items-center gap-3">
        {isNewBest && (
          <span className="rounded-full border border-amber-300/40 bg-amber-400/90 px-3 py-1 text-xs font-bold uppercase tracking-widest text-black shadow-[0_0_18px_rgba(245,178,31,0.5)]">
            New best!
          </span>
        )}
        <h2 className="cr-title text-6xl"><span className="cr-word-2">Game Over</span></h2>
      </div>

      <div className="cr-panel flex items-start gap-9 px-8 py-5">
        <Stat label="Distance" value={lastDistance} />
        <Stat label="Best" value={best} />
        <Stat label="Coins" value={coins} accent />
      </div>

      <div className="flex items-center gap-4">
        <button
          type="button"
          onPointerDown={(e) => {
            e.stopPropagation()
            start()
          }}
          className="cr-play pointer-events-auto px-9 py-4 text-lg"
        >
          Tap to retry
        </button>
        <button
          type="button"
          onPointerDown={(e) => {
            e.stopPropagation()
            quit()
          }}
          className="cr-panel pointer-events-auto px-7 py-4 text-lg font-semibold text-white/80 hover:text-white"
        >
          Quit to Main Menu
        </button>
      </div>
    </div>
  )
}
