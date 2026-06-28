import { useEffect } from 'react'
import { useAuthStore } from './auth'
import { useGameStore } from './store'
import { useCharacterStore } from './characterStore'
import { loadBest, loadWallet } from './storage'
import { reconcileBestOnLogin } from './progress'

/**
 * Bridges the auth store into the gameplay store. Mounted once at the app root.
 *
 *   - Starts the Supabase session listener.
 *   - When AUTHED: pushes the server's best distance + coin balance into the game
 *     store (so the HUD / start screen show synced totals), carrying up the
 *     guest's local best on first login (reconcileBestOnLogin).
 *   - When GUEST: falls back to the local (localStorage) totals.
 */
export function useAuthSync() {
  useEffect(() => {
    useAuthStore.getState().init()

    let reconciled = false
    const apply = (s: ReturnType<typeof useAuthStore.getState>) => {
      const game = useGameStore.getState()
      if (s.status === 'authed' && s.profile) {
        if (!reconciled) {
          reconciled = true
          // Merge guest best → account once, then sync the resulting totals.
          reconcileBestOnLogin(s.profile.best_distance).then((best) => {
            game.setSyncedProgress(best, useAuthStore.getState().balance)
          })
        } else {
          game.setSyncedProgress(s.profile.best_distance, s.balance)
        }
      } else if (s.status === 'guest') {
        reconciled = false
        game.setSyncedProgress(loadBest(), loadWallet())
      }
      // (Re)load the character catalog + ownership for the current auth state.
      if (s.status !== 'loading') void useCharacterStore.getState().load()
    }

    apply(useAuthStore.getState())
    return useAuthStore.subscribe(apply)
  }, [])
}
