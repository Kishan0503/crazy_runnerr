import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/luckiest-guy/latin-400.css' // funky display font for the title
import './index.css'
import App from './App.tsx'
import { installDevBridge } from './game/devBridge'

installDevBridge() // no-op in production builds

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
