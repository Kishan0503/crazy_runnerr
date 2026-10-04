import { useGLTF } from '@react-three/drei'

/**
 * Model registry (PRD §8.5, §9.2).
 *
 * Decouples art from logic: each visual slot maps to a `.glb` plus the minor
 * per-model corrections (scale / facing / tint) needed to fit the §4.3 hitboxes.
 * Collision never reads these — only the rendered mesh does — so models can be
 * swapped or retuned here without touching gameplay.
 *
 * The supplied models are normalized (~2 units) and centered on the origin, and
 * ship untextured/white; the loader (scene/Model.tsx) drops each to the ground
 * automatically and applies the tint below so the three obstacle types stay
 * visually distinct at speed (§12).
 */
export type ModelSlot =
  | 'player'
  | 'obstacle_low'
  | 'obstacle_overhead'
  | 'obstacle_block'

export interface ModelEntry {
  url: string
  /** uniform scale, or per-axis [x,y,z] to stretch toward a hitbox */
  scale: number | [number, number, number]
  /** Y rotation so the model faces down the track (−Z) */
  rotationY?: number
  /** flat color override; null keeps the model's own colors */
  tint?: string | null
  /** self-illumination (0..1) from the model's own texture, so it reads at night + catches bloom */
  glow?: number
}

export const MODELS: Record<ModelSlot, ModelEntry> = {
  player: { url: '/models/player.glb', scale: 0.72, rotationY: Math.PI, tint: null },
  // Kenney CC0 kit models, pre-fitted to their hitboxes by tools/optimize-models.mjs
  // (scale 1, own colors). Low: red-white road barrier · Overhead: striped arch
  // gantry · Block: 2×3 crate stack.
  obstacle_low: { url: '/models/obstacle_low.glb', scale: 1, rotationY: 0, tint: null, glow: 0.35 },
  obstacle_overhead: { url: '/models/obstacle_overhead.glb', scale: 1, rotationY: 0, tint: null, glow: 0.35 },
  obstacle_block: { url: '/models/obstacle_block.glb', scale: 1, rotationY: 0, tint: null, glow: 0.2 },
}

// Preload OBSTACLE models so they're ready before play begins (PRD §13). The
// player model is NOT preloaded here any more — it's catalog-driven and loaded
// per equipped character (see characterStore), so we never eagerly fetch a
// character glb the player isn't using.
for (const [slot, entry] of Object.entries(MODELS)) {
  if (slot !== 'player') useGLTF.preload(entry.url)
}
