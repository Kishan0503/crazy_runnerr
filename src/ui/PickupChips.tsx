import { useEffect, useMemo, useRef } from 'react'
import { PICKUP_KINDS, pickupDuration, pickups, type PickupKind } from '../game/pickups'
import { PICKUP_COLORS, pickupIcon } from '../scene/PickupToken'

const LABEL: Record<PickupKind, string> = { shield: 'Shield', magnet: 'Magnet', double: '2× Coins', jetpack: 'Jetpack' }

/**
 * Active-pickup chips (Phase 4A): icon + draining bar for each running pickup,
 * under the distance read-out. Updated imperatively on a rAF (no re-renders).
 */
export function PickupChips() {
  const chips = useRef<Partial<Record<PickupKind, HTMLDivElement | null>>>({})
  const bars = useRef<Partial<Record<PickupKind, HTMLDivElement | null>>>({})
  const icons = useMemo(
    () => Object.fromEntries(PICKUP_KINDS.map((k) => [k, pickupIcon(k).image.toDataURL()])) as Record<PickupKind, string>,
    [],
  )

  useEffect(() => {
    let raf = 0
    const tick = () => {
      for (const kind of PICKUP_KINDS) {
        const left = pickups.timers[kind]
        const chip = chips.current[kind]
        if (chip) chip.style.display = left > 0 ? 'flex' : 'none'
        const bar = bars.current[kind]
        if (bar && left > 0) bar.style.transform = `scaleX(${Math.min(1, left / pickupDuration(kind))})`
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="absolute left-1/2 top-[9.5rem] flex -translate-x-1/2 gap-2">
      {PICKUP_KINDS.map((kind) => (
        <div
          key={kind}
          ref={(el) => {
            chips.current[kind] = el
          }}
          className="cr-panel hidden items-center gap-2 px-2.5 py-1.5"
          style={{ borderColor: `${PICKUP_COLORS[kind]}88` }}
        >
          <span
            className="flex h-6 w-6 items-center justify-center rounded-full"
            style={{ background: `${PICKUP_COLORS[kind]}55` }}
          >
            <img src={icons[kind]} alt="" className="h-5 w-5" />
          </span>
          <div className="flex flex-col gap-1">
            <span className="text-[0.65rem] font-bold uppercase tracking-wider text-white/85">{LABEL[kind]}</span>
            <div className="h-1 w-16 overflow-hidden rounded-full bg-white/10">
              <div
                ref={(el) => {
                  bars.current[kind] = el
                }}
                className="h-full w-full origin-left rounded-full"
                style={{ background: PICKUP_COLORS[kind] }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
