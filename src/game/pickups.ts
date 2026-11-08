import { CONFIG } from './config'

/**
 * Track pickups (Phase 4A): Shield, Coin Magnet, 2× Coins, Jetpack.
 *
 * Runtime singleton like `world` / `player` — mutated in the frame loop, never
 * React state. Collecting a pickup starts (or refreshes) its timer; timers run
 * on game time. The shield and the end of a jetpack flight grant a short
 * "grace" window in which fatal hits are ignored.
 */
export type PickupKind = 'shield' | 'magnet' | 'double' | 'jetpack'
export const PICKUP_KINDS: PickupKind[] = ['shield', 'magnet', 'double', 'jetpack']

export const pickups = {
  timers: { shield: 0, magnet: 0, double: 0, jetpack: 0 } as Record<PickupKind, number>,
  /** seconds of invulnerability left (after a shield break / jetpack landing) */
  grace: 0,
}

export function pickupDuration(kind: PickupKind): number {
  switch (kind) {
    case 'shield':
      return CONFIG.pickupShieldMax
    case 'magnet':
      return CONFIG.pickupMagnetTime
    case 'double':
      return CONFIG.pickupDoubleTime
    case 'jetpack':
      return CONFIG.pickupJetpackTime
  }
}

/** Start or refresh a pickup (refreshing resets to full; durations don't stack). */
export function activatePickup(kind: PickupKind) {
  pickups.timers[kind] = pickupDuration(kind)
}

export const isPickupActive = (kind: PickupKind) => pickups.timers[kind] > 0
export const inGrace = () => pickups.grace > 0

/**
 * Advance timers. Returns the kinds that ran out this tick (for end effects).
 * A jetpack ending starts the landing grace.
 */
export function tickPickups(dt: number): PickupKind[] {
  const ended: PickupKind[] = []
  if (pickups.grace > 0) pickups.grace = Math.max(0, pickups.grace - dt)
  for (const kind of PICKUP_KINDS) {
    if (pickups.timers[kind] <= 0) continue
    pickups.timers[kind] = Math.max(0, pickups.timers[kind] - dt)
    if (pickups.timers[kind] === 0) {
      ended.push(kind)
      if (kind === 'jetpack') pickups.grace = Math.max(pickups.grace, CONFIG.jetpackGrace)
    }
  }
  return ended
}

/**
 * A fatal hit happened: if a shield is up, spend it (→ short grace) and report
 * true so the run continues. Returns false when there's no shield.
 */
export function consumeShield(): boolean {
  if (pickups.timers.shield <= 0) return false
  pickups.timers.shield = 0
  pickups.grace = Math.max(pickups.grace, CONFIG.shieldGrace)
  return true
}

/** Coins are worth 2 while 2× Coins is active. */
export const coinValue = () => (isPickupActive('double') ? 2 : 1)

export function resetPickups() {
  for (const kind of PICKUP_KINDS) pickups.timers[kind] = 0
  pickups.grace = 0
}
