import { supabase } from '../lib/supabase'

/** A catalog character (mirrors the public.characters table). */
export interface Character {
  id: string
  name: string
  description: string | null
  ability_id: string | null
  currency: 'free' | 'coins' | 'money'
  price_coins: number
  price_cents: number
  rarity: string
  model_url: string | null
  thumbnail_url: string | null
  model_scale: number
  model_offset_y: number
  sort_order: number
}

/**
 * Client-only cosmetics until each character has its own .glb. A tint colour per
 * id gives visual distinction in the picker and in-game (the model is tinted).
 * Falls back to white for unknown ids.
 */
export const COSMETICS: Record<string, { tint: string }> = {
  runner: { tint: '#eaf1ff' }, // near-white (the original look)
  magneto: { tint: '#5ea0ff' }, // electric blue
  phantom: { tint: '#b98cff' }, // premium purple
}
export const cosmeticTint = (id: string) => COSMETICS[id]?.tint ?? '#eaf1ff'

/** Used when Supabase isn't configured (guest-only/offline): just the free runner. */
const FALLBACK_CATALOG: Character[] = [
  {
    id: 'runner',
    name: 'Runner',
    description: 'The original. Reliable and ready to roll.',
    ability_id: null,
    currency: 'free',
    price_coins: 0,
    price_cents: 0,
    rarity: 'common',
    model_url: '/models/player.glb',
    thumbnail_url: null,
    model_scale: 0.72,
    model_offset_y: 0,
    sort_order: 0,
  },
]

const SELECT =
  'id,name,description,ability_id,currency,price_coins,price_cents,rarity,model_url,thumbnail_url,model_scale,model_offset_y,sort_order'

/** Public catalog (readable by guests via RLS). Falls back if no backend. */
export async function fetchCatalog(): Promise<Character[]> {
  if (!supabase) return FALLBACK_CATALOG
  const { data, error } = await supabase
    .from('characters')
    .select(SELECT)
    .eq('is_active', true)
    .order('sort_order')
  if (error || !data) {
    console.warn('[characters] catalog fetch failed:', error?.message)
    return FALLBACK_CATALOG
  }
  return data as Character[]
}

/** Character ids the user owns. */
export async function fetchOwned(userId: string): Promise<string[]> {
  if (!supabase) return ['runner']
  const { data, error } = await supabase
    .from('user_characters')
    .select('character_id')
    .eq('user_id', userId)
  if (error || !data) {
    console.warn('[characters] ownership fetch failed:', error?.message)
    return []
  }
  return data.map((r) => r.character_id as string)
}

/** Equip a character (persist to profiles.active_character_id). */
export async function equipRemote(userId: string, characterId: string): Promise<void> {
  if (!supabase) return
  const { error } = await supabase
    .from('profiles')
    .update({ active_character_id: characterId })
    .eq('id', userId)
  if (error) console.warn('[characters] equip failed:', error.message)
}

/**
 * Buy a coin-priced character via the server RPC (checks ownership, price, and
 * balance atomically). Returns an error message or null on success.
 */
export async function buyWithCoinsRemote(characterId: string): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Accounts are not available right now.' }
  const { error } = await supabase.rpc('purchase_character_with_coins', {
    p_character_id: characterId,
  })
  return { error: error?.message ?? null }
}
