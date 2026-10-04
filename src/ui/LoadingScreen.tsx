import { useEffect, useState } from 'react'
import { useProgress } from '@react-three/drei'
import { useGameStore } from '../game/store'
import { useCharacterStore } from '../game/characterStore'

/**
 * First-load screen (Phase 3): title + progress bar while the critical 3D assets
 * download (equipped character, shared animations, obstacles, coin — everything
 * that goes through three's loading manager). Music streams in separately and
 * isn't waited for. Shown once per page load; later loads (e.g. switching
 * characters) don't bring it back.
 */
export function LoadingScreen() {
  const { active, progress, errors } = useProgress()
  const ready = useGameStore((s) => s.ready)
  const charLoaded = useCharacterStore((s) => s.loaded)
  const [done, setDone] = useState(false)
  const [gone, setGone] = useState(false)

  // Finished = canvas painted + catalog resolved + nothing left loading.
  const finished = ready && charLoaded && !active && progress >= 100
  useEffect(() => {
    if (done || !finished) return
    // Small grace period so a model that starts loading right after the catalog
    // resolves is still covered (avoids a flash of the empty scene).
    const t = setTimeout(() => {
      if (!useProgress.getState().active) setDone(true)
    }, 250)
    return () => clearTimeout(t)
  }, [finished, done])
  useEffect(() => {
    if (!done) return
    const t = setTimeout(() => setGone(true), 450) // after the fade-out
    return () => clearTimeout(t)
  }, [done])

  if (gone) return null
  const pct = Math.round(Math.min(progress, 100))

  return (
    <div
      className={`absolute inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-[var(--cr-ink)] transition-opacity duration-[450ms] ${done ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
      role="progressbar"
      aria-label="Loading game"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
    >
      <h1 className="cr-title text-center text-5xl sm:text-7xl">
        <span className="cr-word cr-word-1">Crazzy</span>
        <span className="cr-word cr-word-2">Runnerr</span>
      </h1>
      <div className="flex w-64 flex-col items-center gap-3">
        <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-sky-400 to-blue-600 transition-[width] duration-300"
            style={{ width: `${Math.max(pct, 4)}%` }}
          />
        </div>
        <span className="cr-label">{errors.length ? 'Some assets failed — using fallbacks…' : `Loading… ${pct}%`}</span>
      </div>
    </div>
  )
}
