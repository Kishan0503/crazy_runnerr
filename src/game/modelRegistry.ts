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
  /** flat color override (models are white); null keeps original material color */
  tint?: string | null
}

export const MODELS: Record<ModelSlot, ModelEntry> = {
  player: { url: '/models/player.glb', scale: 0.72, rotationY: Math.PI, tint: null },
  obstacle_low: { url: '/models/obstacle_low.glb', scale: 0.82, rotationY: 0, tint: '#d23b3b' },
  obstacle_overhead: { url: '/models/obstacle_overhead.glb', scale: 1.3, rotationY: 0, tint: '#f4b914' },
  // Crate stretched to fill the tall full-lane block hitbox (1.6 × 2.4 × 0.9).
  obstacle_block: { url: '/models/obstacle_block.glb', scale: [0.82, 1.22, 0.46], rotationY: 0, tint: '#bd7b34' },
}

// Preload OBSTACLE models so they're ready before play begins (PRD §13). The
// player model is NOT preloaded here any more — it's catalog-driven and loaded
// per equipped character (see characterStore), so we never eagerly fetch a
// character glb the player isn't using.
for (const [slot, entry] of Object.entries(MODELS)) {
  if (slot !== 'player') useGLTF.preload(entry.url)
}
