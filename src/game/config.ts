/**
 * Central tuning config (PRD §7).
 *
 * These are the validated starting values. All gameplay logic reads from here
 * so feel can be tuned in one place without touching components or physics.
 * Keep this file free of logic — values only.
 */
export const CONFIG = {
  lanes: [-2.2, 0, 2.2], // lane center X positions
  runnerZ: 2, // player's fixed depth
  // Longest frame the simulation advances in one step (seconds). Above this the
  // world slows instead of jumping (tab refocus, big hitch). 1/15 s keeps
  // real-time pace through ordinary dips while staying below the smallest hit
  // window at top speed (2.1 units/step vs 2.6); coins/pickups use swept tests.
  maxFrameDt: 1 / 15,
  // Seconds a speed-tier change takes to ease in (instead of an instant +25%).
  speedEaseTime: 1.2,
  spawnZ: -88, // where obstacles/coins appear
  recycleZ: 14, // remove once past the camera

  runnerHeight: 1.4, // standing collision height
  slideScale: 0.42, // height multiplier while sliding
  hitZ: 1.0, // depth tolerance for collisions
  lowTop: 0.95, // top height of jump-over barriers
  barBottom: 1.15, // bottom height of slide-under bars

  jumpVelocity: 11.2, // initial upward velocity
  gravity: 30, // downward acceleration
  slideDuration: 0.6, // seconds

  laneLerp: 13, // higher = snappier lane switching
  slideLerp: 16, // squash/stretch easing for slide

  // ---- Controls feel (Phase 1) ----
  inputBufferTime: 0.13, // seconds an early (mid-air) jump press is remembered
  fastFallVelocity: 24, // downward speed the instant you swipe down mid-air
  fastFallGravityMult: 2.2, // extra gravity while fast-falling
  jumpSpeedScaling: 0.5, // 0 = same air time at all speeds, 1 = same jump distance
  stumbleWindow: 8, // seconds after a stumble during which another one is fatal
  swipeThresholdScale: 1, // multiplier on the screen-relative swipe distance

  // ---- Feedback / juice (Phase 2) ----
  deathSlowMo: 0.15, // world speed during the death beat (fraction of normal)
  deathSlowMoTime: 0.5, // real seconds of slow-mo before the Game Over screen
  gameOverLock: 0.6, // seconds the Game Over screen ignores taps/keys
  shakeMax: 0.35, // max camera offset (units) at full trauma
  shakeDecay: 1.6, // trauma lost per second
  traumaCrash: 1, // trauma added by each event (0..1)
  traumaStumble: 0.45,
  traumaHardLand: 0.15,
  fovKick: 7, // extra degrees on a speed-tier change (eases back)
  fovPerTier: 1.5, // permanent extra degrees per speed tier reached
  milestoneStep: 500, // metres between "500 m!" banners

  // ---- Pickups (Phase 4A) ----
  pickupShieldMax: 30, // seconds a shield lasts if it's never used
  pickupMagnetTime: 10,
  pickupDoubleTime: 10,
  pickupJetpackTime: 10, // longer flights (was 6 s) — enough time to enjoy it
  shieldGrace: 1, // invulnerable seconds after the shield breaks
  jetpackGrace: 1.5, // invulnerable seconds after the jetpack ends (covers the descent)
  jetpackHeight: 4.5, // flight altitude (above every obstacle)
  jetpackSpeedMult: 1.4, // world speed while flying (feels powerful); eases in/out fast
  pickupStartDistance: 120, // no pickups before this many metres
  pickupMinGap: 180, // metres between pickups

  // ---- Vehicles & rooftops (Phase 4A) ----
  carSpeed: 8, // extra speed toward the player on top of the world speed (u/s)
  truckSpeed: 5, // trucks are heavier/slower
  vehicleStartDistance: 300, // no vehicles before this many metres (outside chunks)
  roofHeight: 1.9, // rooftop surface height (jump peak ≈ 2.09, so roofs can be jumped onto)
  rampLength: 6, // ramp run-up length (depth units)

  // ---- Speed: distance-stepped tiers, NOT continuous (§ updated mechanic) ----
  // Base forward speed = the 1.0x tier. Speed steps up by `speedTierStep` at each
  // cumulative distance in `speedTierThresholds`, up to `speedMaxTier`, then holds
  // flat. Thresholds are front-loaded (small early gaps, widening later) so the
  // pace picks up fast at the start instead of sitting flat for 500m, while still
  // capping out at a sane distance for long runs.
  //   0–150m: 1.0x · 150–400m: 1.25x · 400–800m: 1.5x · 800–1400m: 1.75x · 1400+: 2.0x
  speedStart: 16, // forward speed at the 1.0x tier (units/sec)
  speedTierThresholds: [150, 400, 800, 1400], // cumulative metres where each tier bump lands
  speedTierStep: 0.25, // multiplier gained per tier (0.25 = +25%)
  speedMaxTier: 2.0, // hard cap on the speed multiplier (reached at 1400m)

  spawnGapStart: 16, // distance between rows at base speed
  spawnGapMin: 9.5, // tightest row spacing
  spawnGapTighten: 0.25, // how much the gap shrinks per unit of extra speed

  // ---- Difficulty ramp (density) — distance-driven, but held back until the
  // speed cap so progression is "speed first, then density". Density is flat &
  // fair (sparse spacing, mostly 1 blocked lane) for the whole speed-ramp phase,
  // then row spacing tightens and two-lane rows grow once speed can rise no more.
  spawnWarmup: 12, // no obstacles for the first N metres (gentle on-ramp)
  spawnGapEarly: 20, // row spacing while density is held (sparse, not empty)
  densityStartDistance: 1400, // metres before density begins to ramp (= speed cap)
  difficultyRampDistance: 1000, // metres over which density ramps after it starts
  twoLaneMaxChance: 0.5, // peak probability a row blocks two lanes (1 lane while held)

  coinValue: 5, // score added per coin

  // Camera
  cameraPos: [0, 5.4, 9.5], // chase camera position (behind + above)
  cameraLookAt: [0, 1.1, -12], // look target down the track
  cameraFov: 62,
  fogNear: 22,
  fogFar: 105,
} as const

/** Scene/background color. Fog matches this so obstacles fade in (PRD §8.2). */
export const SCENE_BG = '#070b14'
/** Horizon glow color used by the gradient backdrop + skyline blend. */
export const SCENE_HORIZON = '#0e1b34'

/**
 * Logical obstacle hitboxes (PRD §4.3). Collision uses THESE, never the visual
 * mesh, so art and gameplay stay decoupled (§8.5). Dimensions are W×H×D with the
 * box centered at the given y; x/z come from the obstacle's lane and world z.
 */
export type ObstacleKind = 'low' | 'overhead' | 'block' | 'car' | 'truck'

/** Vehicles move toward the player on top of the world scroll (Phase 4A). */
export const isVehicle = (kind: ObstacleKind) => kind === 'car' || kind === 'truck'

export interface HitboxSpec {
  /** width (x), height (y), depth (z) */
  size: readonly [number, number, number]
  /** center height above ground */
  centerY: number
  /** model registry slot name (PRD §9.2) */
  slot: string
}

export const HITBOXES: Record<ObstacleKind, HitboxSpec> = {
  // `slot` = which group of looks (see OBSTACLE_SLOTS in modelRegistry.ts).
  low: { size: [1.6, 0.9, 0.8], centerY: 0.45, slot: 'obstacle_low' },
  overhead: { size: [1.8, 0.5, 0.6], centerY: 1.45, slot: 'obstacle_overhead' },
  block: { size: [1.6, 2.4, 0.9], centerY: 1.2, slot: 'obstacle_block' },
  // Phase 4A vehicles. Cars are low enough to jump (peak ≈ 2.09 > 1.3) with good
  // timing; trucks are tall box trucks you must dodge by switching lanes.
  car: { size: [1.6, 1.3, 3.0], centerY: 0.65, slot: 'vehicle_car' },
  truck: { size: [1.6, 2.4, 3.6], centerY: 1.2, slot: 'vehicle_truck' },
}

/** Player logical hitbox footprint (PRD §9.2: ~0.9 × runnerHeight × 0.9). */
export const PLAYER_SIZE = {
  width: 0.9,
  depth: 0.9,
  height: CONFIG.runnerHeight,
} as const
