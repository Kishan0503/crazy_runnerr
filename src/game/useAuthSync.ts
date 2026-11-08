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
    // Only reload characters when it matters (login/logout or a different equipped
    // character) — not on every balance/profile refresh. Authed players wait for
    // their profile so the first load already knows the equipped character.
    let charKey = ''
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
      const key =
        s.status === 'guest'
          ? 'guest'
          : s.status === 'authed' && s.profile
            ? `${s.user?.id}|${s.profile.active_character_id ?? ''}`
            : ''
      if (key && key !== charKey) {
        charKey = key
        void useCharacterStore.getState().load()
      }
    }

    apply(useAuthStore.getState())
    // Safety net: if a signed-in profile never arrives (network error), load the
    // characters anyway so the loading screen can't get stuck.
    const fallback = setTimeout(() => {
      if (!useCharacterStore.getState().loaded) void useCharacterStore.getState().load()
    }, 4000)
    const off = useAuthStore.subscribe(apply)
    return () => {
      clearTimeout(fallback)
      off()
    }
  }, [])
}
