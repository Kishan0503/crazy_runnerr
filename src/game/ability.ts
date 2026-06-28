/**
 * Character ability engine (singleton runtime, like `world` / `player`).
 *
 * A character's `ability_id` (from the catalog) maps to an entry in ABILITY_DEFS
 * below — the *rules* of the ability (charges per run, active duration). The live
 * per-run state (charges left, active timer) lives in the `ability` singleton and
 * is mutated in useFrame, never React state, so per-frame systems (coins reacting
 * to Magnet) read it cheaply. Discrete UI (the HUD button) reads a throttled
 * snapshot via getAbilitySnapshot().
 *
 * Adding a new ability = one ABILITY_DEFS entry + whatever system reacts to it
 * (e.g. coins check isMagnetActive()). No change to the game loop wiring.
 */

export interface AbilityDef {
  id: string
  name: string
  /** uses allowed per run */
  maxCharges: number
  /** seconds the effect stays active after activation */
  duration: number
}

export const ABILITY_DEFS: Record<string, AbilityDef> = {
  magnet: { id: 'magnet', name: 'Magnet', maxCharges: 2, duration: 10 },
}

interface AbilityState {
  /** active character's ability id, or null if the character has none */
  id: string | null
  def: AbilityDef | null
  /** uses left this run */
  charges: number
  /** seconds of active effect remaining; > 0 means currently active */
  timer: number
}

export const ability: AbilityState = { id: null, def: null, charges: 0, timer: 0 }

/** Arm the ability for a fresh run from the equipped character's ability id. */
export function resetAbility(abilityId: string | null) {
  const def = abilityId ? ABILITY_DEFS[abilityId] ?? null : null
  ability.id = def?.id ?? null
  ability.def = def
  ability.charges = def?.maxCharges ?? 0
  ability.timer = 0
}

/** Player pressed the ability control. Returns true if it actually fired. */
export function activateAbility(): boolean {
  if (!ability.def) return false
  if (ability.charges <= 0) return false
  if (ability.timer > 0) return false // already active
  ability.charges--
  ability.timer = ability.def.duration
  return true
}

/** Advance the active-effect timer. Call once per frame with clamped dt. */
export function tickAbility(dt: number) {
  if (ability.timer > 0) {
    ability.timer -= dt
    if (ability.timer < 0) ability.timer = 0
  }
}

/** Magnet is the active character's ability AND currently running. */
export function isMagnetActive(): boolean {
  return ability.id === 'magnet' && ability.timer > 0
}

/** Snapshot for the HUD (cheap object; read on a rAF, not per render). */
export function getAbilitySnapshot() {
  return {
    id: ability.id,
    name: ability.def?.name ?? null,
    charges: ability.charges,
    maxCharges: ability.def?.maxCharges ?? 0,
    active: ability.timer > 0,
    timeLeft: ability.timer,
    duration: ability.def?.duration ?? 0,
  }
}
