import { Suspense, useEffect } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { AdaptiveDpr, Preload } from '@react-three/drei'
import { CONFIG, SCENE_BG } from '../game/config'
import { GameLoop } from './GameLoop'
import { Track } from './Track'
import { Player } from './Player'
import { ObstacleField } from './ObstacleField'

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
  return (
    <Canvas
      className="h-full w-full"
      // Cap DPR for perf; AdaptiveDpr scales it down under load (PRD §13).
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{
        position: [...CONFIG.cameraPos],
        fov: CONFIG.cameraFov,
        near: 0.1,
        far: 200,
      }}
    >
      {/* Background + fog share a color so obstacles fade in, not pop (§8.2). */}
      <color attach="background" args={[SCENE_BG]} />
      <fog attach="fog" args={[SCENE_BG, CONFIG.fogNear, CONFIG.fogFar]} />

      {/* Lighting: soft ambient/hemisphere fill + a key directional light. */}
      <hemisphereLight args={['#cdd6ff', '#1a1f2e', 0.55]} />
      <ambientLight intensity={0.35} />
      <directionalLight
        position={[6, 12, 6]}
        intensity={1.25}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />

      <ChaseCamera />

      {/* GameLoop mounts first so its useFrame runs before consumers (§8.3). */}
      <GameLoop />

      <Suspense fallback={null}>
        <Track />
        <Player />
        <ObstacleField />
        <Preload all />
      </Suspense>

      <AdaptiveDpr pixelated={false} />
    </Canvas>
  )
}
