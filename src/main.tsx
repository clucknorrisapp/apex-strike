import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { LevelLab } from './lab/LevelLab'
import { apexSpec } from './lab/spec'

// /lab (or ?lab) opens the Level Lab editor, outside the NFT-gated game.
const path = window.location.pathname.replace(/\/+$/, '')
const isLab = path.endsWith('/lab') || new URLSearchParams(window.location.search).has('lab')

createRoot(document.getElementById('root')!).render(
  isLab ? (
    <LevelLab spec={apexSpec} />
  ) : (
    <StrictMode>
      <App />
    </StrictMode>
  ),
)
