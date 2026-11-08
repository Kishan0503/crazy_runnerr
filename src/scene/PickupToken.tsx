import { useMemo, useRef } from 'react'
import { CONFIG } from '../game/config'
import { useFrame } from '@react-three/fiber'
import { CanvasTexture, Group, SRGBColorSpace, type MeshBasicMaterial } from 'three'
import type { PickupKind } from '../game/pickups'
import { world } from '../game/world'
import { track } from '../game/track'
import { WARM_Z, WarmTracker } from '../game/warmup'
import { buildPickupModel, JETPACK_FLAME_NAME, makeGroundGlow, PICKUP_GLOW } from './pickupModels'

/** Pickup colours (also used by HUD chips). */
export const PICKUP_COLORS: Record<PickupKind, string> = {
  shield: '#4fb4ff',
  magnet: '#ff4f6d',
  double: '#ffd23f',
  jetpack: '#c9d2e3',
}

/** Icon drawn once per kind into a canvas (no image assets needed). */
const iconCache = new Map<PickupKind, CanvasTexture>()
export function pickupIcon(kind: PickupKind): CanvasTexture {
  const hit = iconCache.get(kind)
  if (hit) return hit
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  // Badge: solid disc in the pickup colour with a white rim, icon scaled into it.
  g.fillStyle = PICKUP_COLORS[kind]
  g.beginPath()
  g.arc(64, 64, 60, 0, Math.PI * 2)
  g.fill()
  g.lineWidth = 6
  g.strokeStyle = '#ffffff'
  g.stroke()
  g.translate(64, 64)
  g.scale(0.62, 0.62)
  g.translate(-64, -64)
  g.lineCap = g.lineJoin = 'round'
  g.strokeStyle = '#ffffff'
  g.fillStyle = '#ffffff'
  g.lineWidth = 12
  switch (kind) {
    case 'shield':
      g.beginPath()
      g.moveTo(64, 14)
      g.lineTo(108, 30)
      g.quadraticCurveTo(106, 92, 64, 116)
      g.quadraticCurveTo(22, 92, 20, 30)
      g.closePath()
      g.stroke()
      break
    case 'magnet':
      g.lineWidth = 20
      g.beginPath()
      g.arc(64, 62, 30, Math.PI, 0, true)
      g.moveTo(34, 62)
      g.lineTo(34, 24)
      g.moveTo(94, 62)
      g.lineTo(94, 24)
      g.stroke()
      g.fillStyle = '#2a3350'
      g.fillRect(22, 14, 24, 16)
      g.fillRect(82, 14, 24, 16)
      break
    case 'double':
      g.font = 'bold 70px sans-serif'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText('2×', 64, 68)
      break
    case 'jetpack':
      g.fillRect(34, 26, 24, 62)
      g.fillRect(70, 26, 24, 62)
      g.fillStyle = '#ffae1f'
      g.beginPath()
      g.moveTo(34, 92)
      g.lineTo(46, 122)
      g.lineTo(58, 92)
      g.moveTo(70, 92)
      g.lineTo(82, 122)
      g.lineTo(94, 92)
      g.fill()
      break
  }
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  iconCache.set(kind, tex)
  return tex
}

/** Pickup tokens alive at once (pickups are ≥ 180 m apart; 3 is ample). */
const POOL = 3
/** On-track size of the pickup models (they're built ~0.8 m tall). */
const PICKUP_SCALE = 1.6
const KINDS: PickupKind[] = ['shield', 'magnet', 'double', 'jetpack']

/**
 * Pickups on the track (art pass, 2026-11): the user's low-poly designs from
 * pickupModels.ts. A fixed pool of slots, each holding all four models (clones
 * sharing geometry + materials) and a coloured light on the road; per frame
 * the right model is shown, floating, swaying and pulsing, flames flickering.
 * Nothing is created during a run; everything is warmed on the loading screen.
 */
export function PickupPool() {
  const slots = useMemo(() => {
    const protos = Object.fromEntries(KINDS.map((k) => [k, buildPickupModel(k)])) as Record<PickupKind, Group>
    return Array.from({ length: POOL }, () => {
      const root = new Group()
      const float = new Group()
      root.add(float)
      const models = {} as Record<PickupKind, Group>
      for (const k of KINDS) {
        const m = protos[k].clone(true)
        m.visible = false
        float.add(m)
        models[k] = m
      }
      const glow = makeGroundGlow(PICKUP_GLOW.shield)
      root.add(glow)
      const flames = models.jetpack.children.filter((c) => c.name === JETPACK_FLAME_NAME)
      root.visible = false
      // Pooled + warmed behind the camera: never frustum-culled.
      root.traverse((o) => (o.frustumCulled = false))
      return { root, float, models, glow, flames, kind: null as PickupKind | null }
    })
  }, [])
  const warm = useMemo(() => new WarmTracker(), [])
  const t = useRef(0)

  useFrame((_, delta) => {
    if (world.running) t.current += Math.min(delta, CONFIG.maxFrameDt)
    const time = t.current
    let i = 0
    const show = (kind: PickupKind, x: number, z: number, all = false) => {
      const s = slots[i++]
      s.root.visible = true
      s.root.position.set(x, 0, z)
      if (s.kind !== kind || all) {
        for (const k of KINDS) s.models[k].visible = all || k === kind
        ;(s.glow.material as MeshBasicMaterial).color.set(PICKUP_GLOW[kind])
        s.kind = all ? null : kind
      }
      s.float.position.y = 1.25 + Math.sin(time * 3 + i) * 0.1
      s.float.rotation.y = Math.sin(time * 1.6 + i) * 0.5 // sway, always showing its face
      s.float.scale.setScalar(PICKUP_SCALE * (1 + Math.sin(time * 6) * 0.04))
      for (const f of s.flames) f.scale.y = 0.75 + Math.random() * 0.5
    }
    for (const p of track.pickups) if (i < POOL) show(p.kind, CONFIG.lanes[p.lane], p.z)
    // Warm-up: every model of one slot at once, behind the camera.
    if (warm.shouldWarm() && i < POOL) show('jetpack', 0, WARM_Z, true)
    for (; i < POOL; i++) slots[i].root.visible = false
  })

  return (
    <>
      {slots.map((s, i) => (
        <primitive key={i} object={s.root} />
      ))}
    </>
  )
}
