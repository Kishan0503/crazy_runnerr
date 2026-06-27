import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useAnimations, useFBX, useGLTF } from '@react-three/drei'
import { Group, LoopOnce, LoopRepeat, MathUtils, Mesh, MeshStandardMaterial, SkinnedMesh, Vector3 } from 'three'
import type { AnimationClip } from 'three'
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js'
import { CONFIG, PLAYER_SIZE } from '../game/config'
import { inputBus } from '../game/input'
import { applyIntent, stepPlayer } from '../game/player'
import { player } from '../game/playerState'
import { world } from '../game/world'
import { useGameStore } from '../game/store'
import { MODELS } from '../game/modelRegistry'
import { ModelBoundary } from './Model'

/** External Mixamo clips (same mixamorig* skeleton as player.glb, so they bind
 *  by bone name with no retargeting). Renamed on import to stable slot names. */
const IDLE_FBX = '/idle.fbx'
const TURN_FBX = '/running_turn_180.fbx'
useFBX.preload(IDLE_FBX)
useFBX.preload(TURN_FBX)

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
        {/* Show NOTHING while the model loads — no placeholder flash. The capsule
            placeholder is kept only as the error fallback for a genuinely
            missing/broken asset (ModelBoundary), not for the normal load. */}
        <Suspense fallback={null}>
          <ModelBoundary fallback={<PlayerPlaceholder />}>
            <PlayerModel onMode={(m) => (animMode.current = m)} />
          </ModelBoundary>
        </Suspense>
      </group>
    </group>
  )
}

/** Match clip names loosely so any reasonable rig naming works (§9.3). The two
 *  imported FBX clips are bound to fixed names (idle180 / turn180) on import. */
function matchClips(names: string[]) {
  const find = (...keys: string[]) =>
    names.find((n) => keys.some((k) => n.toLowerCase().includes(k)))
  return {
    run: find('run', 'sprint', 'jog'),
    jump: find('jump', 'leap'),
    slide: find('slide', 'roll', 'duck', 'crouch'),
    // Prefer the new start-screen idle FBX; fall back to the glb's own idle.
    idle: find('idle180') ?? find('idle', 'stand', 'tpose'),
    turn: find('turn180'),
  }
}

/**
 * Lowest deformed vertex of a skinned model, in WORLD space.
 *
 * Box3.setFromObject reads bind-pose geometry (origin-centred here, so it floats
 * the model); a y=0 reset sinks it because the glb's own root node carries an
 * offset. The reliable answer is the live skinned pose: read each vertex with
 * skinning applied and take it to world. The caller then nudges the group down by
 * this world y once, seating the feet on the world ground plane (y=0). Measuring
 * in WORLD (not group-local) keeps the correction stable — re-measuring after the
 * nudge yields ~0, so it converges instead of running away.
 */
const _v = new Vector3()
function deformedWorldMinY(group: Group): number | null {
  let minY = Infinity
  group.updateWorldMatrix(true, true)
  group.traverse((o) => {
    const sk = o as SkinnedMesh
    if (!sk.isSkinnedMesh) return
    const pos = sk.geometry.getAttribute('position')
    for (let i = 0; i < pos.count; i++) {
      sk.getVertexPosition(i, _v) // skinned (deformed) vertex, in sk-local space
      sk.localToWorld(_v) // → world
      if (_v.y < minY) minY = _v.y
    }
  })
  return Number.isFinite(minY) ? minY : null
}

/**
 * Loads player.glb plus the two external Mixamo clips (idle + 180° turn) and
 * drives them via useAnimations, cross-fading on state changes.
 *
 * Start-screen choreography (new):
 *   - start phase  → play the imported IDLE clip; the model FACES THE CAMERA
 *     (Y rotated 180° off the run-facing) so the player sees the character's face.
 *   - Play Now     → play TURN180 once while smoothly rotating the model Y from
 *     face-camera back to face-track over the clip's length; the instant the turn
 *     completes, cross-fade into RUN and fire start() so the world begins (§ intro).
 *   - playing      → run / jump / slide, facing down the track.
 *
 * The turn rotation is synced on the node (face-camera → face-track) so the final
 * facing is correct regardless of any root motion baked into the clip.
 */
function PlayerModel({ onMode }: { onMode: (mode: AnimMode) => void }) {
  const { url, scale, rotationY = 0, tint } = MODELS.player
  const { scene, animations } = useGLTF(url)
  const idleFbx = useFBX(IDLE_FBX)
  const turnFbx = useFBX(TURN_FBX)
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

  // Merge the glb clips with the imported FBX clips, renamed to stable slot
  // names. Their tracks target mixamorig* bones — the same names as player.glb's
  // skeleton — so useAnimations binds them with no retargeting.
  const allClips = useMemo<AnimationClip[]>(() => {
    const out: AnimationClip[] = [...animations]
    const idleClip = idleFbx.animations[0]
    if (idleClip) {
      const c = idleClip.clone()
      c.name = 'idle180'
      out.push(c)
    }
    const turnClip = turnFbx.animations[0]
    if (turnClip) {
      const c = turnClip.clone()
      c.name = 'turn180'
      out.push(c)
    }
    return out
  }, [animations, idleFbx, turnFbx])

  const { actions, names } = useAnimations(allClips, ref)
  const hasClips = allClips.length > 0
  const clips = useMemo(() => matchClips(names), [names])
  const current = useRef('')

  // Facing: the run pose faces down the track (the model's authored rotationY).
  // The start-screen idle faces the camera — a half-turn off that.
  const faceTrack = rotationY
  const faceCamera = rotationY - Math.PI
  const yaw = useRef(faceCamera) // boots on the start screen, facing the player
  const turning = useRef(false) // mid 180° turn (after Play Now)
  const groundFrames = useRef(0) // frames left to re-seat feet on the ground

  useEffect(() => {
    onMode(hasClips ? 'clips' : 'procedural')
  }, [hasClips, onMode])

  // Reset transform, hide the model, and arm the ground snap. We keep the model
  // INVISIBLE until it has been posed by the mixer and seated on the ground, so
  // the user never sees the bind-pose / pre-ground flash — see the snap in
  // useFrame, which flips visibility on once the feet are grounded.
  useLayoutEffect(() => {
    const g = ref.current
    if (!g) return
    g.visible = false
    g.rotation.y = yaw.current
    g.position.y = 0
    groundFrames.current = 12 // re-snap for the first frames, after the clip poses
  }, [object, scale, rotationY])

  // Cross-fade between clips and drive the start-screen turn choreography.
  useFrame((_, delta) => {
    if (!hasClips) return
    const dt = Math.min(delta, 0.05)
    const s = player
    const phase = useGameStore.getState().phase
    const starting = useGameStore.getState().starting

    // ---- Decide the desired clip ----
    let want: string | undefined
    if (world.running) {
      // Live run: full gameplay set, facing the track.
      want = clips.run ?? clips.idle ?? names[0]
      if (!s.grounded && clips.jump) want = clips.jump
      else if (s.sliding && clips.slide) want = clips.slide
      turning.current = false
    } else if (starting && phase === 'start') {
      // Play Now pressed: run the 180° turn once, then hand off to run + start().
      if (clips.turn) {
        want = clips.turn
        turning.current = true
      } else {
        // No turn clip available — skip straight to the run and begin.
        want = clips.run ?? names[0]
        useGameStore.getState().start()
      }
    } else {
      // Start screen idle (facing the camera) and any other frozen state.
      want = clips.idle ?? clips.run ?? names[0]
      turning.current = false
    }

    if (want && want !== current.current) {
      const next = actions[want]
      if (next) {
        const once = want === clips.jump || want === clips.slide || want === clips.turn
        next.setLoop(once ? LoopOnce : LoopRepeat, Infinity)
        next.clampWhenFinished = once
        next.reset().fadeIn(0.15).play()
      }
      if (current.current) actions[current.current]?.fadeOut(0.15)
      current.current = want
    }

    // ---- Facing ----
    if (turning.current && clips.turn) {
      // Drive yaw from the turn clip's own progress so the body visually rotates
      // in lock-step with the animation, landing exactly at face-track.
      const action = actions[clips.turn]
      const dur = action?.getClip().duration ?? 0.667
      const t = action ? Math.min(1, action.time / dur) : 1
      yaw.current = MathUtils.lerp(faceCamera, faceTrack, t)
      if (t >= 1) {
        // Turn finished → blend into run and start the world (idempotent).
        yaw.current = faceTrack
        turning.current = false
        useGameStore.getState().start()
      }
    } else {
      // Snap toward the correct facing for the current state (eased).
      const target = world.running ? faceTrack : faceCamera
      yaw.current = MathUtils.damp(yaw.current, target, 14, dt)
    }
    const g = ref.current
    if (!g) return
    g.rotation.y = yaw.current

    // Seat the feet on the world ground plane using the LIVE skinned pose (the
    // glb root has an offset, so y=0 alone sinks it). Only while frozen on the
    // start screen — never mid-run, where the feet legitimately rise/fall — and
    // only for the first frames after (re)mount, once the mixer has posed the
    // rig. World-space measure converges (post-nudge it re-reads ~0). 30k verts,
    // so this is intentionally short-lived, not a per-frame cost.
    if (groundFrames.current > 0 && !world.running) {
      const worldMinY = deformedWorldMinY(g)
      if (worldMinY != null) {
        g.position.y -= worldMinY
        // Posed AND grounded now — safe to reveal (no bind-pose flash).
        g.visible = true
      }
      groundFrames.current--
    } else if (!g.visible) {
      // If the run started before the snap ran (e.g. autoplay), reveal anyway.
      g.visible = true
    }
  })

  const s3: [number, number, number] = Array.isArray(scale) ? scale : [scale, scale, scale]
  return (
    <group ref={ref} scale={s3}>
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
