import { CONFIG } from '../config'
import { world } from '../world'
import { perfStats, useDebugStore } from './flags'
import { useSettings } from '../settings'
import { emit } from '../events'

/**
 * Live tuning panel (Phase 0, dev only). Binds lil-gui sliders directly to the
 * CONFIG object. `as const` is type-only — the object isn't frozen — so writes
 * take effect on the next frame for every value read per frame.
 *
 * Only per-frame values are exposed. Mount-time values (lanes, spawn/recycle Z,
 * camera, fog, hitboxes) are deliberately absent: changing them live would
 * desync the scene.
 *
 * Tweaks persist to localStorage and are re-applied on reload. "Copy as config"
 * puts the changed keys on the clipboard, ready to paste into config.ts.
 */

type Mutable<T> = { -readonly [K in keyof T]: T[K] }
type TunableKey = keyof typeof CONFIG & string

const STORAGE_KEY = 'lane-runner:dev-tuning'

/** [key, min, max, step] grouped by folder. */
const TUNABLES: Record<string, [TunableKey, number, number, number][]> = {
  Movement: [['laneLerp', 5, 30, 0.5]],
  Controls: [
    ['swipeThresholdScale', 0.4, 2.5, 0.05],
    ['inputBufferTime', 0, 0.3, 0.01],
  ],
  Jump: [
    ['jumpVelocity', 6, 18, 0.1],
    ['gravity', 10, 60, 0.5],
    ['jumpSpeedScaling', 0, 1, 0.05],
    ['fastFallVelocity', 5, 50, 0.5],
    ['fastFallGravityMult', 1, 5, 0.1],
  ],
  Rules: [['stumbleWindow', 0, 20, 0.5]],
  Juice: [
    ['shakeMax', 0, 1, 0.01],
    ['shakeDecay', 0.3, 5, 0.1],
    ['traumaCrash', 0, 1, 0.05],
    ['traumaStumble', 0, 1, 0.05],
    ['traumaHardLand', 0, 1, 0.05],
    ['fovKick', 0, 20, 0.5],
    ['fovPerTier', 0, 5, 0.1],
    ['deathSlowMo', 0.02, 1, 0.01],
    ['deathSlowMoTime', 0, 2, 0.05],
    ['gameOverLock', 0, 2, 0.05],
  ],
  Slide: [
    ['slideDuration', 0.3, 1.2, 0.01],
    ['slideLerp', 5, 30, 0.5],
  ],
  Speed: [
    ['speedStart', 8, 30, 0.5],
    ['speedTierStep', 0, 0.5, 0.01],
    ['speedMaxTier', 1, 3, 0.05],
  ],
  Spawning: [
    ['spawnGapEarly', 8, 30, 0.5],
    ['spawnGapMin', 5, 20, 0.5],
    ['spawnWarmup', 0, 50, 1],
    ['densityStartDistance', 0, 3000, 50],
    ['difficultyRampDistance', 100, 3000, 50],
    ['twoLaneMaxChance', 0, 1, 0.01],
  ],
}

const ALL_KEYS = Object.values(TUNABLES).flat().map(([k]) => k)
const config = CONFIG as Mutable<typeof CONFIG> as unknown as Record<TunableKey, number>

/** Startup values, for Reset and for working out what changed. */
const defaults = Object.fromEntries(ALL_KEYS.map((k) => [k, config[k]])) as Record<TunableKey, number>

function loadSaved(): Partial<Record<TunableKey, number>> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function save() {
  const changed = Object.fromEntries(ALL_KEYS.filter((k) => config[k] !== defaults[k]).map((k) => [k, config[k]]))
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(changed))
  } catch {
    /* ignore */
  }
}

/** Re-apply saved tweaks before the first frame (called at debug install, even before the panel opens). */
export function applySavedTuning() {
  for (const [k, v] of Object.entries(loadSaved())) {
    if ((ALL_KEYS as string[]).includes(k) && typeof v === 'number') config[k as TunableKey] = v
  }
}

let gui: import('lil-gui').default | null = null

/** Build the panel (lazy-loads lil-gui) or re-show it if already built. */
export async function showTuningPanel() {
  if (gui) {
    gui.show()
    return
  }
  const { default: GUI } = await import('lil-gui')
  gui = new GUI({ title: 'Crazy Runnerr — debug (` to hide)' })

  for (const [folderName, entries] of Object.entries(TUNABLES)) {
    const folder = gui.addFolder(folderName)
    for (const [key, min, max, step] of entries) {
      folder.add(config, key, min, max, step).onChange(save)
    }
    folder.close()
  }

  // Cheats / tools.
  const debug = useDebugStore.getState()
  const tools = {
    godMode: debug.godMode,
    showHitboxes: debug.showHitboxes,
    jumpTo: 1400,
    jump: () => {
      world.distance = tools.jumpTo
    },
    reset: () => {
      for (const k of ALL_KEYS) config[k] = defaults[k]
      save()
      gui?.controllersRecursive().forEach((c) => c.updateDisplay())
    },
    copy: () => {
      const lines = ALL_KEYS.filter((k) => config[k] !== defaults[k]).map((k) => `  ${k}: ${config[k]},`)
      const text = lines.length ? lines.join('\n') : '// no changes from defaults'
      void navigator.clipboard?.writeText(text)
      console.info('[tuning] copied:\n' + text)
    },
  }
  const toolsFolder = gui.addFolder('Tools')
  toolsFolder
    .add(tools, 'godMode')
    .name('God mode')
    .onChange((v: boolean) => useDebugStore.setState({ godMode: v }))
  toolsFolder
    .add(tools, 'showHitboxes')
    .name('Show hitboxes')
    .onChange((v: boolean) => useDebugStore.setState({ showHitboxes: v }))
  const touch = { buttons: useSettings.getState().showTouchButtons }
  toolsFolder
    .add(touch, 'buttons')
    .name('Touch buttons')
    .onChange((v: boolean) => useSettings.getState().set({ showTouchButtons: v }))
  toolsFolder.add(tools, 'jumpTo', 0, 5000, 50).name('Distance (m)')
  toolsFolder.add(tools, 'jump').name('Jump to distance')
  toolsFolder.add(tools, 'copy').name('Copy as config')
  toolsFolder.add(tools, 'reset').name('Reset to defaults')

  // Audio: live player settings + a tester that plays every sound in turn.
  const audio = gui.addFolder('Audio')
  const sound = { ...useSettings.getState() }
  const setSetting = (patch: Parameters<ReturnType<typeof useSettings.getState>['set']>[0]) =>
    useSettings.getState().set(patch)
  audio.add(sound, 'muted').name('Muted').onChange((v: boolean) => setSetting({ muted: v }))
  audio.add(sound, 'musicVolume', 0, 1, 0.05).name('Music volume').onChange((v: number) => setSetting({ musicVolume: v }))
  audio.add(sound, 'sfxVolume', 0, 1, 0.05).name('SFX volume').onChange((v: number) => setSetting({ sfxVolume: v }))
  audio.add(sound, 'vibration').name('Vibration').onChange((v: boolean) => setSetting({ vibration: v }))
  const audioTools = {
    playAll: async () => {
      const { ALL_SFX, playSfx } = await import('../../audio/audio')
      ALL_SFX.forEach((id, i) =>
        setTimeout(() => {
          console.info('[audio] ▶', id)
          playSfx(id)
        }, i * 900),
      )
    },
  }
  audio.add(audioTools, 'playAll').name('▶ Play every sound')
  audio.close()

  // Preview feedback effects without playing for them.
  const preview = gui.addFolder('Preview effects')
  const fire = {
    speedUp: () => emit('speedTier', { tier: 1 }),
    milestone: () => emit('milestone', { meters: 500 }),
    newBest: () => emit('newBest'),
    nearMiss: () => emit('nearMiss'),
    stumble: () => emit('stumble'),
    coin: () => emit('coin', { streak: 1 }),
  }
  preview.add(fire, 'speedUp').name('SPEED UP!')
  preview.add(fire, 'milestone').name('500 m!')
  preview.add(fire, 'newBest').name('NEW BEST!')
  preview.add(fire, 'nearMiss').name('CLOSE!')
  preview.add(fire, 'stumble').name('Stumble shake')
  preview.add(fire, 'coin').name('Coin pickup')
  preview.close()

  // Read-only renderer stats (updated each frame by DebugScene).
  const perf = gui.addFolder('Perf')
  perf.add(perfStats, 'drawCalls').name('Draw calls').listen().disable()
  perf.add(perfStats, 'triangles').name('Triangles').listen().disable()
  perf.add(world, 'speed').name('Speed (u/s)').listen().disable()
  perf.add(world, 'distance').name('Distance (m)').listen().disable()

  // On phones the panel would cover the swipe area — start collapsed there
  // (tap the title bar to open it).
  if (window.innerWidth < 600) gui.close()
}

export function hideTuningPanel() {
  gui?.hide()
}
