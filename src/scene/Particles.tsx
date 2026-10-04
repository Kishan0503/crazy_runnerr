import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, InstancedMesh, Object3D } from 'three'
import { CONFIG } from '../game/config'
import { on } from '../game/events'
import { player } from '../game/playerState'
import { world } from '../game/world'
import { useGameStore } from '../game/store'

/** Pool size — every live spark/puff shares ONE instanced draw call. */
const MAX = 128

interface Preset {
  count: number
  colors: string[]
  /** initial speed range (units/s) */
  speed: [number, number]
  /** bias added to velocity: [x, y, z] */
  dir: [number, number, number]
  /** how much the random direction spreads sideways/up (0 = pure dir) */
  spread: number
  gravity: number
  life: [number, number]
  size: number
}

const PRESETS = {
  coin: { count: 8, colors: ['#ffd23f', '#ffe89a', '#ffae1f'], speed: [2.5, 4.5], dir: [0, 2.5, 0], spread: 1, gravity: 9, life: [0.35, 0.55], size: 0.09 },
  dust: { count: 6, colors: ['#9aa4b8', '#c6cfdf'], speed: [0.8, 1.8], dir: [0, 0.6, 1.2], spread: 1, gravity: 2.5, life: [0.35, 0.55], size: 0.13 },
  dustHard: { count: 12, colors: ['#9aa4b8', '#c6cfdf'], speed: [1.5, 3], dir: [0, 0.9, 1.4], spread: 1, gravity: 3, life: [0.4, 0.7], size: 0.17 },
  slide: { count: 6, colors: ['#6fb3ff', '#bfe0ff'], speed: [2, 3.5], dir: [0, 0.4, 3], spread: 0.6, gravity: 4, life: [0.25, 0.4], size: 0.07 },
  stumble: { count: 9, colors: ['#ffa024', '#ffd27a'], speed: [2.5, 4.5], dir: [0, 1.5, 0], spread: 1, gravity: 8, life: [0.3, 0.5], size: 0.09 },
  crash: { count: 18, colors: ['#ffffff', '#8fc2ff', '#4f80ff'], speed: [4, 8], dir: [0, 2, 1.5], spread: 1, gravity: 9, life: [0.5, 0.9], size: 0.12 },
} satisfies Record<string, Preset>

type PresetName = keyof typeof PRESETS

const rand = (a: number, b: number) => a + Math.random() * (b - a)

/**
 * Pooled particle bursts (Phase 2). One InstancedMesh of tiny unlit cubes
 * (bright, not tone-mapped → they catch the bloom). Bursts are triggered by game
 * events; particles drift back with the world (world.dz) so dust stays on the
 * road, and slow down with the death slow-mo.
 */
export function Particles() {
  const mesh = useRef<InstancedMesh>(null)
  const dummy = useMemo(() => new Object3D(), [])
  const color = useMemo(() => new Color(), [])
  // Struct-of-arrays pool (no per-particle objects).
  const pool = useMemo(
    () => ({
      pos: new Float32Array(MAX * 3),
      vel: new Float32Array(MAX * 3),
      life: new Float32Array(MAX), // seconds left (0 = dead)
      maxLife: new Float32Array(MAX),
      size: new Float32Array(MAX),
      gravity: new Float32Array(MAX),
      next: 0,
    }),
    [],
  )

  useEffect(() => {
    // Create the per-instance colour buffer up front so the shader is compiled
    // with instance colours from the first frame (no recompile on first burst).
    const m0 = mesh.current
    if (m0) {
      for (let i = 0; i < MAX; i++) m0.setColorAt(i, color.set('#ffffff'))
      if (m0.instanceColor) m0.instanceColor.needsUpdate = true
    }

    const burst = (name: PresetName, x: number, y: number, z: number) => {
      const p: Preset = PRESETS[name]
      const m = mesh.current
      for (let n = 0; n < p.count; n++) {
        const i = pool.next
        pool.next = (pool.next + 1) % MAX // oldest particle is recycled first
        const sp = rand(p.speed[0], p.speed[1])
        // Random direction on a hemisphere, blended with the preset's bias.
        const a = Math.random() * Math.PI * 2
        const up = Math.random()
        const r = Math.sqrt(1 - up * up)
        pool.pos.set([x + rand(-0.15, 0.15), y + rand(0, 0.15), z + rand(-0.15, 0.15)], i * 3)
        pool.vel.set(
          [
            Math.cos(a) * r * sp * p.spread + p.dir[0],
            up * sp * p.spread + p.dir[1],
            Math.sin(a) * r * sp * p.spread + p.dir[2],
          ],
          i * 3,
        )
        pool.life[i] = pool.maxLife[i] = rand(p.life[0], p.life[1])
        pool.size[i] = p.size * rand(0.7, 1.3)
        pool.gravity[i] = p.gravity
        if (m) m.setColorAt(i, color.set(p.colors[n % p.colors.length]))
      }
      if (m?.instanceColor) m.instanceColor.needsUpdate = true
    }

    const atFeet = (name: PresetName) => burst(name, player.x, player.y + 0.05, CONFIG.runnerZ)
    const offs = [
      on('coin', () => burst('coin', player.x, 1.0, CONFIG.runnerZ - 0.2)),
      on('land', ({ hard }) => atFeet(hard ? 'dustHard' : 'dust')),
      on('slide', () => atFeet('slide')),
      on('stumble', () => burst('stumble', player.x, player.y + 0.8, CONFIG.runnerZ - 0.3)),
      on('crash', () => burst('crash', player.x, player.y + 0.8, CONFIG.runnerZ - 0.4)),
      // A fresh run starts clean.
      on('runStart', () => pool.life.fill(0)),
    ]
    // Returning to the menu (quit after a crash or from pause) clears leftovers too;
    // otherwise frozen crash shards stayed around the idle character.
    const offPhase = useGameStore.subscribe((s, prev) => {
      if (s.phase === 'start' && prev.phase !== 'start') pool.life.fill(0)
    })
    return () => {
      offs.forEach((off) => off())
      offPhase()
    }
  }, [pool, color])

  useFrame((_, delta) => {
    const m = mesh.current
    if (!m) return
    // Freeze with the world (pause / game over); slow with the death slow-mo.
    const dt = world.running ? Math.min(delta, 0.05) * world.timeScale : 0
    const { pos, vel, life, maxLife, size, gravity } = pool
    for (let i = 0; i < MAX; i++) {
      if (life[i] > 0) {
        life[i] = Math.max(0, life[i] - dt)
        const j = i * 3
        vel[j + 1] -= gravity[i] * dt
        pos[j] += vel[j] * dt
        pos[j + 1] = Math.max(0.02, pos[j + 1] + vel[j + 1] * dt)
        pos[j + 2] += vel[j + 2] * dt + world.dz
        dummy.position.set(pos[j], pos[j + 1], pos[j + 2])
        dummy.rotation.set(life[i] * 9, life[i] * 7, 0)
        // Shrink to nothing over the last part of its life (no transparency needed).
        dummy.scale.setScalar(size[i] * Math.min(1, (life[i] / maxLife[i]) * 2.5))
      } else {
        dummy.scale.setScalar(0)
      }
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
    }
    m.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={mesh} name="particles" args={[undefined, undefined, MAX]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  )
}
