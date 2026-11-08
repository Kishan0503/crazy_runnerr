import { create } from 'zustand'
import { useGLTF } from '@react-three/drei'
import { buyWithCoinsRemote, equipRemote, fetchCatalog, fetchOwned, type Character } from './characters'
import { useAuthStore } from './auth'

/** Warm the GPU/network cache for a character's model so equipping/playing is
 *  instant. Lazy — we only ever preload models the player actually selects. */
function preloadModel(url: string | null | undefined) {
  if (url) useGLTF.preload(url)
}

/**
 * Character catalog + ownership + the equipped character.
 *
 *   - GUEST: sees the full catalog (public read) but only owns the FREE
 *     character(s); equip persists to localStorage; buying requires login.
 *   - AUTHED: owns whatever user_characters says; equip persists to
 *     profiles.active_character_id; buying goes through the server RPC.
 */

const GUEST_ACTIVE_KEY = 'lane-runner:character'
const DEFAULT_ID = 'runner'

interface CharacterStore {
  catalog: Character[]
  owned: string[]
  activeId: string
  loading: boolean
  /** true once the first load() has resolved — until then activeId is just the
   *  optimistic DEFAULT_ID and must NOT be rendered (else a wrong character
   *  flashes before the real equipped one resolves). */
  loaded: boolean
  /** (re)load catalog + ownership + equipped character for the current auth state */
  load: () => Promise<void>
  /** equip an owned character */
  equip: (id: string) => Promise<void>
  /** buy a coins-priced character; returns an error message or null */
  buy: (id: string) => Promise<{ error: string | null }>
  isOwned: (id: string) => boolean
  activeCharacter: () => Character | undefined
}

const loadGuestActive = (): string => {
  try {
    return localStorage.getItem(GUEST_ACTIVE_KEY) || DEFAULT_ID
  } catch {
    return DEFAULT_ID
  }
}
const saveGuestActive = (id: string) => {
  try {
    localStorage.setItem(GUEST_ACTIVE_KEY, id)
  } catch {
    /* ignore */
  }
}

/**
 * Last known catalog + equipped character, so a returning player's model starts
 * downloading the instant the page opens instead of after the catalog round-trip
 * (that wait kept the loading screen at "100%" for seconds). load() refreshes it
 * in the background and corrects anything that changed.
 */
const CACHE_KEY = 'lane-runner:characters-cache'
interface CharacterCache {
  catalog: Character[]
  owned: string[]
  activeId: string
}
const readCache = (): CharacterCache | null => {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as CharacterCache | null
    return c && Array.isArray(c.catalog) && c.catalog.length > 0 && typeof c.activeId === 'string' ? c : null
  } catch {
    return null
  }
}
const writeCache = (c: CharacterCache) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(c))
  } catch {
    /* ignore */
  }
}

const cached = readCache()
if (cached) preloadModel(cached.catalog.find((c) => c.id === cached.activeId)?.model_url)

/** One load at a time; calls made meanwhile coalesce into a single re-run. */
let inflight: Promise<void> | null = null
let rerun = false

export const useCharacterStore = create<CharacterStore>((set, get) => {
  async function loadOnce() {
    set({ loading: true })
    const auth = useAuthStore.getState()
    const catalog = await fetchCatalog()
    const freeIds = catalog.filter((c) => c.currency === 'free').map((c) => c.id)

    let owned: string[]
    let activeId: string
    if (auth.status === 'authed' && auth.user) {
      owned = await fetchOwned(auth.user.id)
      // Server may not have granted yet on first frame; always include free ones.
      owned = Array.from(new Set([...freeIds, ...owned]))
      activeId = auth.profile?.active_character_id ?? DEFAULT_ID
    } else {
      owned = freeIds.length ? freeIds : [DEFAULT_ID]
      activeId = loadGuestActive()
    }
    // Never leave the player equipped with something they don't own.
    if (!owned.includes(activeId)) activeId = owned[0] ?? DEFAULT_ID

    set({ catalog, owned, activeId, loading: false, loaded: true })
    writeCache({ catalog, owned, activeId })
    // Warm the equipped character's model so the first run starts instantly.
    preloadModel(catalog.find((c) => c.id === activeId)?.model_url)
  }

  return {
    catalog: cached?.catalog ?? [],
    owned: cached?.owned ?? [DEFAULT_ID],
    activeId: cached?.activeId ?? DEFAULT_ID,
    loading: false,
    loaded: cached !== null,

    load: () => {
      if (inflight) {
        rerun = true
        return inflight
      }
      inflight = (async () => {
        do {
          rerun = false
          await loadOnce()
        } while (rerun)
      })().finally(() => {
        inflight = null
      })
      return inflight
    },

    equip: async (id) => {
      if (!get().isOwned(id)) return
      set({ activeId: id })
      writeCache({ catalog: get().catalog, owned: get().owned, activeId: id })
      preloadModel(get().catalog.find((c) => c.id === id)?.model_url)
      const auth = useAuthStore.getState()
      if (auth.status === 'authed' && auth.user) {
        // Keep the CACHED profile in sync with the DB write, otherwise the next
        // load() (e.g. reopening the picker) would revert activeId to the stale
        // cached active_character_id. (Was the "equipped character jumps" bug.)
        if (auth.profile) {
          useAuthStore.setState({
            profile: { ...auth.profile, active_character_id: id },
          })
        }
        await equipRemote(auth.user.id, id)
      } else {
        saveGuestActive(id)
      }
    },

    buy: async (id) => {
      const { error } = await buyWithCoinsRemote(id)
      if (error) return { error }
      // Refresh server balance + ownership, then equip the new character.
      await useAuthStore.getState().refresh()
      const auth = useAuthStore.getState()
      if (auth.user) {
        const owned = Array.from(new Set([...get().owned, id, ...(await fetchOwned(auth.user.id))]))
        set({ owned })
      }
      await get().equip(id)
      return { error: null }
    },

    isOwned: (id) => get().owned.includes(id),
    activeCharacter: () => get().catalog.find((c) => c.id === get().activeId),
  }
})
