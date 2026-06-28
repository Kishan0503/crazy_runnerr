import { create } from 'zustand'
import { resetWorld, world } from './world'
import { resetPlayer } from './playerState'
import { resetSpawner } from './spawn'
import { inputBus } from './input'
import { loadBest, loadWallet } from './storage'
import { recordRun } from './progress'
import { resetAbility } from './ability'
import { useCharacterStore } from './characterStore'

/** Game phase state machine (PRD §5): START → PLAYING → GAME_OVER → (PLAYING…). */
export type Phase = 'start' | 'playing' | 'paused' | 'gameover'

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
  /** first collision → freeze the world and show game over (§4.4) */
  gameOver: () => void
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

  // Start-screen "Play Now": flag the exit transition; the screen plays it out
  // and calls start() when it finishes (player stays Idle until then).
  beginStart: () => {
    if (get().phase === 'start' && !get().starting) set({ starting: true })
  },

  start: () => {
    // Idempotent: the player rig (after the turn-to-run intro) and the
    // start-screen fallback timer both call this; ignore once already playing.
    const phase = get().phase
    if (phase === 'playing') return
    freshRun() // sets world.running = true and bumps world.runId
    // Mirror the new runId into React state so the obstacle field remounts
    // synchronously and no obstacle from the previous run can survive a frame.
    set({ phase: 'playing', coins: 0, starting: false, runId: world.runId })
  },

  gameOver: () => {
    if (get().phase !== 'playing') return
    world.running = false // freeze the simulation (everything moves by world.dz)
    const distance = Math.floor(world.distance)
    const coins = get().coins
    // Optimistic UI: show the new totals immediately. Persistence (localStorage
    // for guests, the record_run RPC for authed users) happens in recordRun;
    // for authed users its refresh() then corrects these via setSyncedProgress.
    const best = Math.max(get().best, distance)
    const wallet = get().wallet + coins
    set({ phase: 'gameover', best, lastDistance: distance, wallet })
    void recordRun(distance, coins, useCharacterStore.getState().activeId)
  },

  pause: () => {
    if (get().phase !== 'playing') return
    world.running = false
    set({ phase: 'paused' })
  },

  resume: () => {
    if (get().phase !== 'paused') return
    world.running = true
    set({ phase: 'playing' })
  },

  quit: () => {
    idleWorld()
    set({ phase: 'start', coins: 0, starting: false })
  },

  collectCoin: () => set((s) => ({ coins: s.coins + 1 })),

  setSyncedProgress: (best, wallet) => set({ best, wallet }),
}))

/** Total score = distance + a flat bonus per coin (§4.7). Computed, not stored. */
export function scoreOf(distance: number, coins: number, coinValue: number): number {
  return Math.floor(distance) + coins * coinValue
}
