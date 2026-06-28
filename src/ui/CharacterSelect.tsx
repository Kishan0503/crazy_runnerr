import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { create } from 'zustand'
import { Canvas, useFrame } from '@react-three/fiber'
import { useAnimations, useGLTF } from '@react-three/drei'
import { Box3, Group, Mesh, Object3D, SkinnedMesh, Vector3 } from 'three'
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js'
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

/* --------------------------- live hero preview --------------------------- */
// Auto-fit: characters come in wildly different scales (skeleton scale, untuned
// model_scale), so a fixed scale/camera can't frame them all — that's why one
// was cut off and another was off-screen entirely. Instead we measure the POSED
// (skinned) bounding box and normalize every character to the same on-screen
// height, centered at the origin, then spin it.
const TARGET_H = 1.8
const _box = new Box3()
const _v = new Vector3()

function posedBox(obj: Object3D): Box3 {
  _box.makeEmpty()
  obj.updateWorldMatrix(true, true)
  obj.traverse((o) => {
    const sk = o as SkinnedMesh
    if (!sk.isSkinnedMesh) return
    sk.skeleton.update() // refresh bone matrices, else getVertexPosition is stale
    const pos = sk.geometry.getAttribute('position')
    for (let i = 0; i < pos.count; i++) {
      sk.getVertexPosition(i, _v)
      sk.localToWorld(_v)
      _box.expandByPoint(_v)
    }
  })
  return _box
}

function PreviewModel({ url }: { url: string }) {
  const { scene, animations } = useGLTF(url)
  const pivot = useRef<Group>(null)
  const object = useMemo(() => {
    const c = cloneSkeleton(scene)
    c.traverse((o) => {
      if ((o as Mesh).isMesh) (o as Mesh).castShadow = true
    })
    return c
  }, [scene])
  const { actions, names } = useAnimations(animations, pivot)

  // Play the idle clip on a loop.
  useEffect(() => {
    const idle = names.find((n) => /idle/i.test(n)) ?? names[0]
    const a = idle ? actions[idle] : null
    a?.reset().fadeIn(0.2).play()
    return () => void a?.fadeOut(0.2)
  }, [actions, names])

  // Re-fit across the settle window (the idle clip fades in over ~0.3s, so a
  // single early measurement is unreliable — that caused both the "drifts up
  // after a second" and the invisible (un-fit) model). We measure the LIVE posed
  // bounds for ~40 frames: scale to a fixed height (Y is rotation-invariant) and
  // re-center each frame, then lock. The pivot spins independently.
  const scaleRef = useRef(0)
  const fitFrames = useRef(40)
  const logged = useRef(false)
  useFrame((_, dt) => {
    const p = pivot.current
    if (!p) return
    if (fitFrames.current > 0) {
      object.position.set(0, 0, 0)
      object.scale.setScalar(scaleRef.current || 1)
      const b = posedBox(object)
      if (!b.isEmpty()) {
        const h = b.max.y - b.min.y
        if (!scaleRef.current && h > 1e-4) {
          scaleRef.current = TARGET_H / h
          object.scale.setScalar(scaleRef.current)
          if (!logged.current) {
            logged.current = true
            // eslint-disable-next-line no-console
            console.info(`[preview] ${url.split('/').pop()} posedH=${h.toFixed(3)} scale=${scaleRef.current.toFixed(2)}`)
          }
        }
        const b2 = posedBox(object) // re-measure after scaling, then center on Y
        object.position.y = -(b2.max.y + b2.min.y) / 2
      }
      fitFrames.current--
    }
    p.rotation.y += dt * 0.6
  })

  return (
    <group ref={pivot}>
      <primitive object={object} />
    </group>
  )
}

function CharacterPreview({ url }: { url: string }) {
  return (
    <Canvas className="h-full w-full" shadows dpr={[1, 2]} camera={{ position: [0, 0, 3.4], fov: 35 }}>
      <ambientLight intensity={0.7} />
      <hemisphereLight args={['#cfe0ff', '#0a1124', 0.6]} />
      <directionalLight position={[3, 6, 4]} intensity={1.6} castShadow />
      <directionalLight position={[-4, 3, -3]} intensity={0.5} color="#6aa0ff" />
      <Suspense fallback={null}>
        {/* key forces a clean remount + refit when the selected character changes */}
        <PreviewModel key={url} url={url} />
      </Suspense>
    </Canvas>
  )
}

/* ------------------------------- the screen ------------------------------ */
const RARITY_COLOR: Record<string, string> = {
  common: 'text-white/60',
  rare: 'text-sky-300',
  premium: 'text-fuchsia-300',
}

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

  const [selectedId, setSelectedId] = useState(activeId)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // On open: refresh catalog/ownership and focus the equipped character.
  useEffect(() => {
    if (open) {
      setError(null)
      setSelectedId(useCharacterStore.getState().activeId)
      void useCharacterStore.getState().load()
    }
  }, [open])

  if (!open) return null

  const selected = catalog.find((c) => c.id === selectedId) ?? catalog[0]
  const isOwned = selected ? owned.includes(selected.id) : false
  const isActive = selected?.id === activeId
  const abilityName =
    selected?.ability_id ? (ABILITY_DEFS[selected.ability_id]?.name ?? selected.ability_id) : null

  const onBuy = async (c: Character) => {
    if (status !== 'authed') return openAuth()
    setBusyId(c.id)
    setError(null)
    const { error } = await buy(c.id)
    if (error) setError(prettyBuyError(error))
    setBusyId(null)
  }

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-[radial-gradient(120%_90%_at_50%_-10%,rgba(20,40,90,0.55),rgba(0,0,0,0.9))] backdrop-blur-sm">
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
          <button type="button" onClick={close} aria-label="Close" className="cr-icon-btn h-10 w-10 rounded-xl text-xl leading-none">✕</button>
        </div>
      </div>

      {/* Hero: live preview + details */}
      <div className="flex min-h-0 flex-1 flex-col items-center px-5">
        <div className="relative h-[42vh] w-full max-w-md">
          {selected?.model_url ? <CharacterPreview url={selected.model_url} /> : null}
        </div>

        <div className="mt-1 text-center">
          <div className="text-2xl font-extrabold text-white">{selected?.name}</div>
          <div className={`cr-label ${RARITY_COLOR[selected?.rarity ?? 'common'] ?? 'text-white/60'}`}>
            {selected?.rarity}
            {abilityName ? <span className="ml-2 text-[var(--cr-blue-bright)]">⚡ {abilityName}</span> : null}
          </div>
          {selected?.description && (
            <p className="mx-auto mt-1 max-w-sm text-sm text-white/55">{selected.description}</p>
          )}
        </div>

        {error && <p className="mt-2 rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-200">{error}</p>}

        {/* Action */}
        <div className="mt-3 w-full max-w-xs">
          {selected && (
            isOwned ? (
              isActive ? (
                <div className="w-full rounded-xl bg-white/10 py-3 text-center text-sm font-bold text-white/70">Equipped</div>
              ) : (
                <button type="button" onClick={() => equip(selected.id)} className="cr-play w-full justify-center py-3 text-base">Equip</button>
              )
            ) : selected.currency === 'coins' ? (
              <button
                type="button"
                onClick={() => onBuy(selected)}
                disabled={busyId === selected.id}
                className="w-full rounded-xl border border-amber-300/40 bg-amber-400/15 py-3 text-sm font-bold text-amber-200 hover:bg-amber-400/25 disabled:opacity-50"
              >
                {busyId === selected.id ? 'Buying…' : status === 'authed' ? `Buy · ${selected.price_coins} 🪙` : 'Log in to buy'}
              </button>
            ) : (
              <div className="w-full rounded-xl border border-fuchsia-300/30 bg-fuchsia-500/10 py-3 text-center text-sm font-bold text-fuchsia-200">
                {(selected.price_cents / 100).toLocaleString(undefined, { style: 'currency', currency: 'USD' })}
                <span className="ml-1 text-xs font-normal text-white/50">· soon</span>
              </div>
            )
          )}
        </div>
      </div>

      {/* Thumbnail strip — larger cards, centered, horizontal scroll */}
      <div className="overflow-x-auto p-5 [scrollbar-width:thin]">
        <div className="mx-auto flex w-fit gap-4">
          {catalog.map((c) => {
            const ownedC = owned.includes(c.id)
            const sel = c.id === selectedId
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedId(c.id)}
                className={`relative flex h-44 w-32 shrink-0 flex-col items-center justify-end overflow-hidden rounded-2xl border transition ${
                  sel
                    ? 'border-[var(--cr-blue-bright)] ring-2 ring-[var(--cr-blue-bright)]'
                    : 'border-[var(--cr-panel-border)] hover:border-white/40'
                } ${c.id === activeId ? 'bg-[var(--cr-blue)]/15' : 'bg-white/5'}`}
              >
                {c.thumbnail_url ? (
                  <img src={c.thumbnail_url} alt={c.name} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                  <span className="absolute inset-0" style={{ background: cosmeticTint(c.id) }} />
                )}
                {!ownedC && (
                  <span className="absolute right-1.5 top-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-xs text-amber-200">🔒</span>
                )}
                {c.id === activeId && (
                  <span className="absolute left-1.5 top-1.5 rounded-md bg-[var(--cr-blue)]/80 px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide text-white">
                    Equipped
                  </span>
                )}
                <span className="relative z-10 w-full truncate bg-black/55 px-2 py-1.5 text-center text-sm font-semibold text-white">
                  {c.name}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function prettyBuyError(msg: string): string {
  if (/insufficient/i.test(msg)) return 'Not enough coins.'
  if (/already owned/i.test(msg)) return 'You already own this character.'
  return msg
}
