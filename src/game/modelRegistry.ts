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
  | 'obstacle_low_fence'
  | 'obstacle_low_spikes'
  | 'obstacle_low_dumpster'
  | 'obstacle_over_sign'
  | 'obstacle_over_signwide'
  | 'obstacle_block_pillars'
  | 'obstacle_block_spikes'
  | 'car_sports_sedan'
  | 'car_sports_hatchback'
  | 'car_race_future'
  | 'truck_fire'
  | 'truck_garbage'
  | 'ramp'

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
  // Neon City obstacles: Kenney CC0 kit models, pre-fitted to their hitboxes by
  // tools/optimize-models.mjs (scale 1, own colours). Each type
  // has several looks, picked at random per spawn.
  // Jump: construction fence · spike block · dumpster
  obstacle_low_fence: { url: '/models/obstacle_low_fence.glb', scale: 1, glow: 0.25 },
  obstacle_low_spikes: { url: '/models/obstacle_low_spikes.glb', scale: 1, glow: 0.25 },
  obstacle_low_dumpster: { url: '/models/obstacle_low_dumpster.glb', scale: 1, glow: 0.25 },
  // Slide: highway sign gantries
  obstacle_over_sign: { url: '/models/obstacle_over_sign.glb', scale: 1, glow: 0.25 },
  obstacle_over_signwide: { url: '/models/obstacle_over_signwide.glb', scale: 1, glow: 0.25 },
  // Dodge: twin bridge pillars · spike wall
  obstacle_block_pillars: { url: '/models/obstacle_block_pillars.glb', scale: 1, glow: 0.2 },
  obstacle_block_spikes: { url: '/models/obstacle_block_spikes.glb', scale: 1, glow: 0.2 },
  // Oncoming vehicles (art pass, user's picks) — Kenney Car Kit, fitted to the
  // car / truck hitboxes. They drive TOWARD the runner, so they face +Z.
  car_sports_sedan: { url: '/models/car_sports_sedan.glb', scale: 1, glow: 0.15 },
  car_sports_hatchback: { url: '/models/car_sports_hatchback.glb', scale: 1, glow: 0.15 },
  car_race_future: { url: '/models/car_race_future.glb', scale: 1, glow: 0.15 },
  truck_fire: { url: '/models/truck_fire.glb', scale: 1, glow: 0.15 },
  truck_garbage: { url: '/models/truck_garbage.glb', scale: 1, glow: 0.15 },
  // City Kit road slope, pre-fitted to 1.8 × roofHeight × 6 with the low end facing +Z.
  ramp: { url: '/models/ramp.glb', scale: 1, glow: 0.1 },
}

/** Car looks, picked at random per spawned car. */
export const CAR_SLOTS: ModelSlot[] = ['car_sports_sedan', 'car_sports_hatchback', 'car_race_future']

/** Truck looks, picked at random per spawned truck. */
export const TRUCK_SLOTS: ModelSlot[] = ['truck_fire', 'truck_garbage']

/** Every look per obstacle kind; a spawn picks one at random (its "variant"). */
export const OBSTACLE_SLOTS: Record<'low' | 'overhead' | 'block' | 'car' | 'truck', ModelSlot[]> = {
  low: ['obstacle_low_fence', 'obstacle_low_spikes', 'obstacle_low_dumpster'],
  overhead: ['obstacle_over_sign', 'obstacle_over_signwide'],
  block: ['obstacle_block_pillars', 'obstacle_block_spikes'],
  car: CAR_SLOTS,
  truck: TRUCK_SLOTS,
}

/** Vehicles + ramp only appear after a few hundred metres: they load once the
 *  loading screen has closed (store.booted), never on the loading screen. */
const DEFERRED: ModelSlot[] = [...CAR_SLOTS, ...TRUCK_SLOTS, 'ramp']

// Preload OBSTACLE models so they're ready before play begins (PRD §13). The
// player model is NOT preloaded here any more — it's catalog-driven and loaded
// per equipped character (see characterStore), so we never eagerly fetch a
// character glb the player isn't using.
for (const [slot, entry] of Object.entries(MODELS)) {
  if (slot !== 'player' && !DEFERRED.includes(slot as ModelSlot)) useGLTF.preload(entry.url)
}
