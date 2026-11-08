import { useEffect, useRef, useState } from 'react'
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
  const playerShown = useGameStore((s) => s.playerShown)
  // Safety net: never wait more than 3 s for the character's first frames.
  const [waitedLong, setWaitedLong] = useState(false)
  const [done, setDone] = useState(false)
  const [gone, setGone] = useState(false)
  // Shown progress: 3D files make up most of the bar, the scene + character list
  // the rest. It never goes backwards (a model queued late used to drop it from
  // 100% to 0%) and only reaches 100% when the game is really ready.
  const shown = useRef(0)

  // Finished = canvas painted + catalog resolved + nothing left loading.
  const assetsDone = ready && charLoaded && !active && progress >= 100
  useEffect(() => {
    if (!assetsDone) return
    const t = setTimeout(() => setWaitedLong(true), 3000)
    return () => clearTimeout(t)
  }, [assetsDone])
  // …and the character drawn, so its shaders compile behind this screen.
  const finished = assetsDone && (playerShown || waitedLong)
  useEffect(() => {
    if (done || !finished) return
    // Short grace period so a model that starts loading right after the catalog
    // resolves is still covered (avoids a flash of the empty scene).
    const t = setTimeout(() => {
      if (!useProgress.getState().active) setDone(true)
    }, 120)
    return () => clearTimeout(t)
  }, [finished, done])
  useEffect(() => {
    if (!done) return
    // Vehicles, ramp and audio load only now, so they never hold up the
    // loading screen or compete with the game files on a slow connection.
    const pre = setTimeout(() => useGameStore.getState().setBooted(), 300)
    const t = setTimeout(() => setGone(true), 350) // after the fade-out
    return () => {
      clearTimeout(t)
      clearTimeout(pre)
    }
  }, [done])

  if (gone) return null
  const target = finished || done ? 100 : Math.min(97, Math.min(progress, 100) * 0.8 + (ready ? 10 : 0) + (charLoaded ? 10 : 0))
  shown.current = Math.max(shown.current, target)
  const pct = Math.round(shown.current)

  return (
    <div
      className={`absolute inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-[var(--cr-ink)] transition-opacity duration-[350ms] ${done ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
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
