import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Supabase client (auth + DB). Reads the project URL + anon key from env
 * (.env.local; see .env.example). The anon key is public by design — Row-Level
 * Security protects the data, not key secrecy.
 *
 * If the env vars are missing (e.g. before the project is set up), this exports
 * `null` instead of throwing, and `isSupabaseConfigured` is false. The app then
 * runs in GUEST-ONLY mode (localStorage), so development never hard-depends on a
 * configured backend. All auth/sync code must null-check `supabase` first.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = Boolean(url && anonKey)

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        persistSession: true, // keep the user logged in across reloads
        autoRefreshToken: true,
        detectSessionInUrl: true, // needed for email-confirmation / OAuth redirects
      },
    })
  : null

if (!isSupabaseConfigured && import.meta.env.DEV) {
  console.info(
    '[supabase] No VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY set — running in guest-only mode.',
  )
}
