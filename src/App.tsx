import { GameCanvas } from './scene/GameCanvas'
import { StartScreen } from './ui/StartScreen'
import { Hud } from './ui/Hud'
import { PauseOverlay } from './ui/PauseOverlay'
import { GameOverScreen } from './ui/GameOverScreen'
import { TouchControls } from './ui/TouchControls'
import { AuthModal } from './ui/AuthModal'
import { CharacterSelect } from './ui/CharacterSelect'
import { useGameControls } from './game/useGameControls'
import { useMetaControls } from './game/useMetaControls'
import { useAuthSync } from './game/useAuthSync'
import { useAudio } from './audio/useAudio'
import { useHaptics } from './game/useHaptics'
import { useAutoPause } from './game/useAutoPause'
import { Banners } from './ui/Banners'
import { LoadingScreen } from './ui/LoadingScreen'

/**
 * App shell. The WebGL canvas fills the screen; HUD/menus layer above as DOM
 * (PRD §5). Each overlay renders only in its phase. Keyboard + swipe gameplay
 * input and meta (start/retry/pause) input are wired at the root; on-screen
 * touch buttons render as a fallback while playing.
 */
function App() {
  useGameControls()
  useMetaControls()
  useAuthSync()
  // Phase 2 feedback: sound, vibration, auto-pause on tab/app switch.
  useAudio()
  useHaptics()
  useAutoPause()

  return (
    <div className="relative h-full w-full overflow-hidden">
      <GameCanvas />

      <Hud />
      <Banners />
      <StartScreen />
      <PauseOverlay />
      <GameOverScreen />
      <TouchControls />
      <CharacterSelect />
      <AuthModal />
      <LoadingScreen />
    </div>
  )
}

export default App
