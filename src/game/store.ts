import { create } from 'zustand'
import { resetWorld, world } from './world'
import { resetPlayer } from './playerState'
import { resetSpawner } from './spawn'
import { inputBus } from './input'
import { loadBest, saveBest } from './storage'

/** Game phase state machine (PRD §5): START → PLAYING → GAME_OVER → (PLAYING…). */
export type Phase = 'start' | 'playing' | 'paused' | 'gameover'

interface GameStore {
  phase: Phase
  /** coins collected this run (separate counter, §4.7) */
  coins: number
  /** best distance ever, persisted across reloads (§4.7, §10) */
  best: number
  /** final distance of the last finished run (for the game-over screen) */
  lastDistance: number
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
}

/** Reset all per-run runtime so nothing leaks between runs (§4 acceptance). */
function freshRun() {
  resetWorld()
  resetPlayer()
  resetSpawner()
  inputBus.clear()
}

/** Stop the world without starting a run (start screen / quit). */
function idleWorld() {
  freshRun()
  world.running = false
}

export const useGameStore = create<GameStore>((set, get) => ({
  // The world boots frozen behind the Start screen — nothing moves until start().
  phase: 'start',
  coins: 0,
  best: loadBest(),
  lastDistance: 0,

  start: () => {
    freshRun() // sets world.running = true
    set({ phase: 'playing', coins: 0 })
  },

  gameOver: () => {
    if (get().phase !== 'playing') return
    world.running = false // freeze the simulation (everything moves by world.dz)
    const distance = Math.floor(world.distance)
    const best = Math.max(get().best, distance)
    if (best > get().best) saveBest(best)
    set({ phase: 'gameover', best, lastDistance: distance })
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
    set({ phase: 'start', coins: 0 })
  },

  collectCoin: () => set((s) => ({ coins: s.coins + 1 })),
}))

/** Total score = distance + a flat bonus per coin (§4.7). Computed, not stored. */
export function scoreOf(distance: number, coins: number, coinValue: number): number {
  return Math.floor(distance) + coins * coinValue
}
