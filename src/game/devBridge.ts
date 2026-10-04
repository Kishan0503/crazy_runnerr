import { world } from './world'
import { player } from './playerState'
import { useGameStore } from './store'
import { emit, on } from './events'
import { useCharacterStore } from './characterStore'

/**
 * Dev-only debug bridge. Exposes the live runtime on `window.__game` so it can
 * be inspected/driven from the console or an automated headless test. Guarded by
 * import.meta.env.DEV, so it is tree-shaken out of production builds entirely.
 */
export function installDevBridge() {
  if (!import.meta.env.DEV) return
  ;(window as unknown as { __game: unknown }).__game = {
    world,
    player,
    store: useGameStore,
    events: { on, emit },
    characters: useCharacterStore,
  }

  installDebugTools()

  // Headless verification helper: `?autoplay` jumps straight into a run once the
  // scene is ready, so automated screenshots can capture live gameplay.
  if (new URLSearchParams(location.search).has('autoplay')) {
    const unsub = useGameStore.subscribe((s) => {
      if (s.ready && s.phase === 'start') {
        unsub()
        setTimeout(() => useGameStore.getState().start(), 50)
      }
    })
  }
}

/**
 * Debug mode (Phase 0): tuning panel + FPS stats + hitbox/god-mode tools.
 * Enabled by `?debug` or toggled with the backtick key. The panel module (and
 * lil-gui) is dynamically imported, so none of it ships in production.
 */
async function installDebugTools() {
  const [{ useDebugStore, debugObstacles }, panel] = await Promise.all([
    import('./debug/flags'),
    import('./debug/tuningPanel'),
  ])
  // Live obstacles (lane/kind/z) for console inspection and scripted tests.
  Object.assign((window as unknown as { __game: object }).__game, { obstacles: debugObstacles })
  // Saved tweaks apply even when the panel stays closed, so tuning sticks.
  panel.applySavedTuning()

  useDebugStore.subscribe((s, prev) => {
    if (s.enabled === prev.enabled) return
    if (s.enabled) void panel.showTuningPanel()
    else panel.hideTuningPanel()
  })

  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Backquote' || e.repeat) return
    const target = e.target as HTMLElement | null
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
    const { enabled, setEnabled } = useDebugStore.getState()
    setEnabled(!enabled)
  })

  // `?debug` enables debug mode; `?debug=god,hitboxes` also pre-enables tools
  // (handy for headless screenshots).
  const param = new URLSearchParams(location.search).get('debug')
  if (param !== null) {
    const opts = param.split(',')
    useDebugStore.setState({ godMode: opts.includes('god'), showHitboxes: opts.includes('hitboxes') })
    useDebugStore.getState().setEnabled(true)
  }
}
