import { inputBus } from '../game/input'
import { useGameStore } from '../game/store'
import type { Intent } from '../game/types'

/**
 * On-screen control buttons — the touch fallback from the controls matrix (§6).
 * Rendered only on coarse-pointer (touch) devices; desktop uses keyboard.
 *
 * The container is pointer-events-none so it never steals gameplay swipes;
 * only the buttons themselves are interactive (§5).
 */
const isCoarsePointer =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(pointer: coarse)').matches

function ControlButton({ intent, label }: { intent: Intent; label: string }) {
  // Use pointerdown for immediate response; preventDefault avoids synthetic
  // double-fires and stray focus/zoom on mobile.
  const fire = (e: React.PointerEvent) => {
    e.preventDefault()
    inputBus.push(intent)
  }
  return (
    <button
      type="button"
      aria-label={intent}
      onPointerDown={fire}
      className="pointer-events-auto flex h-16 w-16 select-none items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-2xl text-white/90 backdrop-blur-sm active:scale-95 active:bg-white/25"
    >
      {label}
    </button>
  )
}

export function TouchControls() {
  const phase = useGameStore((s) => s.phase)
  // Touch fallback only on touch devices, and only while actually playing.
  if (!isCoarsePointer || phase !== 'playing') return null

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-end justify-between p-5 pb-8">
      {/* Left cluster: lane left / right */}
      <div className="flex gap-3">
        <ControlButton intent="left" label="◀" />
        <ControlButton intent="right" label="▶" />
      </div>
      {/* Right cluster: jump / slide */}
      <div className="flex gap-3">
        <ControlButton intent="slide" label="▼" />
        <ControlButton intent="jump" label="▲" />
      </div>
    </div>
  )
}
