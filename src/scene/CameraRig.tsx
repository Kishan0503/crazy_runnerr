import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { MathUtils, type PerspectiveCamera } from 'three'
import { CONFIG } from '../game/config'
import { on } from '../game/events'
import { addTrauma, decayTrauma } from '../game/feedback'
import { world } from '../game/world'
import { player } from '../game/playerState'
import { isPickupActive } from '../game/pickups'

/** Jetpack flight camera: height above / distance behind the flyer, look height. */
const FLY_CAM_UP = 2.3
const FLY_CAM_BACK = 4.8
const FLY_LOOK_UP = 1.0

/** Smooth pseudo-noise in ~[-1, 1] from layered sines (cheap, no allocations). */
const wobble = (t: number, seed: number) =>
  (Math.sin(t * 23.1 + seed) + Math.sin(t * 37.7 + seed * 2.3) * 0.6 + Math.sin(t * 59.3 + seed * 4.1) * 0.3) / 1.9

/**
 * Behind-and-above chase camera (PRD §4.1, §8.2) with Phase 2 feedback:
 *   - shake: a "trauma" value (0..1) added by crash / stumble / hard landing;
 *     offset = shakeMax × trauma² × noise, decaying over real time
 *   - speed tiers: a FOV kick that eases back, plus a small permanent widening
 *     per tier so higher speeds feel faster
 *   - landing: a tiny downward dip
 *
 * Runs on REAL time (not world.timeScale) so the crash shake plays out at full
 * speed during the slow-mo, and keeps settling after the world has frozen.
 */
export function CameraRig() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const fx = useRef({ trauma: 0, kick: 0, tier: 0, dip: 0, t: 0, runId: -1, lift: 0, fly: 0 })

  useEffect(() => {
    camera.position.set(...CONFIG.cameraPos)
    camera.lookAt(...CONFIG.cameraLookAt)
    camera.updateProjectionMatrix()

    const s = fx.current
    const offs = [
      on('crash', () => (s.trauma = addTrauma(s.trauma, CONFIG.traumaCrash))),
      on('shieldBreak', () => (s.trauma = addTrauma(s.trauma, 0.55))),
      on('stumble', () => (s.trauma = addTrauma(s.trauma, CONFIG.traumaStumble))),
      on('land', ({ hard }) => {
        s.dip = hard ? 0.12 : 0.05
        if (hard) s.trauma = addTrauma(s.trauma, CONFIG.traumaHardLand)
      }),
      on('speedTier', ({ tier }) => {
        s.tier = tier
        s.kick = CONFIG.fovKick
      }),
      on('runStart', () => {
        s.tier = 0
        s.kick = 0
        s.trauma = 0
      }),
    ]
    return () => offs.forEach((off) => off())
  }, [camera])

  useFrame((_, delta) => {
    const dt = Math.min(delta, CONFIG.maxFrameDt)
    const s = fx.current
    s.t += dt
    s.trauma = decayTrauma(s.trauma, dt, CONFIG.shakeDecay)
    s.kick = Math.max(0, s.kick - s.kick * Math.min(1, dt * 4)) // eases back over ~0.6 s
    s.dip = Math.max(0, s.dip - dt * 0.6)
    // Quitting to the menu resets the run without a runStart; drop the tier FOV.
    if (!world.running && s.runId !== world.runId) {
      s.runId = world.runId
      s.tier = 0
    }

    const shake = CONFIG.shakeMax * s.trauma * s.trauma
    const [px, py, pz] = CONFIG.cameraPos
    const [lx, ly, lz] = CONFIG.cameraLookAt
    const ox = wobble(s.t, 1) * shake
    // Follow the runner up onto rooftops / into jetpack flight (eased, partial).
    s.lift = MathUtils.damp(s.lift, player.y * 0.35, 3, dt)
    // Jetpack: ease to a flight camera above and behind the flyer, looking down
    // a little onto the leaning runner's back and the pack on top, with the
    // street and sky opening up ahead.
    s.fly = MathUtils.damp(s.fly, isPickupActive('jetpack') ? 1 : 0, 2.2, dt)
    const f = s.fly
    const oy = wobble(s.t, 7) * shake - s.dip + s.lift
    const camY = MathUtils.lerp(py + oy, player.y + FLY_CAM_UP + oy - s.lift, f)
    const camZ = MathUtils.lerp(pz, CONFIG.runnerZ + FLY_CAM_BACK, f)
    const lookY = MathUtils.lerp(ly + oy * 0.5, player.y + FLY_LOOK_UP, f)
    camera.position.set(px + ox, camY, camZ)
    camera.lookAt(lx + ox * 0.5, lookY, lz)
    camera.rotation.z += wobble(s.t, 13) * shake * 0.08 // a touch of roll

    const fov = CONFIG.cameraFov + s.tier * CONFIG.fovPerTier + s.kick
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }
  })

  return null
}
