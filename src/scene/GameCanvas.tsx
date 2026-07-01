import { Suspense, useEffect } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { AdaptiveDpr, Preload } from '@react-three/drei'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import { CONFIG, SCENE_BG } from '../game/config'
import { useGameStore } from '../game/store'
import { GameLoop } from './GameLoop'
import { Track } from './Track'
import { Player } from './Player'
import { ObstacleField } from './ObstacleField'
import { Environment } from './Environment'

/**
 * Fixed behind-and-above chase camera (PRD §4.1, §8.2). No orbit controls.
 * The default camera is created by <Canvas camera={...}>; here we just aim it
 * once at the look target down the track.
 */
function ChaseCamera() {
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    camera.lookAt(...CONFIG.cameraLookAt)
    camera.updateProjectionMatrix()
  }, [camera])
  return null
}

export function GameCanvas() {
  // Remount the obstacle field on each fresh run so a restart never inherits a
  // stale obstacle that could re-trigger game over before React clears it.
  const runId = useGameStore((s) => s.runId)
  return (
    <Canvas
      className="h-full w-full"
      shadows
      // Cap DPR for perf; AdaptiveDpr scales it down under load (PRD §13).
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      // Signal "scene visible" after the first painted frame so the Start-screen
      // intro reveal plays for the user instead of behind the load flash.
      onCreated={() => requestAnimationFrame(() => useGameStore.getState().setReady())}
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
        position={[5, 13, 7]}
        intensity={1.7}
        color="#dfe9ff"
        castShadow
        shadow-mapSize={[2048, 2048]}
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

      <ChaseCamera />

      {/* GameLoop mounts first so its useFrame runs before consumers (§8.3). */}
      <GameLoop />

      <Suspense fallback={null}>
        <Environment />
        <Track />
        <Player />
        <ObstacleField key={runId} />
        <Preload all />
      </Suspense>

      {/* Neon glow + a touch of vignette for cinematic depth. */}
      <EffectComposer multisampling={4}>
        <Bloom
          intensity={0.85}
          luminanceThreshold={0.55}
          luminanceSmoothing={0.25}
          mipmapBlur
        />
        <Vignette eskil={false} offset={0.25} darkness={0.75} />
      </EffectComposer>

      <AdaptiveDpr pixelated={false} />
    </Canvas>
  )
}
