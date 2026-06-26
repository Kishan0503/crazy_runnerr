import { useGameStore } from '../game/store'

/**
 * Pause overlay (optional, PRD §5). Freezes the loop (the store already set
 * world.running = false) and offers Resume or Quit-to-menu. Shown only in the
 * `paused` phase.
 */
export function PauseOverlay() {
  const phase = useGameStore((s) => s.phase)
  const resume = useGameStore((s) => s.resume)
  const quit = useGameStore((s) => s.quit)

  if (phase !== 'paused') return null

  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-7 bg-black/55 px-6 text-center backdrop-blur-sm">
      <h2 className="cr-title text-5xl"><span className="cr-word-1">Paused</span></h2>
      <div className="flex flex-col items-center gap-4">
        <button
          type="button"
          onClick={() => resume()}
          className="cr-play px-9 py-3.5 text-lg"
        >
          Resume
        </button>
        <button
          type="button"
          onClick={() => quit()}
          className="cr-label px-6 py-2 underline-offset-4 hover:text-white/90 hover:underline active:scale-95"
        >
          Quit to menu
        </button>
      </div>
    </div>
  )
}
