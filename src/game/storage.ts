/**
 * Best-distance persistence (PRD §10).
 *
 * Stored in localStorage; if it's unavailable (private mode, blocked storage)
 * we degrade gracefully to in-memory only — never throw.
 */
const BEST_KEY = 'lane-runner:best-distance'
const WALLET_KEY = 'lane-runner:coins'

export function loadBest(): number {
  try {
    const raw = localStorage.getItem(BEST_KEY)
    const n = raw == null ? 0 : Number(raw)
    return Number.isFinite(n) && n > 0 ? n : 0
  } catch {
    return 0
  }
}

export function saveBest(distance: number): void {
  try {
    localStorage.setItem(BEST_KEY, String(Math.floor(distance)))
  } catch {
    // Storage unavailable — keep the value in memory only (store state).
  }
}

/** Persistent coin wallet — the running total shown on the start screen (ref). */
export function loadWallet(): number {
  try {
    const raw = localStorage.getItem(WALLET_KEY)
    const n = raw == null ? 0 : Number(raw)
    return Number.isFinite(n) && n > 0 ? n : 0
  } catch {
    return 0
  }
}

export function saveWallet(coins: number): void {
  try {
    localStorage.setItem(WALLET_KEY, String(Math.floor(coins)))
  } catch {
    // Storage unavailable — keep the value in memory only.
  }
}
