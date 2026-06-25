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
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 bg-black/55 px-6 text-center backdrop-blur-sm">
      <h2 className="text-4xl font-black tracking-tight text-white">Paused</h2>
      <div className="flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={() => resume()}
          className="rounded-2xl bg-white px-8 py-3 text-lg font-bold text-black active:scale-95"
        >
          Resume
        </button>
        <button
          type="button"
          onClick={() => quit()}
          className="rounded-xl px-6 py-2 text-sm font-semibold text-white/70 underline-offset-4 hover:underline active:scale-95"
        >
          Quit to menu
        </button>
      </div>
    </div>
  )
}
