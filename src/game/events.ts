/**
 * Game event bus (Phase 2). Gameplay code emits discrete moments — jump, coin,
 * crash, milestone… — and feedback systems (audio, particles, camera shake,
 * banners, haptics) subscribe. Gameplay never knows who is listening, so new
 * feedback can be added without touching game logic.
 *
 * Synchronous and allocation-free per emit (payloads are small literals).
 */
export interface GameEvents {
  runStart: undefined
  pause: undefined
  resume: undefined
  jump: { buffered: boolean }
  slide: undefined
  fastFall: undefined
  land: { hard: boolean }
  laneChange: { dir: -1 | 1 }
  coin: { streak: number }
  stumble: undefined
  crash: undefined
  nearMiss: undefined
  speedTier: { tier: number }
  milestone: { meters: number }
  newBest: undefined
  abilityOn: { id: string }
  abilityOff: { id: string }
  gameOver: { newBest: boolean }
  uiClick: undefined
}

export type GameEvent = keyof GameEvents
type Listener<K extends GameEvent> = (payload: GameEvents[K]) => void

type AnyListener = (payload: unknown) => void
const listeners = new Map<GameEvent, Set<AnyListener>>()

/** Subscribe; returns an unsubscribe function. */
export function on<K extends GameEvent>(type: K, fn: Listener<K>): () => void {
  let set = listeners.get(type)
  if (!set) listeners.set(type, (set = new Set()))
  const l = fn as AnyListener
  set.add(l)
  return () => void set.delete(l)
}

/** Emit to every listener. A throwing listener never breaks gameplay. */
export function emit<K extends GameEvent>(
  type: K,
  ...payload: GameEvents[K] extends undefined ? [] : [GameEvents[K]]
): void {
  const set = listeners.get(type)
  if (!set || set.size === 0) return
  for (const fn of set) {
    try {
      fn(payload[0])
    } catch (err) {
      if (import.meta.env.DEV) console.error(`[events] ${type} listener failed`, err)
    }
  }
}
