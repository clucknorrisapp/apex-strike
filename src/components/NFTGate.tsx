import { useAccount, useConnect, useDisconnect, useReadContract } from 'wagmi'
import { APEX_HUNTRESS_CONTRACT, APEX_HUNTRESS_ABI } from '../config/chains'

interface NFTGateProps {
  onAccessGranted: () => void
}

export function NFTGate({ onAccessGranted }: NFTGateProps) {
  const { address, isConnected } = useAccount()
  const { connect, connectors, isPending } = useConnect()
  const { disconnect } = useDisconnect()

  const { data: balance, isLoading, isError, refetch } = useReadContract({
    address: APEX_HUNTRESS_CONTRACT,
    abi: APEX_HUNTRESS_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
    },
  })

  const hasNFT = balance !== undefined && balance > 0n

  if (!isConnected) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-black via-zinc-950 to-black px-4">
        <div className="text-center max-w-md">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-2 bg-gradient-to-r from-pink-400 via-fuchsia-400 to-cyan-400 bg-clip-text text-transparent">
            APEX STRIKE
          </h1>
          <p className="text-zinc-400 mb-8 text-sm">
            NFT-gated Contra-style run &amp; gun for Apex Huntress holders
          </p>

          <div className="space-y-3">
            {connectors.map((connector) => (
              <button
                key={connector.uid}
                onClick={() => connect({ connector })}
                disabled={isPending}
                className="w-full py-3 px-6 rounded-xl bg-gradient-to-r from-fuchsia-600 to-pink-600 hover:from-fuchsia-500 hover:to-pink-500 text-white font-semibold transition-all disabled:opacity-50"
              >
                {isPending ? 'Connecting...' : `Connect ${connector.name}`}
              </button>
            ))}
          </div>

          <p className="mt-6 text-xs text-zinc-500">
            Requires at least 1 Apex Huntress NFT on Cronos
          </p>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-center">
          <div className="animate-pulse text-fuchsia-400 text-lg mb-2">Checking ownership...</div>
          <p className="text-zinc-500 text-sm">{address?.slice(0, 6)}...{address?.slice(-4)}</p>
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black px-4">
        <div className="text-center max-w-md">
          <p className="text-red-400 mb-4">Failed to check NFT ownership</p>
          <button
            onClick={() => refetch()}
            className="px-5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm"
          >
            Retry
          </button>
          <button
            onClick={() => disconnect()}
            className="ml-3 px-5 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-sm text-zinc-400"
          >
            Disconnect
          </button>
        </div>
      </div>
    )
  }

  if (!hasNFT) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-black via-zinc-950 to-black px-4">
        <div className="text-center max-w-md">
          <h1 className="text-3xl font-bold mb-3 text-white">Access Denied</h1>
          <p className="text-zinc-400 mb-6">
            You need at least <span className="text-fuchsia-400 font-medium">1 Apex Huntress NFT</span> to play.
          </p>

          <a
            href="https://www.croarmy.site/marketplace/mint/launchpad-7e9c0ed6"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block w-full py-3 px-6 rounded-xl bg-gradient-to-r from-fuchsia-600 to-pink-600 hover:from-fuchsia-500 hover:to-pink-500 text-white font-semibold transition-all mb-4"
          >
            Mint / Buy Apex Huntress
          </a>

          <button
            onClick={() => disconnect()}
            className="text-sm text-zinc-500 hover:text-zinc-300"
          >
            Disconnect wallet
          </button>
        </div>
      </div>
    )
  }

  // Access granted
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-black via-zinc-950 to-black px-4">
      <div className="text-center max-w-md">
        <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-pink-400 via-fuchsia-400 to-cyan-400 bg-clip-text text-transparent">
          Welcome, Huntress
        </h1>
        <p className="text-zinc-400 mb-8 text-sm">
          NFT verified. Ready for combat.
        </p>

        <button
          onClick={onAccessGranted}
          className="w-full py-4 px-6 rounded-xl bg-gradient-to-r from-fuchsia-600 to-pink-600 hover:from-fuchsia-500 hover:to-pink-500 text-white font-bold text-lg tracking-wide transition-all shadow-lg shadow-fuchsia-900/40"
        >
          ENTER THE HUNT
        </button>

        <button
          onClick={() => disconnect()}
          className="mt-6 text-sm text-zinc-500 hover:text-zinc-300"
        >
          Disconnect
        </button>
      </div>
    </div>
  )
}