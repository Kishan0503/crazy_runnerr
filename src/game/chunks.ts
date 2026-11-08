import type { ObstacleKind } from './config'

/**
 * Hand-designed track chunks (Phase 4A §3). A chunk is a short sequence of rows
 * with a designed rhythm; the spawner mixes them with random rows and may
 * mirror them left↔right.
 *
 * Each row's `lanes` string has one character per lane (left → right):
 *   .  open        L  low barrier (jump)   O  overhead bar (slide)
 *   B  block       C  car (jump, drives at you)   T  truck (dodge, drives at you)
 *   R  ramp + rooftop (length `roof`, coins on top)
 * `gap` = distance (units) from the previous row; the first row's gap is ignored
 * (the spawner uses its normal spacing). Lanes under a roof must stay '.'.
 * `coins` = [lane, count] for a ground coin run (otherwise the spawner may add one).
 *
 * Every chunk must pass the fairness checker at every speed tier
 * (chunks.test.ts) — an impossible chunk fails the build.
 */
export type ChunkTier = 'easy' | 'medium' | 'hard'
export interface ChunkRow {
  gap: number
  lanes: string
  coins?: [lane: number, count: number]
  roof?: number
}
export interface Chunk {
  id: string
  tier: ChunkTier
  rows: ChunkRow[]
}

export const CELL_KIND: Record<string, ObstacleKind> = { L: 'low', O: 'overhead', B: 'block', C: 'car', T: 'truck' }
export const DEFAULT_ROOF = 24

const row = (gap: number, lanes: string, extra: Partial<ChunkRow> = {}): ChunkRow => ({ gap, lanes, ...extra })

export const CHUNKS: Chunk[] = [
  // ---------------- Easy (9): teach one idea at a time ----------------
  { id: 'jump-line', tier: 'easy', rows: [row(0, 'LLL'), row(16, '...', { coins: [1, 5] }), row(16, 'LLL')] },
  { id: 'slide-line', tier: 'easy', rows: [row(0, 'OOO'), row(16, '...', { coins: [1, 5] }), row(16, 'OOO')] },
  { id: 'gentle-weave', tier: 'easy', rows: [row(0, 'BB.', { coins: [2, 4] }), row(18, '.BB', { coins: [0, 4] }), row(18, 'BB.', { coins: [2, 4] })] },
  { id: 'coin-route', tier: 'easy', rows: [row(0, 'B.B', { coins: [1, 6] }), row(16, 'B.B', { coins: [1, 6] }), row(16, 'B.B', { coins: [1, 4] })] },
  { id: 'choose-move', tier: 'easy', rows: [row(0, 'LOL'), row(16, 'OLO')] },
  { id: 'side-step', tier: 'easy', rows: [row(0, '.B.', { coins: [0, 5] }), row(16, '.B.', { coins: [2, 5] }), row(16, 'B..')] },
  { id: 'hop-trio', tier: 'easy', rows: [row(0, 'L..', { coins: [1, 3] }), row(14, '.L.', { coins: [2, 3] }), row(14, '..L', { coins: [0, 3] })] },
  { id: 'duck-walk', tier: 'easy', rows: [row(0, '.O.', { coins: [1, 8] }), row(12, '.O.'), row(12, '.O.')] },
  { id: 'gates', tier: 'easy', rows: [row(0, 'B.B'), row(18, '.B.', { coins: [0, 4] }), row(18, 'B.B', { coins: [1, 4] })] },

  // ---------------- Medium (10): combos, ramps, a vehicle ----------------
  { id: 'jump-slide', tier: 'medium', rows: [row(0, 'BLB'), row(10, 'BOB', { coins: [1, 3] })] },
  { id: 'fast-fall', tier: 'medium', rows: [row(0, 'BLB'), row(7, 'BOB'), row(14, '.B.', { coins: [0, 4] })] },
  { id: 'block-weave', tier: 'medium', rows: [row(0, 'BB.', { coins: [2, 3] }), row(14, '.BB', { coins: [0, 3] }), row(14, 'BB.', { coins: [2, 3] })] },
  { id: 'ramp-roof', tier: 'medium', rows: [row(0, 'R..', { roof: 26 }), row(12, '.BL'), row(12, '.LB')] },
  { id: 'truck-escape', tier: 'medium', rows: [row(0, '.T.', { coins: [0, 6] }), row(16, 'L.L')] },
  { id: 'car-hop', tier: 'medium', rows: [row(0, 'BC.', { coins: [2, 5] }), row(16, '.LB')] },
  { id: 'over-under', tier: 'medium', rows: [row(0, 'LOL'), row(10, 'OLO'), row(10, 'LOL')] },
  { id: 'zigzag', tier: 'medium', rows: [row(0, 'B.B', { coins: [1, 3] }), row(12, 'BB.', { coins: [2, 3] }), row(12, 'B.B', { coins: [1, 3] })] },
  { id: 'roof-dodge', tier: 'medium', rows: [row(0, '.R.', { roof: 22 }), row(12, 'L.B'), row(12, 'B.L')] },
  { id: 'tunnel-run', tier: 'medium', rows: [row(0, 'BOB'), row(10, 'BOB', { coins: [1, 4] }), row(10, 'BLB')] },

  // ---------------- Hard (6): speed, vehicles, rooftop hops ----------------
  { id: 'tight-weave', tier: 'hard', rows: [row(0, 'BB.'), row(13, '.BB'), row(13, 'BB.'), row(13, '.BB')] },
  { id: 'two-trucks', tier: 'hard', rows: [row(0, 'T..', { coins: [1, 4] }), row(14, '..T', { coins: [0, 4] })] },
  { id: 'roof-hop', tier: 'hard', rows: [row(0, 'R..', { roof: 24 }), row(10, '.R.', { roof: 24 }), row(24, 'B.B')] },
  { id: 'truck-bar', tier: 'hard', rows: [row(0, 'TO.', { coins: [2, 4] }), row(12, '.OB')] },
  { id: 'gauntlet', tier: 'hard', rows: [row(0, 'BLB'), row(9, 'BOB'), row(9, 'LBL')] },
  { id: 'car-rush', tier: 'hard', rows: [row(0, 'C.C', { coins: [1, 4] }), row(12, '.C.'), row(12, 'L.L')] },
]

/** Left↔right mirror of a chunk row (doubles the variety for free). */
export function mirrorRow(r: ChunkRow, lanes = 3): ChunkRow {
  return {
    ...r,
    lanes: r.lanes.split('').reverse().join(''),
    coins: r.coins ? [lanes - 1 - r.coins[0], r.coins[1]] : undefined,
  }
}

/** Pick a tier for the current difficulty (0..1), always mixing in easier ones. */
export function tierFor(difficulty: number, rng: () => number): ChunkTier {
  const r = rng()
  if (difficulty < 0.3) return 'easy'
  if (difficulty < 0.7) return r < 0.7 ? 'medium' : 'easy'
  return r < 0.55 ? 'hard' : r < 0.9 ? 'medium' : 'easy'
}
