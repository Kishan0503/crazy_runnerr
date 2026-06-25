import { world } from './world'
import { player } from './playerState'
import { useGameStore } from './store'

/**
 * Dev-only debug bridge. Exposes the live runtime on `window.__game` so it can
 * be inspected/driven from the console or an automated headless test. Guarded by
 * import.meta.env.DEV, so it is tree-shaken out of production builds entirely.
 */
export function installDevBridge() {
  if (!import.meta.env.DEV) return
  ;(window as unknown as { __game: unknown }).__game = {
    world,
    player,
    store: useGameStore,
  }
}
