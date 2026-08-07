import { useState } from 'react'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { config } from './config/wagmi'
import { NFTGate } from './components/NFTGate'
import { Game } from './game/Game'
import { DevDashboard } from './dev/DevDashboard'

const queryClient = new QueryClient()

// Dev playtest dashboard. Reachable two ways:
//   • ?dash=<key>  — direct owner access, always works (bookmark it). Key defaults to
//     "clkn"; override with the VITE_DASH_KEY build env var.
//   • ?dash with ?dev / preview mode on — same soft gate as the ?dev preview.
// Public NFT-gated users who just add ?dash (no key, no preview) still get the game.
const DASH_KEY = ((import.meta.env.VITE_DASH_KEY as string | undefined) || 'clkn').toLowerCase()

function useDashboardRoute(): boolean {
  const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
  if (!params.has('dash')) return false
  const key = (params.get('dash') || '').toLowerCase()
  if (key && key === DASH_KEY) return true                 // direct: ?dash=clkn
  const isDev = import.meta.env.DEV
  const wantOn = ['dev', 'preview', 'play'].some((k) => params.has(k))
  let previewSaved = false
  try { previewSaved = localStorage.getItem('apex_preview') === '1' } catch { /* ignore */ }
  return isDev || wantOn || previewSaved
}

function App() {
  const [hasAccess, setHasAccess] = useState(false)
  const showDash = useDashboardRoute()

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {showDash ? (
          <DevDashboard />
        ) : !hasAccess ? (
          <NFTGate onAccessGranted={() => setHasAccess(true)} />
        ) : (
          <Game />
        )}
      </QueryClientProvider>
    </WagmiProvider>
  )
}

export default App
