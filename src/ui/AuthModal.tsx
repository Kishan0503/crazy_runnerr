import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { useAuthStore } from '../game/auth'
import { isSupabaseConfigured } from '../lib/supabase'

/** Tiny store for the modal's open state (so any button can open it). */
interface AuthUi {
  open: boolean
  openModal: () => void
  closeModal: () => void
}
export const useAuthUi = create<AuthUi>((set) => ({
  open: false,
  openModal: () => set({ open: true }),
  closeModal: () => set({ open: false }),
}))

type Mode = 'login' | 'signup'

/**
 * Login / signup modal. Email + password are handled by Supabase auth (the
 * password never touches our code or DB). On a successful sign-in the session
 * listener (auth store) updates everything; we just close. Signup may require
 * email confirmation, in which case we show a "check your email" note.
 */
export function AuthModal() {
  const open = useAuthUi((s) => s.open)
  const close = useAuthUi((s) => s.closeModal)
  const signIn = useAuthStore((s) => s.signIn)
  const signUp = useAuthStore((s) => s.signUp)
  const status = useAuthStore((s) => s.status)

  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Close automatically once a session is established.
  useEffect(() => {
    if (open && status === 'authed') close()
  }, [open, status, close])

  // Clear messages only when the modal (re)opens — NOT when mode changes, so a
  // post-signup notice survives the programmatic switch to the login tab.
  useEffect(() => {
    if (open) {
      setError(null)
      setNotice(null)
    }
  }, [open])

  if (!open) return null

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
    if (mode === 'login') {
      const { error } = await signIn(email.trim(), password)
      if (error) setError(error)
    } else {
      const { error } = await signUp(email.trim(), password, name.trim())
      if (error) setError(error)
      else if (useAuthStore.getState().status !== 'authed') {
        // No immediate session → email confirmation is on.
        setNotice('Account created. Check your email to confirm, then log in.')
        setMode('login')
      }
    }
    setBusy(false)
  }

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 px-6 backdrop-blur-sm"
      onClick={close}
    >
      <div
        className="cr-panel w-full max-w-sm p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Tabs */}
        <div className="mb-5 flex gap-2">
          {(['login', 'signup'] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m)
                setError(null)
                setNotice(null)
              }}
              className={`flex-1 rounded-lg py-2 text-sm font-bold uppercase tracking-wide transition ${
                mode === m ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white/80'
              }`}
            >
              {m === 'login' ? 'Log In' : 'Sign Up'}
            </button>
          ))}
        </div>

        {!isSupabaseConfigured && (
          <p className="mb-4 rounded-lg bg-amber-400/15 px-3 py-2 text-xs text-amber-200">
            Accounts aren’t configured yet. You can keep playing as a guest.
          </p>
        )}

        <form onSubmit={submit} className="flex flex-col gap-3">
          {mode === 'signup' && (
            <Field label="Name" value={name} onChange={setName} type="text" autoComplete="name" />
          )}
          <Field label="Email" value={email} onChange={setEmail} type="email" autoComplete="email" required />
          <Field
            label="Password"
            value={password}
            onChange={setPassword}
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
          />

          {error && <p className="text-sm text-red-300">{error}</p>}
          {notice && <p className="text-sm text-emerald-300">{notice}</p>}

          <button
            type="submit"
            disabled={busy || !isSupabaseConfigured}
            className="cr-play mt-2 justify-center py-3 text-base disabled:opacity-50"
          >
            {busy ? 'Please wait…' : mode === 'login' ? 'Log In' : 'Create Account'}
          </button>
        </form>

        <button
          type="button"
          onClick={close}
          className="cr-label mt-4 w-full text-center hover:text-white/80"
        >
          Continue as guest
        </button>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  type,
  autoComplete,
  required,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type: string
  autoComplete?: string
  required?: boolean
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="cr-label">{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-[var(--cr-panel-border)] bg-white/5 px-3 py-2 text-white outline-none focus:border-[var(--cr-blue-bright)]"
      />
    </label>
  )
}
