import { useSettings } from '../game/settings'

/**
 * Speaker toggle (Phase 2): master mute for music + sound effects, remembered
 * across visits. Full volume sliders arrive with the Settings menu (Phase 7).
 */
export function MuteButton({ className = '' }: { className?: string }) {
  const muted = useSettings((s) => s.muted)
  const set = useSettings((s) => s.set)
  return (
    <button
      type="button"
      aria-label={muted ? 'Unmute sound' : 'Mute sound'}
      aria-pressed={muted}
      onClick={() => set({ muted: !muted })}
      className={`cr-icon-btn pointer-events-auto ${className}`}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M11 5 6 9H3v6h3l5 4V5z" fill="currentColor" />
        {muted ? (
          <path d="m16 9 5 6m0-6-5 6" />
        ) : (
          <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
        )}
      </svg>
    </button>
  )
}
