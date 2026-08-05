import { useEffect, useRef, useState, useCallback } from 'react'
import Phaser from 'phaser'
import { MainScene } from './MainScene'

// Subscribe to a media query (re-renders on change).
function useMedia(query: string): boolean {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setMatch(mq.matches)
    mq.addEventListener('change', on)
    setMatch(mq.matches)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return match
}

export function Game() {
  const gameRef = useRef<Phaser.Game | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  // Touch capability is effectively constant for a session — read once so the
  // layout structure never swaps out from under the mounted canvas.
  const isTouchRef = useRef(
    typeof window !== 'undefined' &&
      (window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0)
  )
  const isTouch = isTouchRef.current
  const isPortrait = useMedia('(orientation: portrait)')
  const [isFs, setIsFs] = useState(false)

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return
    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      // Internal resolution. Rendered 2x (1024x768) for crispness; the scene
      // zooms its world + UI cameras by width/512 so the design space and feel
      // stay identical to the classic 512x384 layout (Contra/Normie big-hero look).
      width: 1024,
      height: 768,
      parent: containerRef.current,
      backgroundColor: '#0a0612',
      physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 1000 }, debug: false } },
      scene: [MainScene],
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      input: { keyboard: true, gamepad: true },
    }
    gameRef.current = new Phaser.Game(config)
    return () => {
      gameRef.current?.destroy(true)
      gameRef.current = null
    }
  }, [])

  // Keep the canvas fitted through fullscreen toggles, rotations, and resizes.
  useEffect(() => {
    const refit = () => setTimeout(() => gameRef.current?.scale.refresh(), 60)
    const onFs = () => { setIsFs(!!document.fullscreenElement); refit() }
    window.addEventListener('resize', refit)
    window.addEventListener('orientationchange', refit)
    document.addEventListener('fullscreenchange', onFs)
    return () => {
      window.removeEventListener('resize', refit)
      window.removeEventListener('orientationchange', refit)
      document.removeEventListener('fullscreenchange', onFs)
    }
  }, [])

  // Pause the sim while the phone is held portrait (behind the rotate gate).
  const rotateGate = isTouch && isPortrait && !isFs
  useEffect(() => {
    const g = gameRef.current
    if (!g) return
    const scene = g.scene.getScene('MainScene')
    if (!scene) return
    if (rotateGate) g.scene.pause('MainScene')
    else g.scene.resume('MainScene')
  }, [rotateGate])

  const toggleFullscreen = useCallback(async () => {
    const el = stageRef.current
    if (!el) return
    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen?.()
        // Best-effort landscape lock (works inside fullscreen on most mobiles).
        try { await (screen.orientation as unknown as { lock?: (o: string) => Promise<void> })?.lock?.('landscape') } catch { /* unsupported */ }
      } else {
        try { (screen.orientation as unknown as { unlock?: () => void })?.unlock?.() } catch { /* unsupported */ }
        await document.exitFullscreen?.()
      }
    } catch { /* denied */ }
    setTimeout(() => gameRef.current?.scale.refresh(), 80)
  }, [])

  const fsBtn = (
    <button
      onClick={toggleFullscreen}
      aria-label="Toggle fullscreen"
      style={{
        position: 'absolute', top: 8, right: 8, zIndex: 40,
        width: 34, height: 34, borderRadius: 8,
        background: 'rgba(10,6,18,0.6)', borderWidth: 1, borderStyle: 'solid', borderColor: 'rgba(168,85,247,0.5)',
        color: '#e9d5ff', fontSize: 15, lineHeight: '1', cursor: 'pointer', display: 'grid', placeItems: 'center',
      }}
    >
      {isFs ? '⤢' : '⛶'}
    </button>
  )

  const rotateOverlay = rotateGate && (
    <div
      style={{
        position: 'absolute', inset: 0, zIndex: 60, background: '#05030a',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 16, textAlign: 'center', padding: 24,
      }}
    >
      <div style={{ fontSize: 46 }} className="rotate-hint">🔄</div>
      <div style={{ color: '#e879f9', fontWeight: 800, letterSpacing: 3, fontSize: 18, fontFamily: 'monospace' }}>ROTATE TO LANDSCAPE</div>
      <div style={{ color: '#a1a1aa', fontSize: 13, maxWidth: 300 }}>Apex Strike is built for landscape. Turn your device sideways to drop in.</div>
    </div>
  )

  // ---- Mobile: immersive full-viewport stage ----
  if (isTouch) {
    return (
      <div
        ref={stageRef}
        style={{ position: 'fixed', inset: 0, background: '#05030a', overflow: 'hidden', touchAction: 'none' }}
      >
        <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
        {fsBtn}
        {rotateOverlay}
      </div>
    )
  }

  // ---- Desktop: premium framed experience ----
  return (
    <div className="min-h-screen bg-[#05030a] flex flex-col items-center justify-center p-3">
      <div className="w-full max-w-5xl">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-bold tracking-widest text-fuchsia-400">APEX STRIKE</span>
          <div className="flex items-center gap-3">
            <span className="text-violet-400/70 text-xs">v1.37 — Flat Shots</span>
            <button
              onClick={toggleFullscreen}
              className="text-xs text-violet-200 px-2 py-1 rounded-md border border-violet-700/60 hover:border-fuchsia-500/70 hover:text-fuchsia-200 transition-colors"
            >
              {isFs ? '⤢ Exit Fullscreen' : '⛶ Fullscreen'}
            </button>
          </div>
        </div>

        <div
          ref={stageRef}
          className="relative rounded-xl overflow-hidden border border-violet-900/50 shadow-2xl shadow-fuchsia-950/50 bg-zinc-950"
          style={isFs ? { width: '100vw', height: '100vh' } : { aspectRatio: '4/3' }}
        >
          <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
          {isFs && fsBtn}
        </div>

        <div className="mt-3 text-center text-xs text-zinc-500 space-y-1">
          <div><span className="text-violet-400">WASD / Arrows</span> to move · <span className="text-violet-400">double-jump</span> · hold <span className="text-violet-400">Down</span> to crouch · <span className="text-violet-400">8-way aim</span> · <span className="text-violet-400">Space</span> to fire</div>
          <div><span className="text-cyan-400">🎮 Gamepad ready</span> · Grab SPREAD / RAPID / LASER / FIRE · reach the extraction beacon · press <span className="text-violet-400">Fullscreen</span> for the full ride</div>
        </div>
      </div>
    </div>
  )
}
