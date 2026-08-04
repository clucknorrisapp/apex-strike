import { useState } from 'react'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { config } from './config/wagmi'
import { NFTGate } from './components/NFTGate'
import { Game } from './game/Game'

const queryClient = new QueryClient()

function App() {
  const [hasAccess, setHasAccess] = useState(false)

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {!hasAccess ? (
          <NFTGate onAccessGranted={() => setHasAccess(true)} />
        ) : (
          <Game />
        )}
      </QueryClientProvider>
    </WagmiProvider>
  )
}

export default App