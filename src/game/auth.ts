import { create } from 'zustand'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured } from '../lib/supabase'

/**
 * Auth + account state (Supabase). Separate from the gameplay store so the core
 * loop never depends on it — the game is fully playable as a GUEST (no account),
 * and auth only adds cloud persistence + the shop later.
 *
 * Credentials (email/password) live entirely in Supabase's managed `auth.users`
 * (bcrypt-hashed) — we never store or handle raw passwords. This store only
 * holds the resulting session + our own profile row.
 */

export interface Profile {
  id: string
  display_name: string | null
  best_distance: number
  active_character_id: string | null
}

type AuthStatus = 'loading' | 'guest' | 'authed'

interface AuthStore {
  /** loading → resolving the initial session; then guest or authed */
  status: AuthStatus
  user: User | null
  profile: Profile | null
  /** coin balance from the server ledger (authed only) */
  balance: number
  /** wire up the session listener once at app start */
  init: () => void
  signUp: (email: string, password: string, displayName: string) => Promise<{ error: string | null }>
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  /** re-pull profile + balance from the server (after a purchase, run, etc.) */
  refresh: () => Promise<void>
}

let initialized = false

export const useAuthStore = create<AuthStore>((set, get) => ({
  status: isSupabaseConfigured ? 'loading' : 'guest',
  user: null,
  profile: null,
  balance: 0,

  init: () => {
    if (initialized || !supabase) {
      // No backend configured → permanent guest mode.
      if (!supabase) set({ status: 'guest' })
      return
    }
    initialized = true

    // Resolve the current session on load, then keep it in sync.
    supabase.auth.getSession().then(({ data }) => applySession(set, get, data.session))
    supabase.auth.onAuthStateChange((_event, session) => applySession(set, get, session))
  },

  signUp: async (email, password, displayName) => {
    if (!supabase) return { error: 'Accounts are not available right now.' }
    const { error } = await supabase.auth.signUp({
      email,
      password,
      // display_name rides along as auth metadata; the handle_new_user() trigger
      // copies it into public.profiles on signup.
      options: { data: { display_name: displayName } },
    })
    return { error: error?.message ?? null }
  },

  signIn: async (email, password) => {
    if (!supabase) return { error: 'Accounts are not available right now.' }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  },

  signOut: async () => {
    if (!supabase) return
    await supabase.auth.signOut()
    // onAuthStateChange will flip status back to 'guest'.
  },

  refresh: async () => {
    const user = get().user
    if (!supabase || !user) return
    await loadProfileAndBalance(set, user)
  },
}))

/** Apply a Supabase session: update user/status and pull the profile + balance. */
async function applySession(
  set: (partial: Partial<AuthStore>) => void,
  _get: () => AuthStore,
  session: Session | null,
) {
  if (!session?.user) {
    set({ status: 'guest', user: null, profile: null, balance: 0 })
    return
  }
  set({ status: 'authed', user: session.user })
  await loadProfileAndBalance(set, session.user)
}

/** Fetch the user's profile row + coin balance view. */
async function loadProfileAndBalance(
  set: (partial: Partial<AuthStore>) => void,
  user: User,
) {
  if (!supabase) return
  const [{ data: profile }, { data: bal }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, display_name, best_distance, active_character_id')
      .eq('id', user.id)
      .single(),
    supabase.from('coin_balances').select('balance').eq('user_id', user.id).maybeSingle(),
  ])
  set({
    profile: (profile as Profile) ?? null,
    balance: (bal?.balance as number) ?? 0,
  })
}
