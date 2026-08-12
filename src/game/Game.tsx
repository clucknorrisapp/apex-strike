import { useEffect, useRef, useState, useCallback, type CSSProperties } from 'react'
import Phaser from 'phaser'
import { MainScene } from './MainScene'
import { loadMeta } from './meta'

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

// Floating virtual joystick for the left side — press anywhere in the zone to anchor
// the stick, drag to steer. The drag vector maps to the same directional pad keys the
// d-pad wrote (left/right = run, up/down = 8-way aim / crouch), so MainScene reads it
// identically. Native pointer capture keeps it multi-touch alongside FIRE / JUMP.
function Joystick({ setPad, zoneW }: { setPad: (k: string, v: boolean) => void; zoneW: number }) {
  const originRef = useRef<{ lx: number; ly: number; cx: number; cy: number } | null>(null)
  const dirsRef = useRef({ left: false, right: false, up: false, down: false })
  const [knob, setKnob] = useState<{ lx: number; ly: number; dx: number; dy: number } | null>(null)
  const R = 54          // max knob travel (px)
  const DEAD = 15       // per-axis deadzone before a direction engages (px)

  const setDir = (nd: { left: boolean; right: boolean; up: boolean; down: boolean }) => {
    const prev = dirsRef.current
    ;(['left', 'right', 'up', 'down'] as const).forEach((k) => { if (nd[k] !== prev[k]) setPad(k, nd[k]) })
    dirsRef.current = nd
  }
  const clearDirs = () => setDir({ left: false, right: false, up: false, down: false })

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* */ }
    originRef.current = { lx: e.clientX - rect.left, ly: e.clientY - rect.top, cx: e.clientX, cy: e.clientY }
    setKnob({ lx: originRef.current.lx, ly: originRef.current.ly, dx: 0, dy: 0 })
    clearDirs()
  }
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const o = originRef.current
    if (!o) return
    let dx = e.clientX - o.cx, dy = e.clientY - o.cy
    const mag = Math.hypot(dx, dy)
    if (mag > R) { dx = (dx / mag) * R; dy = (dy / mag) * R }
    setDir({ left: dx < -DEAD, right: dx > DEAD, up: dy < -DEAD, down: dy > DEAD })
    setKnob({ lx: o.lx, ly: o.ly, dx, dy })
  }
  const onUp = () => { originRef.current = null; clearDirs(); setKnob(null) }

  const disc = (d: number, extra: CSSProperties): CSSProperties => ({ position: 'absolute', width: d, height: d, borderRadius: '50%', boxSizing: 'border-box', ...extra })
  const anchorX = Math.min(Math.max(zoneW / 2, 82), Math.max(84, zoneW - 82))

  return (
    <div
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onLostPointerCapture={onUp}
      onContextMenu={(e) => e.preventDefault()}
      style={{ position: 'absolute', left: 0, bottom: 0, width: zoneW, height: '72%', zIndex: 30, touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', WebkitTapHighlightColor: 'transparent' }}
    >
      {!knob && (
        <>
          <div style={disc(120, { left: anchorX - 60, bottom: 72, border: '2px solid rgba(168,85,247,0.26)', background: 'rgba(30,27,75,0.16)' })} />
          <div style={disc(54, { left: anchorX - 27, bottom: 105, border: '2px solid rgba(168,85,247,0.4)', background: 'rgba(30,27,75,0.28)' })} />
        </>
      )}
      {knob && (
        <>
          <div style={disc(126, { left: knob.lx - 63, top: knob.ly - 63, border: '2px solid rgba(168,85,247,0.55)', background: 'radial-gradient(circle, rgba(88,28,135,0.35), rgba(30,27,75,0.12))', boxShadow: '0 0 22px rgba(168,85,247,0.28)' })} />
          <div style={disc(58, { left: knob.lx + knob.dx - 29, top: knob.ly + knob.dy - 29, border: '2px solid rgba(216,180,254,0.95)', background: 'rgba(168,85,247,0.6)', boxShadow: '0 0 14px rgba(168,85,247,0.55)' })} />
        </>
      )}
    </div>
  )
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
  const [gutterW, setGutterW] = useState(0)
  // Phase Dash is an Armory unlock; hide the on-screen DASH button until it's owned so a fresh
  // player never taps a prominent button that does nothing (reads as 'broken' on first touch).
  const [dashUnlocked, setDashUnlocked] = useState(() => { try { return loadMeta().up.dash > 0 } catch { return false } })
  useEffect(() => {
    const refresh = () => { try { setDashUnlocked(loadMeta().up.dash > 0) } catch { /* storage blocked */ } }
    window.addEventListener('apex-armory-changed', refresh)
    return () => window.removeEventListener('apex-armory-changed', refresh)
  }, [])

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

  // Measure the letterbox side-gutter width so off-canvas controls can live there.
  useEffect(() => {
    if (!isTouch) return
    const measure = () => {
      const vw = window.innerWidth, vh = window.innerHeight
      const canvasW = Math.min(vw, vh * (4 / 3))   // FIT fits the 4:3 canvas to the smaller axis
      setGutterW(Math.max(0, (vw - canvasW) / 2))
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('orientationchange', measure)
    return () => { window.removeEventListener('resize', measure); window.removeEventListener('orientationchange', measure) }
  }, [isTouch])

  // Gutter controls show only in landscape with real gutter room; tell the scene so it
  // hides its in-canvas pad (they replace it).
  const showGutter = isTouch && !isPortrait && gutterW >= 64
  useEffect(() => {
    const w = window as unknown as { __APEX?: { pad: Record<string, boolean>; gutter: boolean; act: ((n: string) => void) | null } }
    w.__APEX = w.__APEX || { pad: {}, gutter: false, act: null }
    w.__APEX.gutter = showGutter
  }, [showGutter])

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

  // ---- DOM gutter controls (native multi-touch; live in the letterbox gutters) ----
  const setPad = (k: string, v: boolean) => {
    const w = window as unknown as { __APEX?: { pad: Record<string, boolean>; gutter: boolean; act: ((n: string) => void) | null } }
    w.__APEX = w.__APEX || { pad: {}, gutter: false, act: null }
    w.__APEX.pad[k] = v
  }
  const act = (n: string) => (window as unknown as { __APEX?: { act?: (n: string) => void } }).__APEX?.act?.(n)
  const ctrlBase: CSSProperties = {
    userSelect: 'none', WebkitUserSelect: 'none', touchAction: 'none', WebkitTapHighlightColor: 'transparent',
    display: 'grid', placeItems: 'center', fontFamily: 'monospace', fontWeight: 800, color: '#f5f3ff', borderRadius: 14, cursor: 'pointer', lineHeight: 1,
  }
  const hold = (k: string, label: string, extra: CSSProperties) => (
    <button key={k}
      onPointerDown={(e) => { try { (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId) } catch { /* */ } setPad(k, true) }}
      onPointerUp={() => setPad(k, false)}
      onPointerCancel={() => setPad(k, false)}
      onLostPointerCapture={() => setPad(k, false)}
      onContextMenu={(e) => e.preventDefault()}
      style={{ ...ctrlBase, ...extra }}
    >{label}</button>
  )
  const tap = (n: string, label: string, extra: CSSProperties) => (
    <button key={n}
      onPointerDown={(e) => { e.preventDefault(); act(n) }}
      onContextMenu={(e) => e.preventDefault()}
      style={{ ...ctrlBase, ...extra }}
    >{label}</button>
  )
  // Size buttons to FIT the measured gutter so a cluster can never overflow / clip.
  const bs = Math.max(44, Math.min(84, Math.floor((gutterW - 40) / 3)))   // base unit for the right-side action buttons (fit to gutterW)
  const aw = Math.max(84, Math.min(150, gutterW - 28))                    // action button width
  const gutterControls = showGutter && (
    <>
      {/* LEFT side — floating virtual joystick (drag to run + 8-way aim) */}
      <Joystick setPad={setPad} zoneW={Math.max(gutterW, 168)} />
      {/* RIGHT gutter — dash+swap / jump / fire, anchored to the RIGHT edge */}
      <div style={{ position: 'absolute', right: 14, bottom: '7%', display: 'flex', flexDirection: 'column', gap: 10, width: aw, zIndex: 30 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {dashUnlocked ? (
            <>
              {hold('dash', '» DASH', { flex: 1, height: 38, fontSize: 12, background: 'rgba(8,51,68,0.55)', border: '2px solid rgba(34,211,238,0.85)' })}
              {tap('swap', '⇄', { width: 44, height: 38, fontSize: 16, background: 'rgba(30,27,75,0.5)', border: '2px solid rgba(168,85,247,0.7)' })}
            </>
          ) : (
            /* Phase Dash not yet unlocked — SWAP takes the whole row instead of a dead DASH button */
            tap('swap', '⇄ SWAP', { flex: 1, height: 38, fontSize: 13, background: 'rgba(30,27,75,0.5)', border: '2px solid rgba(168,85,247,0.7)' })
          )}
        </div>
        {hold('jump', 'JUMP', { background: 'rgba(20,83,45,0.5)', border: '2px solid rgba(74,222,128,0.85)', height: Math.round(bs * 1.05), fontSize: 16 })}
        {hold('shoot', 'FIRE', { background: 'rgba(76,5,25,0.55)', border: '2px solid rgba(244,63,94,0.9)', height: Math.round(bs * 1.35), fontSize: 18 })}
      </div>
      {/* Top-left — pause + mute */}
      <div style={{ position: 'absolute', left: 12, top: 12, display: 'flex', gap: 8, zIndex: 30 }}>
        {tap('pause', 'II', { background: 'rgba(30,27,75,0.55)', border: '1px solid rgba(168,85,247,0.6)', width: 42, height: 32, fontSize: 13 })}
        {tap('mute', '♪', { background: 'rgba(30,27,75,0.55)', border: '1px solid rgba(168,85,247,0.6)', width: 42, height: 32, fontSize: 13 })}
      </div>
    </>
  )

  // ---- Mobile: immersive full-viewport stage ----
  if (isTouch) {
    return (
      <div
        ref={stageRef}
        style={{ position: 'fixed', inset: 0, background: '#05030a', overflow: 'hidden', touchAction: 'none' }}
      >
        <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
        {gutterControls}
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
            <span className="text-violet-400/70 text-xs">v1.78 — Lead The Run</span>
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
          <div><span className="text-cyan-400">🎮 Gamepad ready</span> · <span className="text-violet-400">CONTROLS</span> screen to view keys &amp; remap pad buttons · Grab SPREAD / RAPID / LASER / FIRE · reach the extraction beacon · press <span className="text-violet-400">Fullscreen</span> for the full ride</div>
        </div>
      </div>
    </div>
  )
}
