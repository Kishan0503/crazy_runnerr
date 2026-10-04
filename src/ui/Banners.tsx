import { useEffect, useRef, useState } from 'react'
import { on } from '../game/events'

type Kind = 'speed' | 'milestone' | 'best' | 'close'
interface Banner {
  id: number
  text: string
  kind: Kind
}

/** How long each banner stays mounted (matches the CSS animation length). */
const LIFETIME: Record<Kind, number> = { speed: 1300, milestone: 1300, best: 1600, close: 800 }
const STYLE: Record<Kind, string> = {
  speed: 'cr-banner text-4xl text-sky-200',
  milestone: 'cr-banner text-4xl text-white',
  best: 'cr-banner text-5xl text-amber-300',
  close: 'cr-banner-small text-2xl text-emerald-300',
}

/**
 * Event-driven pop-up banners (Phase 2): "SPEED UP!", "500 m!", "NEW BEST!" in
 * the upper-middle, and a smaller "CLOSE!" near the runner for near misses.
 * Also owns two full-screen effects: the white crash flash and the speed lines
 * that streak in on a speed-tier change. Events are rare, so React state is fine.
 */
export function Banners() {
  const [items, setItems] = useState<Banner[]>([])
  const nextId = useRef(1)
  const flashRef = useRef<HTMLDivElement>(null)
  const linesRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const push = (text: string, kind: Kind) => {
      const id = nextId.current++
      // Big banners replace each other; "CLOSE!" can overlap them.
      setItems((prev) => [...prev.filter((b) => kind === 'close' || b.kind === 'close'), { id, text, kind }])
      setTimeout(() => setItems((prev) => prev.filter((b) => b.id !== id)), LIFETIME[kind])
    }
    const offs = [
      on('speedTier', () => {
        push('SPEED UP!', 'speed')
        linesRef.current?.animate([{ opacity: 0 }, { opacity: 0.9, offset: 0.2 }, { opacity: 0 }], {
          duration: 900,
          easing: 'ease-out',
        })
      }),
      on('milestone', ({ meters }) => push(meters % 1000 === 0 ? `${meters / 1000} KM!` : `${meters} m!`, 'milestone')),
      on('newBest', () => push('NEW BEST!', 'best')),
      on('nearMiss', () => push('CLOSE!', 'close')),
      on('crash', () =>
        flashRef.current?.animate([{ opacity: 0.85 }, { opacity: 0 }], { duration: 260, easing: 'ease-out' }),
      ),
      on('runStart', () => setItems([])),
    ]
    return () => offs.forEach((off) => off())
  }, [])

  return (
    <div className="pointer-events-none absolute inset-0 z-[15] overflow-hidden">
      {/* Speed lines: radial streaks converging on the vanishing point. */}
      <div ref={linesRef} className="cr-speed-lines absolute inset-0 opacity-0" />
      {/* Crash flash. */}
      <div ref={flashRef} className="absolute inset-0 bg-white opacity-0" />

      <div className="absolute inset-x-0 top-[24%] flex justify-center">
        {items
          .filter((b) => b.kind !== 'close')
          .map((b) => (
            <span key={b.id} className={`cr-title ${STYLE[b.kind]}`}>
              {b.text}
            </span>
          ))}
      </div>
      <div className="absolute inset-x-0 bottom-[30%] flex justify-center">
        {items
          .filter((b) => b.kind === 'close')
          .map((b) => (
            <span key={b.id} className={`cr-title ${STYLE[b.kind]}`}>
              {b.text}
            </span>
          ))}
      </div>
    </div>
  )
}
