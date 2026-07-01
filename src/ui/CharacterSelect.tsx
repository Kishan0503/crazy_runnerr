import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { create } from 'zustand'
import { Canvas, useFrame } from '@react-three/fiber'
import { useAnimations, useGLTF } from '@react-three/drei'
import { Box3, Group, MathUtils, Matrix4, Mesh, Object3D, SkinnedMesh, Vector3 } from 'three'
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
// was cut off and another off-screen. We use the SAME convention as in-game
// (scene/Player.tsx): normalize to a fixed height once, then SEAT THE FEET on a
// fixed floor (y=0). We must NOT re-center on the box midpoint each frame — the
// idle clip keeps moving the body, so a locked midpoint drifts out of frame
// (the "appears for a second then sinks and disappears" bug). Feet-grounding is
// pose-stable (a breathing idle barely moves the feet), so it stays put. The
// camera looks at mid-height so a feet-at-0 model sits centered.
const TARGET_H = 1.8
const _box = new Box3()
const _v = new Vector3()
const _inv = new Matrix4()

/**
 * Bounding box of a skinned model under its CURRENT animated pose, measured in
 * `ref`'s OWN LOCAL space (not world space).
 *
 * Why local-to-ref and not world: the model sits inside a constantly-spinning
 * pivot. A world-space box folds that rotation in, so for models with a baked
 * non-uniform node scale (e.g. Cyborg ships a 100× scale on `textured_mesh`) the
 * measured min.y becomes rotation-dependent and the per-frame grounding never
 * converges — the character shoots out of frame. Measuring relative to `ref`
 * cancels both the pivot rotation and `ref`'s own scale offset, so scale + ground
 * are stable for every character regardless of how its source was authored.
 *
 * skeleton.update() first, else bone matrices are stale. Returns null if empty.
 */
function posedBox(ref: Object3D): Box3 | null {
  _box.makeEmpty()
  ref.updateWorldMatrix(true, true)
  _inv.copy(ref.matrixWorld).invert()
  ref.traverse((o) => {
    const sk = o as SkinnedMesh
    if (!sk.isSkinnedMesh) return
    sk.skeleton.update()
    const pos = sk.geometry.getAttribute('position')
    for (let i = 0; i < pos.count; i++) {
      sk.getVertexPosition(i, _v)
      sk.localToWorld(_v) // → world
      _v.applyMatrix4(_inv) // → ref-local (cancels pivot rotation + ref scale)
      _box.expandByPoint(_v)
    }
  })
  return _box.isEmpty() ? null : _box
}

function PreviewModel({ url, yawRef }: { url: string; yawRef: { current: number } }) {
  const { scene, animations } = useGLTF(url)
  const pivot = useRef<Group>(null)
  // The model node we scale/ground — kept SEPARATE from the spinning pivot so
  // grounding (a Y translate) is never mixed with the rotation.
  const model = useRef<Group>(null)
  const object = useMemo(() => {
    const c = cloneSkeleton(scene)
    c.traverse((o) => {
      if ((o as Mesh).isMesh) (o as Mesh).castShadow = true
    })
    return c
  }, [scene])
  const { actions, names } = useAnimations(animations, model)

  // Play the idle clip on a loop.
  useEffect(() => {
    const idle = names.find((n) => /idle/i.test(n)) ?? names[0]
    const a = idle ? actions[idle] : null
    a?.reset().fadeIn(0.2).play()
    return () => void a?.fadeOut(0.2)
  }, [actions, names])

  // Fit = scale-to-height ONCE, then seat feet on y=0 for a few frames to let the
  // idle fade-in settle, then lock. We ground by box.min.y (the feet), NOT the
  // midpoint — feet are pose-stable, the midpoint is not. The pivot spins; the
  // model only ever translates vertically to keep its feet on the floor.
  const scaled = useRef(false)
  const groundFrames = useRef(20)
  const logged = useRef(false)
  useFrame((_, dt) => {
    const p = pivot.current
    const m = model.current
    // User drives the rotation by dragging (yawRef). Ease toward it for smooth
    // inertia. The idle clip keeps playing regardless — it lives on the mixer.
    if (p) p.rotation.y = MathUtils.damp(p.rotation.y, yawRef.current, 12, dt)
    if (!m) return

    // posedBox is measured in m's LOCAL frame (unscaled), so height/min must be
    // multiplied by m.scale to get pivot-frame (rendered) units.
    if (!scaled.current) {
      const b = posedBox(m)
      if (b) {
        const h = b.max.y - b.min.y // local (unscaled) height
        if (h > 1e-4) {
          m.scale.setScalar(TARGET_H / h)
          scaled.current = true
          if (!logged.current) {
            logged.current = true
            // eslint-disable-next-line no-console
            console.info(`[preview] ${url.split('/').pop()} posedH=${h.toFixed(3)} scale=${(TARGET_H / h).toFixed(2)}`)
          }
        }
      }
      return // ground only after scaling is applied
    }
    if (groundFrames.current > 0) {
      const b = posedBox(m) // local-frame box
      // Feet in pivot frame = m.position.y + m.scale*b.min.y; set that to 0.
      if (b) m.position.y = -b.min.y * m.scale.y
      groundFrames.current--
    }
  })

  return (
    <group ref={pivot}>
      <group ref={model}>
        <primitive object={object} />
      </group>
    </group>
  )
}

function CharacterPreview({ url }: { url: string }) {
  // Click-drag to rotate the character. yawRef is the live target yaw the model
  // eases toward; pointer handlers (DOM) mutate it, the R3F useFrame reads it —
  // a plain ref avoids re-rendering the canvas every drag frame.
  const yawRef = useRef(0)
  const drag = useRef<{ x: number; yaw: number } | null>(null)
  // Reset facing when the character changes (front-on for the new model).
  useEffect(() => {
    yawRef.current = 0
  }, [url])

  const onDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, yaw: yawRef.current }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    // ~0.5π per full preview width feels natural; sign so dragging right spins right.
    yawRef.current = d.yaw + (e.clientX - d.x) * 0.01
  }
  const onUp = (e: React.PointerEvent) => {
    drag.current = null
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  // Camera looks at mid-height so a feet-at-floor (y=0) model of height TARGET_H
  // is vertically centered in the small preview canvas.
  return (
    <Canvas
      className="h-full w-full cursor-grab touch-none active:cursor-grabbing"
      shadows
      dpr={[1, 2]}
      camera={{ position: [0, TARGET_H / 2, 3.4], fov: 35 }}
      onCreated={({ camera }) => camera.lookAt(0, TARGET_H / 2, 0)}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerLeave={onUp}
    >
      <ambientLight intensity={0.7} />
      <hemisphereLight args={['#cfe0ff', '#0a1124', 0.6]} />
      <directionalLight position={[3, 6, 4]} intensity={1.6} castShadow />
      <directionalLight position={[-4, 3, -3]} intensity={0.5} color="#6aa0ff" />
      <Suspense fallback={null}>
        {/* key forces a clean remount + refit when the selected character changes */}
        <PreviewModel key={url} url={url} yawRef={yawRef} />
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

/** Rarity → glow color (drives the --glow CSS var behind each thumbnail). */
const RARITY_GLOW: Record<string, string> = {
  common: 'rgba(226, 232, 240, 0.55)', // white
  rare: 'rgba(168, 85, 247, 0.7)', // purple
  premium: 'rgba(245, 178, 31, 0.75)', // gold
}
const rarityGlow = (rarity?: string) => RARITY_GLOW[rarity ?? 'common'] ?? RARITY_GLOW.common

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
  // Transient reward feedback: which card just got equipped/bought, so we can
  // play a one-shot animation. Cleared by a timer after the animation length.
  const [feedback, setFeedback] = useState<{ id: string; kind: 'equip' | 'buy' } | null>(null)
  const fbTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flash = (id: string, kind: 'equip' | 'buy') => {
    if (fbTimer.current) clearTimeout(fbTimer.current)
    setFeedback({ id, kind })
    fbTimer.current = setTimeout(() => setFeedback(null), 700)
  }

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

  const onEquip = (c: Character) => {
    equip(c.id)
    flash(c.id, 'equip')
  }

  const onBuy = async (c: Character) => {
    if (status !== 'authed') return openAuth()
    setBusyId(c.id)
    setError(null)
    const { error } = await buy(c.id)
    setBusyId(null)
    if (error) {
      setError(prettyBuyError(error))
    } else {
      // buy() also equips on success — celebrate with the gold shimmer.
      flash(c.id, 'buy')
    }
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
          {/* One-shot reward glow over the hero on equip/buy. Keyed so it
              remounts (and replays) each time; never touches the canvas. */}
          {feedback && selected && feedback.id === selected.id && (
            <span
              key={`${feedback.id}-${feedback.kind}`}
              className="pointer-events-none absolute inset-0 cr-hero-pulse"
              style={{
                background: `radial-gradient(60% 60% at 50% 55%, ${
                  feedback.kind === 'buy' ? 'rgba(255,216,120,0.35)' : rarityGlow(selected.rarity)
                }, transparent 70%)`,
              }}
            />
          )}
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
                <button type="button" onClick={() => onEquip(selected)} className="cr-play w-full justify-center py-3 text-base">Equip</button>
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

      {/* Thumbnail strip — raised off the bottom, chest-cropped, rarity glow */}
      <div className="overflow-x-auto px-5 pb-10 pt-3 [scrollbar-width:thin]">
        <div className="mx-auto flex w-fit gap-5">
          {catalog.map((c) => {
            const ownedC = owned.includes(c.id)
            const sel = c.id === selectedId
            const glow = rarityGlow(c.rarity)
            const fb = feedback?.id === c.id ? feedback.kind : null
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedId(c.id)}
                style={{ ['--glow' as string]: glow }}
                className={`cr-thumb relative flex h-36 w-32 shrink-0 flex-col items-center justify-end overflow-hidden rounded-2xl border ${
                  sel ? 'cr-thumb-selected border-[var(--cr-blue-bright)] ring-2 ring-[var(--cr-blue-bright)]' : 'cr-thumb-glow border-[var(--cr-panel-border)] hover:border-white/40'
                } ${c.id === activeId ? 'bg-[var(--cr-blue)]/15' : 'bg-white/5'} ${
                  fb === 'equip' ? 'cr-equip-pop' : ''
                } ${fb === 'buy' ? 'cr-buy-flash' : ''}`}
              >
                {/* Chest-up framing: the thumbnail is a full/half figure, so we
                    blow it up and anchor the TOP so every card consistently
                    shows head-to-chest regardless of how the source was cropped. */}
                {c.thumbnail_url ? (
                  <img
                    src={c.thumbnail_url}
                    alt={c.name}
                    loading="lazy"
                    className="absolute inset-x-0 top-0 h-[150%] w-full object-cover object-top"
                  />
                ) : (
                  <span className="absolute inset-0" style={{ background: cosmeticTint(c.id) }} />
                )}
                {/* One-shot ring burst on equip. */}
                {fb === 'equip' && <span key={`ring-${c.id}`} className="cr-equip-ring" />}
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
