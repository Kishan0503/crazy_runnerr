import { create } from 'zustand'
import { resetWorld, world } from './world'
import { resetPlayer } from './playerState'
import { resetSpawner } from './spawn'
import { inputBus } from './input'
import { loadBest, loadWallet } from './storage'
import { recordRun } from './progress'
import { resetAbility } from './ability'
import { useCharacterStore } from './characterStore'
import { CONFIG } from './config'
import { emit } from './events'
import { resetFx } from './fxState'

/**
 * Game phase state machine (PRD §5):
 * START → PLAYING → DYING (brief slow-mo) → GAME_OVER → (PLAYING…).
 */
export type Phase = 'start' | 'playing' | 'paused' | 'dying' | 'gameover'

interface GameStore {
  phase: Phase
  /** true once the R3F canvas has painted its first frame (gates the intro reveal) */
  ready: boolean
  setReady: () => void
  /** coins collected this run (separate counter, §4.7) */
  coins: number
  /** persistent coin wallet — running total across all runs (shown on start) */
  wallet: number
  /** best distance ever, persisted across reloads (§4.7, §10) */
  best: number
  /** final distance of the last finished run (for the game-over screen) */
  lastDistance: number
  /** bumped each fresh run so the scene remounts obstacles immediately (no stale hits) */
  runId: number
  /** true while the start-screen exit transition plays, before the run begins */
  starting: boolean
  /** kick off the start-screen exit transition (button + Enter/Space) */
  beginStart: () => void
  /** begin a fresh run (start screen + retry) */
  start: () => void
  /** fatal hit → short slow-motion "dying" beat, then gameOver() */
  crash: () => void
  /** freeze the world, save the run and show the Game Over screen (§4.4) */
  gameOver: () => void
  /** performance.now() when the Game Over screen appeared (drives the tap-lock) */
  gameOverAt: number
  /** freeze and show the pause overlay (optional, §5) */
  pause: () => void
  /** un-freeze and resume play */
  resume: () => void
  /** abandon the run and return to the start screen */
  quit: () => void
  /** player picked up a coin (discrete event — safe for React state) */
  collectCoin: () => void
  /** push server-synced totals into the store (called after login / refresh) */
  setSyncedProgress: (best: number, wallet: number) => void
}

/** Reset all per-run runtime so nothing leaks between runs (§4 acceptance). */
function freshRun() {
  resetWorld()
  resetPlayer()
  resetSpawner()
  inputBus.clear()
  resetFx()
  // Arm the equipped character's ability for this run (charges reset to max).
  resetAbility(useCharacterStore.getState().activeCharacter()?.ability_id ?? null)
}

/** Stop the world without starting a run (start screen / quit). */
function idleWorld() {
  freshRun()
  world.running = false
}

export const useGameStore = create<GameStore>((set, get) => ({
  // The world boots frozen behind the Start screen — nothing moves until start().
  phase: 'start',
  ready: false,
  setReady: () => set({ ready: true }),
  coins: 0,
  wallet: loadWallet(),
  best: loadBest(),
  lastDistance: 0,
  runId: 0,
  starting: false,
  gameOverAt: 0,

  // Start-screen "Play Now": flag the exit transition; the screen plays it out
  // and calls start() when it finishes (player stays Idle until then).
  beginStart: () => {
    if (get().phase === 'start' && !get().starting) set({ starting: true })
  },

  start: () => {
    // Idempotent: the player rig (after the turn-to-run intro) and the
    // start-screen fallback timer both call this; ignore once already playing.
    const phase = get().phase
    if (phase === 'playing' || phase === 'dying') return
    freshRun() // sets world.running = true and bumps world.runId
    // Mirror the new runId into React state so the obstacle field remounts
    // synchronously and no obstacle from the previous run can survive a frame.
    set({ phase: 'playing', coins: 0, starting: false, runId: world.runId })
    emit('runStart')
  },

  crash: () => {
    if (get().phase !== 'playing') return
    // Slow-mo beat: the world keeps moving at a fraction of speed while the
    // camera shakes and the screen flashes, then the run really ends.
    world.timeScale = CONFIG.deathSlowMo
    set({ phase: 'dying' })
    emit('crash')
    const runId = world.runId
    setTimeout(() => {
      // A retry/quit inside the beat starts a new run — don't end that one.
      if (world.runId === runId) get().gameOver()
    }, CONFIG.deathSlowMoTime * 1000)
  },

  gameOver: () => {
    const phase = get().phase
    if (phase !== 'playing' && phase !== 'dying') return
    world.running = false // freeze the simulation (everything moves by world.dz)
    world.timeScale = 1
    const distance = Math.floor(world.distance)
    const coins = get().coins
    // Optimistic UI: show the new totals immediately. Persistence (localStorage
    // for guests, the record_run RPC for authed users) happens in recordRun;
    // for authed users its refresh() then corrects these via setSyncedProgress.
    const newBest = distance > get().best && distance > 0
    const best = Math.max(get().best, distance)
    const wallet = get().wallet + coins
    set({ phase: 'gameover', best, lastDistance: distance, wallet, gameOverAt: performance.now() })
    emit('gameOver', { newBest })
    void recordRun(distance, coins, useCharacterStore.getState().activeId)
  },

  pause: () => {
    if (get().phase !== 'playing') return
    world.running = false
    set({ phase: 'paused' })
    emit('pause')
  },

  resume: () => {
    if (get().phase !== 'paused') return
    world.running = true
    set({ phase: 'playing' })
    emit('resume')
  },

  quit: () => {
    idleWorld()
    // Mirror the new runId (bumped inside idleWorld → freshRun → resetWorld)
    // into React state, same as start() — otherwise <ObstacleField key={runId}>
    // never remounts and every obstacle/coin from the run stays frozen in place
    // behind the start screen.
    set({ phase: 'start', coins: 0, starting: false, runId: world.runId })
  },

  collectCoin: () => set((s) => ({ coins: s.coins + 1 })),

  setSyncedProgress: (best, wallet) => set({ best, wallet }),
}))

/** True once the Game Over screen's tap-lock has elapsed (no accidental instant retry). */
export function gameOverUnlocked(): boolean {
  return performance.now() - useGameStore.getState().gameOverAt >= CONFIG.gameOverLock * 1000
}

/** Total score = distance + a flat bonus per coin (§4.7). Computed, not stored. */
export function scoreOf(distance: number, coins: number, coinValue: number): number {
  return Math.floor(distance) + coins * coinValue
}
