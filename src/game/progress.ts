import { supabase } from '../lib/supabase'
import { useAuthStore } from './auth'
import { loadBest, loadWallet, saveBest, saveWallet } from './storage'

/**
 * Progress persistence bridge. The game stays identical for guests and logged-in
 * users; only WHERE progress is saved differs:
 *   - guest  → localStorage (existing storage.ts)
 *   - authed → the server, via the `record_run` RPC (server clamps coin rewards
 *              and updates best_distance, so the client can't fake currency).
 *
 * Kept out of the gameplay store so the core loop has no hard auth dependency.
 */

/** Persist a finished run. Returns nothing; callers update UI from the stores. */
export async function recordRun(distance: number, coins: number, characterId: string | null) {
  const auth = useAuthStore.getState()

  if (auth.status === 'authed' && supabase) {
    // Server is authoritative: it clamps the coin reward and bumps best_distance.
    const { error } = await supabase.rpc('record_run', {
      p_distance: Math.floor(distance),
      p_coins: Math.floor(coins),
      p_character_id: characterId,
    })
    if (error) console.warn('[progress] record_run failed:', error.message)
    // Re-pull profile + balance so HUD/start screen show the new totals.
    await auth.refresh()
    return
  }

  // Guest: localStorage. Best is a max; wallet accumulates this run's coins.
  saveBest(Math.max(loadBest(), Math.floor(distance)))
  saveWallet(loadWallet() + Math.floor(coins))
}

/**
 * On login, carry the guest's local BEST DISTANCE up to the account if it's
 * higher than the server's. We deliberately do NOT migrate guest coins — local
 * coins are unverified, so importing them would be a free-coins exploit. Best
 * distance is a harmless stat, safe to merge.
 */
export async function reconcileBestOnLogin(serverBest: number): Promise<number> {
  const localBest = loadBest()
  if (supabase && localBest > serverBest) {
    const user = useAuthStore.getState().user
    if (user) {
      await supabase.from('profiles').update({ best_distance: localBest }).eq('id', user.id)
      return localBest
    }
  }
  return serverBest
}
