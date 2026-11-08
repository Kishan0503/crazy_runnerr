import { useFrame } from '@react-three/fiber'
import { stepTrack } from '../game/track'
import { TrackObstacles } from './TrackObstacles'
import { SurfacePool } from './Surface'
import { PickupPool } from './PickupToken'
import { CoinField } from './Coin'

/**
 * Advances the track simulation once per frame. Mounted BEFORE the renderers
 * (sibling order = useFrame order) and after <Player/> in GameCanvas, so each
 * frame runs: GameLoop → player physics → track step → draw.
 */
function TrackStepper() {
  useFrame(() => stepTrack())
  return null
}

/**
 * Everything spawned on the track (PRD §8.1, §8.4; Phase 4P architecture):
 * obstacles & vehicles, ramps & rooftops, pickups and coins. The simulation is
 * plain data in game/track.ts (pools, no React state); these components are
 * mounted once and only draw it — instanced meshes / fixed pools, so nothing is
 * created or destroyed during a run. Fairness rules live in spawn.ts.
 */
export function ObstacleField() {
  return (
    <>
      <TrackStepper />
      <TrackObstacles />
      <SurfacePool />
      <PickupPool />
      <CoinField />
    </>
  )
}
