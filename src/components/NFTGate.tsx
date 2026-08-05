import { useEffect, useState } from 'react'
import { useAccount, useConnect, useDisconnect, useReadContract } from 'wagmi'
import { APEX_HUNTRESS_CONTRACT, APEX_HUNTRESS_ABI } from '../config/chains'

// Beta access codes — share with testers who don't have an Apex Huntress NFT
// yet. Soft gate: codes ship in the client bundle, which is fine for a closed
// beta. Add/change codes here (or ask to wire them to an env var later).
const BETA_CODES = ['CLKNbetatest']
const normCode = (s: string) => s.trim().toLowerCase()

interface NFTGateProps {
  onAccessGranted: () => void
}

// A small "enter your beta code" field. Valid code → onUnlock().
function BetaCodeEntry({ onUnlock }: { onUnlock: () => void }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState(false)
  const submit = () => {
    if (BETA_CODES.some((c) => normCode(c) === normCode(code))) onUnlock()
    else setError(true)
  }
  return (
    <div className="mt-4">
      <p className="text-xs text-zinc-500 mb-2">Beta tester? Enter your access code to play without an NFT.</p>
      <div className="flex gap-2">
        <input
          type="text"
          value={code}
          onChange={(e) => { setCode(e.target.value); setError(false) }}
          onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
          placeholder="Beta access code"
          aria-label="Beta access code"
          className="flex-1 min-w-0 py-2.5 px-3 rounded-lg bg-zinc-900/70 border border-violet-800/50 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-fuchsia-500/70"
        />
        <button
          onClick={submit}
          className="shrink-0 py-2.5 px-4 rounded-lg bg-violet-700/80 hover:bg-violet-600 text-white text-sm font-semibold transition-colors"
        >
          Enter
        </button>
      </div>
      {error && <p className="mt-1.5 text-xs text-red-400 text-left">That code isn&apos;t valid.</p>}
    </div>
  )
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

  // Preview / testing mode — play without a wallet or NFT.
  // Open the site once with ?dev (or ?preview / ?play) appended and it's
  // remembered on this device, so the Preview button stays available for
  // testing. Use ?dev=off to clear it. import.meta.env.DEV covers local
  // `vite dev`. The public apexstrike.app stays gated for everyone else.
  const isDev = import.meta.env.DEV
  const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
  const wantOff = ['dev', 'preview', 'play'].some((k) => params.get(k) === 'off')
  const wantOn = !wantOff && (params.has('dev') || params.has('preview') || params.has('play'))
  useEffect(() => {
    try {
      if (wantOff) localStorage.removeItem('apex_preview')
      else if (wantOn) localStorage.setItem('apex_preview', '1')
    } catch { /* ignore */ }
  }, [wantOn, wantOff])
  let previewSaved = false
  try { previewSaved = !wantOff && localStorage.getItem('apex_preview') === '1' } catch { /* ignore */ }
  const previewMode = isDev || wantOn || previewSaved

  // Access without a wallet: if already unlocked (via ?dev or a prior valid beta
  // code) show a one-tap Enter button; otherwise offer the beta-code field.
  const persistUnlock = () => { try { localStorage.setItem('apex_preview', '1') } catch { /* ignore */ } }

  const AccessPanel = () =>
    previewMode ? (
      <button
        onClick={onAccessGranted}
        className="w-full py-3 px-6 rounded-xl border border-dashed border-yellow-500/60 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-300 font-medium transition-all mt-4"
      >
        ▶ Enter Game (no NFT)
      </button>
    ) : (
      <BetaCodeEntry onUnlock={() => { persistUnlock(); onAccessGranted() }} />
    )

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-[#05030a] via-[#0a0612] to-black px-4">
      <div className="text-center max-w-md w-full">{children}</div>
    </div>
  )

  if (!isConnected) {
    return shell(
      <>
        <img
          src="/assets/logo.png"
          alt="Apex Strike"
          className="mx-auto mb-6 w-52 md:w-72 h-auto object-contain drop-shadow-[0_0_32px_rgba(168,85,247,0.55)]"
          onError={(e) => {
            ;(e.target as HTMLImageElement).style.display = 'none'
          }}
        />
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-2 bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-400 bg-clip-text text-transparent">
          APEX STRIKE
        </h1>
        <p className="text-zinc-400 mb-8 text-sm">
          NFT-gated run &amp; gun for Apex Huntress holders on Cronos
        </p>

        <div className="space-y-3">
          {connectors.length > 0 ? (
            connectors.map((connector) => (
              <button
                key={connector.uid}
                onClick={() => connect({ connector })}
                disabled={isPending}
                className="w-full py-3 px-6 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-semibold transition-all disabled:opacity-50 shadow-lg shadow-violet-950/40"
              >
                {isPending ? 'Connecting...' : `Connect ${connector.name}`}
              </button>
            ))
          ) : (
            <p className="text-zinc-500 text-sm">No wallet connectors available</p>
          )}
        </div>

        <AccessPanel />

        <p className="mt-6 text-xs text-zinc-500">
          Requires at least 1 Apex Huntress NFT on Cronos
        </p>
      </>
    )
  }

  if (isLoading) {
    return shell(
      <>
        <div className="animate-pulse text-fuchsia-400 text-lg mb-2">Checking ownership...</div>
        <p className="text-zinc-500 text-sm">
          {address?.slice(0, 6)}...{address?.slice(-4)}
        </p>
      </>
    )
  }

  if (isError) {
    return shell(
      <>
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
        <div className="mt-6">
          <AccessPanel />
        </div>
      </>
    )
  }

  if (!hasNFT) {
    return shell(
      <>
        <h1 className="text-3xl font-bold mb-3 text-white">Access Denied</h1>
        <p className="text-zinc-400 mb-6">
          You need at least{' '}
          <span className="text-fuchsia-400 font-medium">1 Apex Huntress NFT</span> to play.
        </p>

        <a
          href="https://www.croarmy.site/marketplace/mint/launchpad-7e9c0ed6"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block w-full py-3 px-6 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-semibold transition-all mb-4 shadow-lg shadow-violet-950/40"
        >
          Mint / Buy Apex Huntress
        </a>

        <AccessPanel />

        <button
          onClick={() => disconnect()}
          className="mt-4 text-sm text-zinc-500 hover:text-zinc-300"
        >
          Disconnect wallet
        </button>
      </>
    )
  }

  return shell(
    <>
      <img
        src="/assets/logo.png"
        alt="Apex"
        className="mx-auto mb-4 w-40 md:w-48 h-auto object-contain drop-shadow-[0_0_22px_rgba(34,211,238,0.4)]"
        onError={(e) => {
          ;(e.target as HTMLImageElement).style.display = 'none'
        }}
      />
      <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-400 bg-clip-text text-transparent">
        Welcome, Huntress
      </h1>
      <p className="text-zinc-400 mb-8 text-sm">NFT verified. Ready for combat.</p>

      <button
        onClick={onAccessGranted}
        className="w-full py-4 px-6 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-bold text-lg tracking-wide transition-all shadow-lg shadow-fuchsia-900/40"
      >
        ENTER THE HUNT
      </button>

      <button
        onClick={() => disconnect()}
        className="mt-6 text-sm text-zinc-500 hover:text-zinc-300"
      >
        Disconnect
      </button>
    </>
  )
}
