import { useState } from 'react'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { config } from './config/wagmi'
import { NFTGate } from './components/NFTGate'
import { Game } from './game/Game'
import { DevDashboard } from './dev/DevDashboard'

const queryClient = new QueryClient()

// Dev-only playtest dashboard, reachable at ?dash — but only when preview/dev access
// is on (same soft gate as the ?dev preview), so public NFT-gated users can't open it.
function useDashboardRoute(): boolean {
  const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
  if (!params.has('dash')) return false
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
