import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useAnimations, useGLTF } from '@react-three/drei'
import { Box3, Group, LoopOnce, LoopRepeat, MathUtils, Mesh, MeshStandardMaterial } from 'three'
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js'
import { CONFIG, PLAYER_SIZE } from '../game/config'
import { inputBus } from '../game/input'
import { applyIntent, stepPlayer } from '../game/player'
import { player } from '../game/playerState'
import { world } from '../game/world'
import { MODELS } from '../game/modelRegistry'
import { ModelBoundary } from './Model'

type AnimMode = 'procedural' | 'clips'

// Procedural animation tuning (whole-body, since the model has no skeleton).
const RUN_FREQ = 9 // stride cadence (rad/s)
const RUN_BOUNCE = 0.09 // hop height
const RUN_LEAN = -0.12 // forward pitch while running
const JUMP_TUCK = -0.22 // forward tuck on the way up
const JUMP_OPEN = 0.06 // open up on descent
const SLIDE_LEAN = 0.5 // lean back while sliding
const BANK = 0.05 // roll per unit lateral velocity (lean into lane changes)
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

/**
 * The player rig (PRD §8.3, §9.3). Three nested transforms keep concerns clean:
 *   - outer: lane x, jump y, and the LOGICAL slide squash (drives collision height)
 *   - anim:  procedural pose (run bounce/lean, jump tuck, slide lean-back, lane bank)
 *   - model: the .glb (or capsule placeholder), scaled/grounded/faced
 *
 * The model (Charachter.glb) is a single static mesh with no clips, so we sell
 * running/jumping/sliding via whole-body procedural motion. If a RIGGED model
 * with run/jump/slide clips is dropped in later, PlayerModel detects the clips,
 * plays them via useAnimations, and switches this to 'clips' mode — turning the
 * procedural body motion off so the skeleton drives the limbs instead (§9.3).
 */
export function Player() {
  const outer = useRef<Group>(null)
  const anim = useRef<Group>(null)
  const animMode = useRef<AnimMode>('procedural')
  const prevX = useRef(player.x)

  useFrame((_, delta) => {
    if (!world.running) return
    const dt = Math.min(delta, 0.05) // clamp so a tab refocus can't teleport (§8.3)
    const s = player

    for (const intent of inputBus.drain()) applyIntent(s, intent)
    stepPlayer(s, dt)

    const proc = animMode.current === 'procedural'

    const o = outer.current
    if (o) {
      o.position.x = s.x
      o.position.y = s.y
      // Visual squash only in procedural mode; clips pose the crouch themselves.
      // The LOGICAL slide height (s.scaleY) still drives collision either way.
      o.scale.y = proc ? s.scaleY : 1
    }

    // Lateral velocity → bank/lean into lane switches (both modes; subtle).
    const dx = s.x - prevX.current
    prevX.current = s.x
    const latVel = dt > 0 ? dx / dt : 0
    const rollTarget = clamp(-latVel * BANK, -0.45, 0.45)

    const a = anim.current
    if (!a) return

    if (!proc) {
      // Clips drive the body; just keep a gentle bank and reset everything else.
      a.rotation.x = MathUtils.damp(a.rotation.x, 0, 12, dt)
      a.rotation.z = MathUtils.damp(a.rotation.z, rollTarget, 10, dt)
      a.rotation.y = MathUtils.damp(a.rotation.y, 0, 12, dt)
      a.position.y = MathUtils.damp(a.position.y, 0, 14, dt)
      a.scale.y = MathUtils.damp(a.scale.y, 1, 14, dt)
      return
    }

    // ---- Procedural pose ----
    let pitch = 0
    let bounce = 0
    let squashY = 1
    let yaw = 0

    if (s.sliding) {
      pitch = SLIDE_LEAN // lean back into the slide (atop the outer squash)
    } else if (!s.grounded) {
      pitch = s.vy > 0 ? JUMP_TUCK : JUMP_OPEN // tuck up, open on the way down
    } else {
      // Running: bouncy two-step with a forward lean + footfall squash.
      const stride = Math.abs(Math.sin(s.runTime * RUN_FREQ))
      bounce = stride * RUN_BOUNCE
      squashY = 1 - (1 - stride) * 0.06 // squash at footfall, stretch at apex
      pitch = RUN_LEAN + Math.sin(s.runTime * RUN_FREQ * 2) * 0.03
      yaw = Math.sin(s.runTime * RUN_FREQ) * 0.04 // tiny torso sway
    }

    a.rotation.x = MathUtils.damp(a.rotation.x, pitch, 12, dt)
    a.rotation.z = MathUtils.damp(a.rotation.z, rollTarget, 10, dt)
    a.rotation.y = MathUtils.damp(a.rotation.y, yaw, 12, dt)
    a.position.y = MathUtils.damp(a.position.y, bounce, 16, dt)
    a.scale.y = MathUtils.damp(a.scale.y, squashY, 16, dt)
  })

  return (
    <group ref={outer} position={[CONFIG.lanes[1], 0, CONFIG.runnerZ]}>
      <group ref={anim}>
        <Suspense fallback={<PlayerPlaceholder />}>
          <ModelBoundary fallback={<PlayerPlaceholder />}>
            <PlayerModel onMode={(m) => (animMode.current = m)} />
          </ModelBoundary>
        </Suspense>
      </group>
    </group>
  )
}

/** Match clip names loosely so any reasonable rig naming works (§9.3). */
function matchClips(names: string[]) {
  const find = (...keys: string[]) =>
    names.find((n) => keys.some((k) => n.toLowerCase().includes(k)))
  return {
    run: find('run', 'sprint', 'jog'),
    jump: find('jump', 'leap'),
    slide: find('slide', 'roll', 'duck', 'crouch'),
    idle: find('idle', 'stand', 'tpose'),
  }
}

/**
 * Loads player.glb, tints/grounds/scales it, and — if it ships with animation
 * clips — plays run/jump/slide via useAnimations, cross-fading on state changes.
 * Reports its mode up so the rig knows whether to run procedural body motion.
 */
function PlayerModel({ onMode }: { onMode: (mode: AnimMode) => void }) {
  const { url, scale, rotationY = 0, tint } = MODELS.player
  const { scene, animations } = useGLTF(url)
  const ref = useRef<Group>(null)

  // Clone (SkeletonUtils preserves skinning, so a future rigged model works).
  const object = useMemo(() => {
    const c = cloneSkeleton(scene)
    c.traverse((o) => {
      const mesh = o as Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      const mat = (mesh.material as MeshStandardMaterial).clone()
      if (tint) mat.color.set(tint)
      mesh.material = mat
    })
    return c
  }, [scene, tint])

  const { actions, names } = useAnimations(animations, ref)
  const hasClips = animations.length > 0
  const clips = useMemo(() => matchClips(names), [names])
  const current = useRef('')

  useEffect(() => {
    onMode(hasClips ? 'clips' : 'procedural')
  }, [hasClips, onMode])

  // Drop the model's base to the ground (its origin is centered, §9.3).
  useLayoutEffect(() => {
    const g = ref.current
    if (!g) return
    g.position.y = 0
    g.updateWorldMatrix(true, true)
    const box = new Box3().setFromObject(g)
    g.position.y = -box.min.y
  }, [object, scale, rotationY])

  // Cross-fade clips based on the player's live state. Idle while the world is
  // frozen (start screen + the Play Now exit transition); only once the run is
  // actually live do we switch to Run/Jump/Slide. Run/idle loop; jump and slide
  // play once and hold their last frame until the state changes back.
  useFrame(() => {
    if (!hasClips) return
    const s = player
    let want = clips.idle ?? clips.run ?? names[0]
    if (world.running) {
      want = clips.run ?? clips.idle ?? names[0]
      if (!s.grounded && clips.jump) want = clips.jump
      else if (s.sliding && clips.slide) want = clips.slide
    }
    if (want && want !== current.current) {
      const next = actions[want]
      if (next) {
        const once = want === clips.jump || want === clips.slide
        next.setLoop(once ? LoopOnce : LoopRepeat, Infinity)
        next.clampWhenFinished = once
        next.reset().fadeIn(0.18).play()
      }
      if (current.current) actions[current.current]?.fadeOut(0.18)
      current.current = want
    }
  })

  const s3: [number, number, number] = Array.isArray(scale) ? scale : [scale, scale, scale]
  return (
    <group ref={ref} scale={s3} rotation={[0, rotationY, 0]}>
      <primitive object={object} />
    </group>
  )
}

/**
 * White "blob-man" placeholder (a nod to Character.png), shown while player.glb
 * loads or if it's missing (PRD §8.5). Built from primitives, feet at y=0.
 * The procedural rig animates it just like the model.
 */
function PlayerPlaceholder() {
  const h = PLAYER_SIZE.height
  const bodyRadius = 0.3
  const bodyLen = Math.max(0.1, h - bodyRadius * 2 - 0.34)
  const bodyCenterY = bodyLen / 2 + bodyRadius
  const headRadius = 0.34
  const headCenterY = bodyCenterY + bodyLen / 2 + headRadius * 0.55

  return (
    <group>
      <mesh position={[0, bodyCenterY, 0]} castShadow>
        <capsuleGeometry args={[bodyRadius, bodyLen, 8, 16]} />
        <meshStandardMaterial color="#f2f4f8" roughness={0.45} metalness={0.05} />
      </mesh>
      <mesh position={[0, headCenterY, 0]} castShadow>
        <sphereGeometry args={[headRadius, 24, 24]} />
        <meshStandardMaterial color="#f6f8fb" roughness={0.4} metalness={0.05} />
      </mesh>
      {[-0.12, 0.12].map((x) => (
        <mesh key={x} position={[x, headCenterY + 0.03, -headRadius * 0.9]}>
          <sphereGeometry args={[0.05, 12, 12]} />
          <meshStandardMaterial color="#10131c" roughness={0.5} />
        </mesh>
      ))}
    </group>
  )
}
