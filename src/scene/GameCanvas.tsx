import { Suspense, lazy, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { PerformanceMonitor, Preload } from '@react-three/drei'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import { CONFIG, SCENE_BG } from '../game/config'
import { useGameStore } from '../game/store'
import { pixelRatio, TIERS, useQuality } from '../game/quality'
import { world } from '../game/world'
import { GameLoop } from './GameLoop'
import { Track } from './Track'
import { Player } from './Player'
import { ObstacleField } from './ObstacleField'
import { Environment } from './Environment'
import { CameraRig } from './CameraRig'
import { Particles } from './Particles'

// Dev-only debug overlay (stats, hitboxes). `null` in production, so the lazy
// chunk is never referenced or emitted.
const DebugScene = import.meta.env.DEV ? lazy(() => import('./debug/DebugScene')) : null

/** Seconds between two auto-quality steps down (lets the frame rate settle). */
const DECLINE_COOLDOWN = 4

/** Built-in canvas MSAA only when there's no post-processing (it would be wasted). */
const initialTier = useQuality.getState().applied

export function GameCanvas() {
  // Quality tier (Phase 4P): resolution, bloom, shadow size. Changes only between
  // runs; mid-run the auto mode may only lower the pixel ratio (dprCap).
  const tier = useQuality((s) => s.applied)
  const dprCap = useQuality((s) => s.dprCap)
  const spec = TIERS[tier]
  const lastDecline = useRef(0)
  const onDecline = () => {
    // Judge real gameplay only (menus and the warm-up frames don't count).
    if (!world.running || useGameStore.getState().phase !== 'playing') return
    const now = performance.now() / 1000
    if (now - lastDecline.current < DECLINE_COOLDOWN) return
    lastDecline.current = now
    useQuality.getState().decline()
  }

  return (
    <Canvas
      className="h-full w-full"
      shadows
      dpr={pixelRatio(tier, dprCap)}
      gl={{ antialias: !TIERS[initialTier].bloom, powerPreference: 'high-performance', stencil: false }}
      // Signal "scene visible" after the first painted frame so the Start-screen
      // intro reveal plays for the user instead of behind the load flash.
      onCreated={({ gl }) => {
        // Reading the shader log after every compile blocks on the GPU driver;
        // only worth it while developing (Phase 4P).
        gl.debug.checkShaderErrors = import.meta.env.DEV
        requestAnimationFrame(() => {
          useGameStore.getState().setReady()
        })
      }}
      camera={{
        position: [...CONFIG.cameraPos],
        fov: CONFIG.cameraFov,
        near: 0.1,
        far: 260,
      }}
    >
      {/* Fog blends the runway into the night so obstacles fade in (§8.2). The
          gradient sky background is set by <Environment>. */}
      <fog attach="fog" args={[SCENE_BG, CONFIG.fogNear, CONFIG.fogFar]} />

      {/* Lighting: cool blue night. Soft hemisphere/ambient fill, a crisp key
          light for the player's ground shadow, and a blue rim for neon mood.
          Fill is lifted a touch so the runner reads clearly on the dark track
          without washing out the neon city. */}
      <hemisphereLight args={['#9fc0ff', '#0a1124', 0.6]} />
      <ambientLight intensity={0.4} />
      <directionalLight
        key={spec.shadowMap}
        position={[5, 13, 7]}
        intensity={1.7}
        color="#dfe9ff"
        castShadow
        shadow-mapSize={[spec.shadowMap, spec.shadowMap]}
        shadow-bias={-0.0005}
        shadow-camera-near={1}
        shadow-camera-far={40}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={10}
        shadow-camera-bottom={-12}
      />
      {/* Cool rim/fill from the side+back for a neon edge on the character. */}
      <directionalLight position={[-6, 4, -8]} intensity={0.6} color="#4f80ff" />
      {/* Soft front fill aimed down the track from the camera side, so the runner
          (who faces away from us) isn't left in shadow. Low + warm-neutral to
          brighten the character without flattening the scene. */}
      <directionalLight position={[0, 4, 12]} intensity={0.55} color="#eaf1ff" />

      {/* Chase camera with shake / FOV kick feedback (Phase 2). */}
      <CameraRig />

      {/* GameLoop mounts first so its useFrame runs before consumers (§8.3). */}
      <GameLoop />

      <Suspense fallback={null}>
        <Environment />
        <Track />
        <Player />
        <ObstacleField />
        <Particles />
        <Preload all />
      </Suspense>

      {/* Neon glow + a touch of vignette for cinematic depth (off on the low tier). */}
      {spec.bloom && (
        <EffectComposer multisampling={spec.msaa}>
          <Bloom
            intensity={0.85}
            luminanceThreshold={0.55}
            luminanceSmoothing={0.25}
            mipmapBlur
            resolutionScale={spec.bloomScale}
          />
          <Vignette eskil={false} offset={0.25} darkness={0.75} />
        </EffectComposer>
      )}

      {/* Auto quality: watches the frame rate and steps down when it's too low. */}
      <PerformanceMonitor bounds={() => [42, 1000]} flipflops={Infinity} onDecline={onDecline} />

      {DebugScene && (
        <Suspense fallback={null}>
          <DebugScene />
        </Suspense>
      )}
    </Canvas>
  )
}
