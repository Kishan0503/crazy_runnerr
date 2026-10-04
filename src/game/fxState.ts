/**
 * Per-run runtime for the feedback systems (Phase 2), mutated in place like
 * `world` / `player` — never React state. Reset on every run start.
 * Timestamps are seconds of real time (performance.now() / 1000).
 */
export const fx = {
  /** when the player last LEFT each lane (late-dodge near-miss detection) */
  laneLeftAt: [-Infinity, -Infinity, -Infinity],
  /** last near miss (cooldown) */
  lastNearMiss: -Infinity,
  /** coin streak (pitch rises while coins keep coming) */
  streak: { count: 0, last: -Infinity },
}

export function resetFx() {
  fx.laneLeftAt.fill(-Infinity)
  fx.lastNearMiss = -Infinity
  fx.streak.count = 0
  fx.streak.last = -Infinity
}

/** Real-time clock in seconds (unaffected by slow-mo / pause semantics). */
export const nowSec = () => performance.now() / 1000
