import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { useCharacterStore } from '../game/characterStore'
import { cosmeticTint, type Character } from '../game/characters'
import { useAuthStore } from '../game/auth'
import { useGameStore } from '../game/store'
import { ABILITY_DEFS } from '../game/ability'
import { useAuthUi } from './AuthModal'

/** Open-state store for the character-select overlay. */
interface CharacterUi {
  open: boolean
  openModal: () => void
  closeModal: () => void
}
export const useCharacterUi = create<CharacterUi>((set) => ({
  open: false,
  openModal: () => set({ open: true }),
  closeModal: () => set({ open: false }),
}))

/** Small tinted avatar standing in for each character (until per-char models). */
function Avatar({ tint }: { tint: string }) {
  return (
    <div className="flex h-28 items-end justify-center">
      <div className="relative">
        <div
          className="mx-auto h-12 w-12 rounded-full"
          style={{ background: tint, boxShadow: `0 0 22px ${tint}66` }}
        />
        <div
          className="mx-auto mt-1 h-14 w-10 rounded-t-2xl rounded-b-lg"
          style={{ background: tint }}
        />
      </div>
    </div>
  )
}

const RARITY_COLOR: Record<string, string> = {
  common: 'text-white/60',
  rare: 'text-sky-300',
  premium: 'text-fuchsia-300',
}

/**
 * Full-screen horizontal character browser (PRD vision: shop foundation).
 * Free characters are owned by everyone; coins characters buy via the server RPC;
 * money characters are gated to a later Stripe step. Guests can browse + use the
 * free character, but must log in to buy/equip paid ones.
 */
export function CharacterSelect() {
  const open = useCharacterUi((s) => s.open)
  const close = useCharacterUi((s) => s.closeModal)
  const catalog = useCharacterStore((s) => s.catalog)
  const activeId = useCharacterStore((s) => s.activeId)
  const owned = useCharacterStore((s) => s.owned)
  const equip = useCharacterStore((s) => s.equip)
  const buy = useCharacterStore((s) => s.buy)
  const status = useAuthStore((s) => s.status)
  const wallet = useGameStore((s) => s.wallet)
  const openAuth = useAuthUi((s) => s.openModal)

  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Refresh the catalog when opened (cheap; keeps ownership current).
  useEffect(() => {
    if (open) {
      setError(null)
      void useCharacterStore.getState().load()
    }
  }, [open])

  if (!open) return null

  const onBuy = async (c: Character) => {
    if (status !== 'authed') {
      openAuth()
      return
    }
    setBusyId(c.id)
    setError(null)
    const { error } = await buy(c.id)
    if (error) setError(prettyBuyError(error))
    setBusyId(null)
  }

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-[radial-gradient(120%_90%_at_50%_-10%,rgba(20,40,90,0.5),rgba(0,0,0,0.85))] backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between p-5">
        <h2 className="cr-title text-3xl sm:text-4xl"><span className="cr-word-2">Characters</span></h2>
        <div className="flex items-center gap-3">
          <div className="cr-panel flex items-center gap-2 px-3 py-2">
            <span
              className="inline-block h-4 w-4 rounded-full"
              style={{ background: 'radial-gradient(circle at 35% 30%, #ffe89a, #f5b21f 60%, #c8860a)' }}
            />
            <span className="text-base font-bold tabular-nums text-amber-200">{wallet}</span>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="cr-icon-btn h-10 w-10 rounded-xl text-xl leading-none"
          >
            ✕
          </button>
        </div>
      </div>

      {error && (
        <p className="mx-5 mb-2 rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-200">{error}</p>
      )}

      {/* Horizontal scroller */}
      <div className="flex flex-1 items-center gap-4 overflow-x-auto px-5 pb-8 [scrollbar-width:thin]">
        {catalog.map((c) => {
          const isOwned = owned.includes(c.id)
          const isActive = c.id === activeId
          const abilityName = c.ability_id ? ABILITY_DEFS[c.ability_id]?.name ?? c.ability_id : null
          return (
            <div
              key={c.id}
              className={`cr-panel flex w-60 shrink-0 flex-col items-center gap-3 p-5 ${
                isActive ? 'ring-2 ring-[var(--cr-blue-bright)]' : ''
              }`}
            >
              <Avatar tint={cosmeticTint(c.id)} />

              <div className="text-center">
                <div className="text-lg font-extrabold text-white">{c.name}</div>
                <div className={`cr-label ${RARITY_COLOR[c.rarity] ?? 'text-white/60'}`}>
                  {c.rarity}
                </div>
              </div>

              {abilityName ? (
                <div className="rounded-lg bg-[var(--cr-blue)]/20 px-3 py-1 text-xs font-semibold text-[var(--cr-blue-bright)]">
                  ⚡ {abilityName}
                </div>
              ) : (
                <div className="text-xs text-white/40">No ability</div>
              )}

              {c.description && (
                <p className="min-h-[2.5rem] text-center text-xs text-white/55">{c.description}</p>
              )}

              {/* Action */}
              <div className="mt-1 w-full">
                {isOwned ? (
                  isActive ? (
                    <div className="w-full rounded-xl bg-white/10 py-2.5 text-center text-sm font-bold text-white/70">
                      Equipped
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => equip(c.id)}
                      className="cr-play w-full justify-center py-2.5 text-sm"
                    >
                      Equip
                    </button>
                  )
                ) : c.currency === 'coins' ? (
                  <button
                    type="button"
                    onClick={() => onBuy(c)}
                    disabled={busyId === c.id}
                    className="w-full rounded-xl border border-amber-300/40 bg-amber-400/15 py-2.5 text-sm font-bold text-amber-200 hover:bg-amber-400/25 disabled:opacity-50"
                  >
                    {busyId === c.id
                      ? 'Buying…'
                      : status === 'authed'
                        ? `Buy · ${c.price_coins} 🪙`
                        : 'Log in to buy'}
                  </button>
                ) : (
                  <div className="w-full rounded-xl border border-fuchsia-300/30 bg-fuchsia-500/10 py-2.5 text-center text-sm font-bold text-fuchsia-200">
                    {(c.price_cents / 100).toLocaleString(undefined, { style: 'currency', currency: 'USD' })}
                    <span className="ml-1 text-xs font-normal text-white/50">· soon</span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function prettyBuyError(msg: string): string {
  if (/insufficient/i.test(msg)) return 'Not enough coins.'
  if (/already owned/i.test(msg)) return 'You already own this character.'
  return msg
}
