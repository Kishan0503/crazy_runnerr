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

  return (
    <div className="relative h-full w-full overflow-hidden">
      <GameCanvas />

      <Hud />
      <StartScreen />
      <PauseOverlay />
      <GameOverScreen />
      <TouchControls />
      <CharacterSelect />
      <AuthModal />
    </div>
  )
}

export default App
