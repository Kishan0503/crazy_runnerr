import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useAnimations, useGLTF } from '@react-three/drei'
import { Box3, Group, LoopOnce, LoopRepeat, MathUtils, Mesh, SkinnedMesh, Vector3 } from 'three'
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js'
import { CONFIG, PLAYER_SIZE } from '../game/config'
import { inputBus } from '../game/input'
import { applyIntent, stepPlayer } from '../game/player'
import { player } from '../game/playerState'
import { speedMultiplierAt } from '../game/speed'
import { world } from '../game/world'
import { useGameStore } from '../game/store'
import { useCharacterStore } from '../game/characterStore'
import { stripRootMotion } from '../game/animation'
import { LIBRARY_URL, hipsAnimY, mergeLibraryClips, nodeNames } from '../game/animationLibrary'
import { emit } from '../game/events'
import { fx, nowSec } from '../game/fxState'
import type { PlayerRuntime } from '../game/types'
import { createHeightSampler } from '../game/stableHeight'
import { SOLE_GAP, feetWorldY } from './rigFit'
import { ModelBoundary } from './Model'

/**
 * Facing offset applied to the model node so it faces DOWN THE TRACK (−Z) during
 * the run. Characters built through our pipeline share the same authored facing,
 * so this is one constant; the start-screen idle faces the camera (this + π).
 * Tune once if a character imports backwards.
 */
const BASE_FACING = Math.PI
/** Used only if the equipped character has no model_url yet. */
const FALLBACK_MODEL = '/models/player.glb'

type AnimMode = 'procedural' | 'clips'

// Procedural animation tuning (whole-body, since the model has no skeleton).
const RUN_FREQ = 9 // stride cadence (rad/s)
const RUN_BOUNCE = 0.09 // hop height
const RUN_LEAN = -0.12 // forward pitch while running
const JUMP_TUCK = -0.22 // forward tuck on the way up
const JUMP_OPEN = 0.06 // open up on descent
const SLIDE_LEAN = 0.5 // lean back while sliding
const BANK = 0.05 // roll per unit lateral velocity (lean into lane changes)
const STUMBLE_TIME = 0.35 // seconds of wobble after a stumble
const STUMBLE_ROLL = 0.35 // peak wobble roll (rad)
const STUMBLE_HOP = 0.22 // little hop height during the wobble
// Clip blending: normal state changes vs the "instant" ones (cancel / fast-fall).
const FADE = 0.15
const FADE_FAST = 0.08
/** Seconds the stumble clip overrides the run (the 1.2 s clip is sped up to fit). */
const STUMBLE_CLIP_TIME = 0.7
/** Seconds on the Game Over screen before a new-best celebration starts. */
const CELEBRATE_DELAY = 1.8
/** Seconds per ground-contact window (≈ one run cycle). */
const GROUND_WINDOW = 0.5
type Snapshot = ReturnType<typeof snapshot>
function snapshot(s: PlayerRuntime) {
  return {
    jumpSeq: s.jumpSeq,
    slideSeq: s.slideSeq,
    grounded: s.grounded,
    fastFalling: s.fastFalling,
    lane: s.lane,
    stumbleSeq: s.stumbleSeq,
  }
}

/**
 * Turn this frame's player state changes into feedback events (sound, dust,
 * shake…). Also records when each lane was left, for late-dodge near misses.
 * A lane change caused by a stumble bounce-back is not a player move.
 */
function emitPlayerEvents(s: PlayerRuntime, prev: Snapshot) {
  if (s.jumpSeq !== prev.jumpSeq) emit('jump', { buffered: !prev.grounded })
  if (s.slideSeq !== prev.slideSeq) emit('slide')
  if (s.fastFalling && !prev.fastFalling) emit('fastFall')
  if (s.grounded && !prev.grounded) emit('land', { hard: prev.fastFalling })
  if (s.lane !== prev.lane) {
    fx.laneLeftAt[prev.lane] = nowSec()
    const bounced = s.stumbleSeq !== prev.stumbleSeq
    if (!bounced) emit('laneChange', { dir: s.lane > prev.lane ? 1 : -1 })
  }
  Object.assign(prev, snapshot(s))
}

/** Expected air time of the current jump. Height (v²/2g) is speed-independent,
 *  so air time follows from the gravity locked in at take-off: T = 2·√(2H/g).
 *  Read live (not cached) so tuning-panel changes apply immediately. */
function jumpAirTime(jumpGravity: number) {
  const height = CONFIG.jumpVelocity ** 2 / (2 * CONFIG.gravity)
  return 2 * Math.sqrt((2 * height) / jumpGravity)
}
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
  const lastStumble = useRef(player.stumbleSeq)
  const lastRun = useRef(world.runId)
  // Last frame's player state, to turn changes into feedback events.
  const seen = useRef(snapshot(player))
  const wobble = useRef(0) // seconds left in the stumble wobble
  // The equipped character's model URL. Used to KEY PlayerModel so a character
  // swap forces a clean remount (fresh skeleton, fresh useAnimations mixer, fresh
  // auto-fit) — the same thing that makes the picker preview reliable. Without
  // the key, the old mixer/refs persisted across the swap and the new character
  // froze in bind pose (no clips playing, un-normalized size).
  const modelUrl = useCharacterStore((s) => s.activeCharacter()?.model_url) ?? FALLBACK_MODEL
  // Until the catalog/equip state has loaded, activeId is just the optimistic
  // default ('runner'); rendering it would flash the wrong character before the
  // real equipped one resolves. Hold the model until then.
  const charLoaded = useCharacterStore((s) => s.loaded)

  useFrame((_, delta) => {
    if (!world.running) {
      // Frozen (start screen, pause, game over): no simulation, but keep the
      // model glued to the player STATE. Quitting to the menu resets that state
      // to the middle lane — without this sync the model stayed where it crashed.
      const o = outer.current
      if (o) {
        o.position.x = player.x
        // After a mid-air crash, settle the fallen body onto the ground (visual only).
        o.position.y =
          useGameStore.getState().phase === 'gameover'
            ? MathUtils.damp(o.position.y, 0, 10, Math.min(delta, 0.05))
            : player.y
        o.rotation.z = 0
        o.scale.y = animMode.current === 'procedural' ? player.scaleY : 1
      }
      wobble.current = 0
      // Back on the start screen: also drop any leftover procedural pose.
      const a = anim.current
      if (a && useGameStore.getState().phase === 'start') {
        a.rotation.set(0, 0, 0)
        a.position.y = 0
        a.scale.y = 1
      }
      return
    }
    // Clamp so a tab refocus can't teleport (§8.3); scale for the death slow-mo.
    const dt = Math.min(delta, 0.05) * world.timeScale
    const s = player
    const speedMult = speedMultiplierAt(world.distance)

    for (const intent of inputBus.drain()) applyIntent(s, intent, speedMult)
    stepPlayer(s, dt, speedMult)

    // A fresh run resets the player's counters to 0 — resync our trackers.
    if (world.runId !== lastRun.current) {
      lastRun.current = world.runId
      lastStumble.current = s.stumbleSeq
      wobble.current = 0
      Object.assign(seen.current, snapshot(s))
    }
    emitPlayerEvents(s, seen.current)

    // Stumble feedback: a short wobble + hop, restarted on each new stumble.
    if (s.stumbleSeq !== lastStumble.current) {
      lastStumble.current = s.stumbleSeq
      // Clip characters play a real stumble animation; the wobble is only for
      // the procedural fallback model.
      wobble.current = animMode.current === 'procedural' ? STUMBLE_TIME : 0
    }
    let wobbleRoll = 0
    let wobbleHop = 0
    if (wobble.current > 0) {
      wobble.current = Math.max(0, wobble.current - dt)
      const p = 1 - wobble.current / STUMBLE_TIME // 0 → 1
      wobbleRoll = Math.sin(p * Math.PI * 4) * STUMBLE_ROLL * (1 - p)
      wobbleHop = Math.sin(p * Math.PI) * STUMBLE_HOP
    }

    // Visual-only offsets go on the outer group, which is set absolutely each
    // frame (no easing feedback). Collision reads `player`, never this mesh.

    const proc = animMode.current === 'procedural'

    const o = outer.current
    if (o) {
      o.position.x = s.x
      o.position.y = s.y + wobbleHop
      o.rotation.z = wobbleRoll
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
    } else if (s.fastFalling) {
      pitch = JUMP_TUCK * 1.6 // hard forward tuck while slamming down
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
    <group ref={outer} name="player-rig" position={[CONFIG.lanes[1], 0, CONFIG.runnerZ]}>
      <group ref={anim}>
        {/* Show NOTHING while the model loads — no placeholder flash. The capsule
            placeholder is kept only as the error fallback for a genuinely
            missing/broken asset (ModelBoundary), not for the normal load. */}
        <Suspense fallback={null}>
          <ModelBoundary fallback={<PlayerPlaceholder />}>
            {charLoaded && (
              <PlayerModel key={modelUrl} url={modelUrl} onMode={(m) => (animMode.current = m)} />
            )}
          </ModelBoundary>
        </Suspense>
      </group>
    </group>
  )
}

/** Match clip names loosely so any reasonable rig naming works (§9.3). Each
 *  character glb is expected to bake all five clips named exactly idle/run/
 *  jump/slide/turn180 (see character-asset pipeline), but matching is
 *  substring-based so small naming drift doesn't hard-break a character. */
function matchClips(names: string[]) {
  const find = (...keys: string[]) =>
    names.find((n) => keys.some((k) => n.toLowerCase().includes(k)))
  const turn = find('turn180', 'turn')
  if (!turn && names.length > 0) {
    // A loaded character with no turn clip silently skips the intro turn —
    // surface it instead of leaving it to look like a random one-off bug.
    console.warn('[Player] no turn180 clip found among:', names)
  }
  return {
    run: find('run', 'sprint', 'jog'),
    jump: find('jump', 'leap'),
    slide: find('slide', 'roll', 'duck', 'crouch'),
    // Shared-library clips (Phase 3).
    stumble: find('stumble'),
    fall: find('fall'),
    celebrate: find('celebrate'),
    idle: find('idle', 'stand', 'tpose'),
    turn,
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
/**
 * World-space bounding box of a skinned model under its CURRENT animated pose.
 *
 * Box3.setFromObject reads bind-pose geometry; we need the LIVE skinned pose, so
 * we walk the skinned vertices with getVertexPosition. Critically we call
 * skeleton.update() first — otherwise the bone matrices are stale and the box is
 * wrong (this was silently breaking the auto-fit). Returns null if no skinned
 * mesh / empty.
 */
const _v = new Vector3()
const _box = new Box3()
function posedWorldBox(group: Group): Box3 | null {
  _box.makeEmpty()
  group.updateWorldMatrix(true, true)
  group.traverse((o) => {
    const sk = o as SkinnedMesh
    if (!sk.isSkinnedMesh) return
    sk.skeleton.update() // refresh bone matrices so the pose is current
    const pos = sk.geometry.getAttribute('position')
    for (let i = 0; i < pos.count; i++) {
      sk.getVertexPosition(i, _v)
      sk.localToWorld(_v)
      _box.expandByPoint(_v)
    }
  })
  return _box.isEmpty() ? null : _box
}

/** Target rendered height (units) for the in-game character. Slightly TALLER than
 *  the 1.4 logical hitbox so the runner reads clearly on the dark track / start
 *  screen (the small visual overhang past the collision box is unnoticeable).
 *  This is VISUAL ONLY — collisions use PLAYER_SIZE/runnerHeight, unchanged — so
 *  difficulty is identical regardless of this value. */
const GAME_TARGET_H = 1.7

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
function PlayerModel({ url, onMode }: { url: string; onMode: (mode: AnimMode) => void }) {
  // Catalog-driven: `url` is the EQUIPPED character's model_url (passed from
  // Player, which also keys this component on it → clean remount per character).
  // Each character glb bakes all five clips (idle/run/jump/slide/turn180), so
  // there's no runtime FBX merge any more.
  const modelScale = useCharacterStore((s) => s.activeCharacter()?.model_scale) ?? 1
  const { scene, animations } = useGLTF(url)
  const ref = useRef<Group>(null)

  // Clone (SkeletonUtils preserves skinning). The model keeps its own baked
  // textures/materials — no tinting.
  const object = useMemo(() => {
    const c = cloneSkeleton(scene)
    c.traverse((o) => {
      const mesh = o as Mesh
      if (mesh.isMesh) mesh.castShadow = true
    })
    return c
  }, [scene])

  // Shared library clips (stumble / fall / celebrate / turn180 / land) are merged
  // in and retargeted to this character's size (Phase 3). Then every clip plays
  // in place: forward travel comes from the scrolling world, so root motion baked
  // into a clip (the default Runner's jump/slide) is removed.
  const library = useGLTF(LIBRARY_URL).animations
  const inPlace = useMemo(
    () => stripRootMotion(mergeLibraryClips(animations, library, hipsAnimY(animations, scene), nodeNames(scene))),
    [animations, library, scene],
  )
  const { actions, names, mixer } = useAnimations(inPlace, ref)
  const hasClips = animations.length > 0
  const clips = useMemo(() => matchClips(names), [names])
  const current = useRef('')
  // Last seen jump/slide counters (per run) — detect a NEW action of the same kind.
  const seq = useRef({ run: world.runId, jump: player.jumpSeq, slide: player.slideSeq, stumble: player.stumbleSeq })
  // Seconds left on the stumble clip (it overrides the run while > 0).
  const stumbleLeft = useRef(0)
  // Seconds spent on the Game Over screen (celebrate kicks in after a beat).
  const overTime = useRef(0)

  const rotationY = BASE_FACING
  // Facing: run faces down the track (−Z); the start-screen idle faces the camera.
  const faceTrack = rotationY
  const faceCamera = rotationY - Math.PI
  const yaw = useRef(faceCamera) // boots on the start screen, facing the player
  const turning = useRef(false) // mid 180° turn (after Play Now)
  const groundFrames = useRef(0) // frames left to re-seat feet on the ground
  const normalized = useRef(false) // size auto-normalized for this model yet?
  const heightSample = useRef(createHeightSampler(0.03, 3))
  const grounded = useRef(false) // feet seated at least once for this model
  // Rolling lowest-foot window for the self-healing ground contact (end of useFrame).
  const runCal = useRef({ time: 0, minFeet: Infinity })

  useEffect(() => {
    onMode(hasClips ? 'clips' : 'procedural')
  }, [hasClips, onMode])

  // Reset transform, hide the model, and arm the auto-fit. The model stays
  // INVISIBLE until it's been size-normalized AND grounded, so the user never
  // sees a wrong-scale / pre-ground flash. On a character switch (object change)
  // we reset scale to 1 and re-run the fit — see the useFrame block below.
  useLayoutEffect(() => {
    const g = ref.current
    if (!g) return
    g.visible = false
    g.scale.setScalar(1)
    g.rotation.y = yaw.current
    g.position.y = 0
    normalized.current = false
    heightSample.current = createHeightSampler(0.03, 3)
    grounded.current = false
    groundFrames.current = 16
  }, [object, modelScale])

  // Cross-fade between clips and drive the start-screen turn choreography.
  useFrame((_, delta) => {
    if (!hasClips) return
    const dt = Math.min(delta, 0.05)
    // Animations slow down with the world during the death slow-mo.
    mixer.timeScale = world.timeScale
    const s = player
    const phase = useGameStore.getState().phase
    const starting = useGameStore.getState().starting

    // ---- Decide the desired clip ----
    if (world.runId !== seq.current.run) {
      seq.current = { run: world.runId, jump: s.jumpSeq, slide: s.slideSeq, stumble: s.stumbleSeq }
      stumbleLeft.current = 0
    }
    overTime.current = phase === 'gameover' ? overTime.current + dt : 0
    const celebrating =
      phase === 'gameover' && useGameStore.getState().newBest && !!clips.celebrate && overTime.current > CELEBRATE_DELAY

    let want: string | undefined
    if (phase === 'dying' || phase === 'gameover') {
      // Crash: fall and stay down — or, on a new best, get up and celebrate.
      want = celebrating ? clips.celebrate : (clips.fall ?? current.current)
      turning.current = false
    } else if (world.running) {
      // Live run: full gameplay set, facing the track.
      want = clips.run ?? clips.idle ?? names[0]
      if (s.stumbleSeq !== seq.current.stumble) {
        seq.current.stumble = s.stumbleSeq
        if (clips.stumble) stumbleLeft.current = STUMBLE_CLIP_TIME
      }
      if (stumbleLeft.current > 0) stumbleLeft.current = Math.max(0, stumbleLeft.current - dt)
      if (!s.grounded && clips.jump) want = clips.jump
      else if (s.sliding && clips.slide) want = clips.slide
      else if (stumbleLeft.current > 0 && clips.stumble) want = clips.stumble
      turning.current = false
    } else if (starting && phase === 'start') {
      // Play Now pressed: run the 180° turn once, then hand off to run + start().
      // Guard on names.length so a not-yet-populated actions map (the first
      // frame or two after mount) can't be mistaken for "no turn clip" and
      // permanently skip the turn for this run.
      if (clips.turn) {
        want = clips.turn
        turning.current = true
      } else if (names.length > 0) {
        // Clips are loaded and genuinely have no turn clip — skip straight to
        // the run and begin.
        want = clips.run ?? names[0]
        useGameStore.getState().start()
      }
    } else {
      // Start screen idle (facing the camera) and any other frozen state.
      want = clips.idle ?? clips.run ?? names[0]
      turning.current = false
    }

    // A new jump/slide must restart its clip even if that clip is already the
    // current one (buffered re-jump on landing, re-pressed slide). Counters reset
    // each run, so resync on a new run id.
    const restart =
      world.running &&
      ((want === clips.jump && s.jumpSeq !== seq.current.jump) ||
        (want === clips.slide && s.slideSeq !== seq.current.slide))
    if (world.running) {
      seq.current.jump = s.jumpSeq
      seq.current.slide = s.slideSeq
    }

    if (want && (want !== current.current || restart)) {
      const next = actions[want]
      // Only commit the switch once the action actually exists — if `actions`
      // hasn't registered this clip yet (possible for a frame or two right
      // after mount), leave current.current alone so we retry next frame
      // instead of silently getting stuck (e.g. mid-turn with time frozen at 0).
      if (next) {
        const once =
          want === clips.jump ||
          want === clips.slide ||
          want === clips.turn ||
          want === clips.fall ||
          want === clips.stumble
        next.setLoop(once ? LoopOnce : LoopRepeat, Infinity)
        next.clampWhenFinished = once
        // jump↔slide (fast-fall, slide-cancel) must read as instant.
        const actionSwap =
          (want === clips.jump && current.current === clips.slide) ||
          (want === clips.slide && current.current === clips.jump)
        const fade = actionSwap || restart ? FADE_FAST : FADE
        next.reset().fadeIn(fade).play()
        if (current.current && current.current !== want) actions[current.current]?.fadeOut(fade)
        current.current = want
      }
    }

    // ---- Clip speed: match animation length to the physics ----
    const active = current.current ? actions[current.current] : undefined
    if (active) {
      const dur = active.getClip().duration
      if (current.current === clips.stumble) {
        active.timeScale = dur / STUMBLE_CLIP_TIME // squeeze the stumble into its window
      } else if (!world.running || current.current === clips.turn || current.current === clips.idle) {
        active.timeScale = 1
      } else if (current.current === clips.jump) {
        // Finish the clip exactly on landing; fast-fall slams it through quickly.
        active.timeScale = (dur / jumpAirTime(s.jumpGravity)) * (s.fastFalling ? 2.5 : 1)
      } else if (current.current === clips.slide) {
        active.timeScale = dur / CONFIG.slideDuration
      } else if (current.current === clips.run) {
        // Legs speed up with the game (≈1.6× at the 2× speed cap).
        active.timeScale = 1 + 0.6 * (speedMultiplierAt(world.distance) - 1)
      }
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
      // Down the track while running / falling; turn to the camera on the start
      // screen and to celebrate a new best.
      const target = (world.running || phase === 'gameover') && !celebrating ? faceTrack : faceCamera
      yaw.current = MathUtils.damp(yaw.current, target, 14, dt)
    }
    const g = ref.current
    if (!g) return
    g.rotation.y = yaw.current

    // ---- Auto-fit (size-normalize + ground) using the LIVE posed bounds ----
    // Characters come in wildly different scales (Rookie ~0.02 units, Runner
    // ~1.9), so we normalize EVERY model to GAME_TARGET_H from its measured posed
    // height; model_scale is only a fine-tune multiplier. Then we seat the feet
    // on y=0. Runs for the first frames after (re)mount; grounding only while
    // frozen (mid-run the feet legitimately rise/fall). Reveal once both are done.
    // One-time normalize (any state — handles an instant Play).
    if (!normalized.current) {
      // Only trust the height once a clip pose is applied and it's stable
      // across frames (the bind pose can be in different units).
      const box = posedWorldBox(g)
      // "Posed" = the current clip has fully faded in (a half-faded clip is
      // still blended with the bind pose).
      const playing = current.current ? actions[current.current] : null
      const posed = mixer.time > 0 && !!playing && playing.getEffectiveWeight() > 0.99
      const h = heightSample.current(box ? box.max.y - box.min.y : 0, posed)
      if (h !== null) {
        const s = (GAME_TARGET_H / h) * modelScale
        g.scale.setScalar(s)
        normalized.current = true
      }
    }
    // Ground on the FOOT BONES (not the skinned mesh box, which can briefly be
    // the raw origin-centred geometry and used to float the model by half its
    // height). Absolute, so a single odd frame can't accumulate. Done right
    // after normalizing — even mid-run — then refined on the start screen.
    if (normalized.current && ((!world.running && groundFrames.current > 0) || !grounded.current)) {
      const feet = feetWorldY(g)
      if (feet !== null) {
        const originY = g.parent ? g.parent.getWorldPosition(_v).y : 0
        g.position.y += SOLE_GAP - (feet - originY)
        grounded.current = true
      }
      if (!world.running) groundFrames.current--
      g.visible = true
    }

    // Self-healing ground contact: whenever the character is standing (start
    // screen idle) or running on the ground, track the lowest foot over a
    // ~half-second window and snap it back onto the floor if it drifted more
    // than 1 cm. Physics assume feet on the floor while running, so this is the
    // true reference — and any offset (a pose-dependent fit, a model reset
    // mid-run) is corrected within one window. Jumps, slides, the fall and the
    // celebration are never adjusted.
    const cal = runCal.current
    const standing =
      (world.running && phase === 'playing' && s.grounded && !s.sliding) || (phase === 'start' && !turning.current)
    if (normalized.current && standing) {
      const feet = feetWorldY(g)
      if (feet !== null) {
        const originY = g.parent ? g.parent.getWorldPosition(_v).y : 0
        cal.minFeet = Math.min(cal.minFeet, feet - originY)
      }
      cal.time += dt
      if (cal.time >= GROUND_WINDOW) {
        const error = SOLE_GAP - cal.minFeet
        if (Number.isFinite(error) && Math.abs(error) > 0.01) g.position.y += error
        cal.time = 0
        cal.minFeet = Infinity
      }
    } else {
      cal.time = 0
      cal.minFeet = Infinity
    }
  })

  return (
    <group ref={ref}>
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

// The shared animation library is needed by every character — fetch it early.
useGLTF.preload(LIBRARY_URL)
