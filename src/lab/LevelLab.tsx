import { useEffect, useRef, useState } from 'react'
import type React from 'react'
import { computeMetrics } from './spec'
import type { GameSpec, EditItem, LevelMeta } from './spec'

const CW = 980
const CH = 460
const MARKER = ['turret', 'soldier', 'flyer', 'tank', 'boss', 'pod', 'goal', 'spawn']
const RECT = ['platform', 'wall', 'ground']

export function LevelLab({ spec }: { spec: GameSpec }) {
  const first = spec.samples()[0]
  const init = spec.read(first.level)
  const [items, setItems] = useState<EditItem[]>(init.items)
  const [meta, setMeta] = useState<LevelMeta>(init.meta)
  const [sel, setSel] = useState<string | null>(null)
  const [tool, setTool] = useState<string>('select')
  const [podKind, setPodKind] = useState('spread')
  const [io, setIo] = useState<{ mode: 'export' | 'import'; text: string } | null>(null)
  const [playing, setPlaying] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const playHostRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ iid: string; ox: number; oy: number } | null>(null)

  const ent = (id: string) => spec.entities.find((e) => e.id === id)
  const metrics = computeMetrics(items, meta, spec)
  const selItem = items.find((i) => i.iid === sel) || null

  // ---- render the level schematic ----
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    const theme = spec.themes[meta.theme] || Object.values(spec.themes)[0]
    const scale = Math.min(CW / meta.w, CH / meta.h)
    const S = (v: number) => v * scale
    ctx.clearRect(0, 0, CW, CH)
    ctx.fillStyle = theme.bg
    ctx.fillRect(0, 0, CW, CH)
    ctx.strokeStyle = 'rgba(255,255,255,0.10)'
    ctx.strokeRect(0.5, 0.5, S(meta.w), S(meta.h))

    items.filter((i) => i.type === 'ground').forEach((i) => {
      const x = S(i.x - (i.w || 0) / 2), w = S(i.w || 0), y = S(i.y)
      ctx.fillStyle = theme.fill; ctx.fillRect(x, y, w, S(meta.h) - y)
      ctx.fillStyle = theme.rim; ctx.fillRect(x, y - 1, w, 2)
      if (sel === i.iid) strokeSel(ctx, x, y, w, S(meta.h) - y)
    })
    items.filter((i) => i.type === 'wall').forEach((i) => {
      const x = S(i.x - (i.w || 0) / 2), y = S(i.y), w = S(i.w || 0), h = S(i.h || 0)
      ctx.fillStyle = theme.ledge; ctx.fillRect(x, y, w, h)
      ctx.fillStyle = theme.accent; ctx.fillRect(x, y - 1, w, 2)
      if (sel === i.iid) strokeSel(ctx, x, y, w, h)
    })
    items.filter((i) => i.type === 'platform').forEach((i) => {
      const x = S(i.x - (i.w || 0) / 2), y = S(i.y), w = S(i.w || 0)
      ctx.fillStyle = theme.ledge; ctx.fillRect(x, y, w, 5)
      ctx.fillStyle = theme.rim; ctx.fillRect(x, y - 1, w, 2)
      if (sel === i.iid) strokeSel(ctx, x - 2, y - 3, w + 4, 11)
    })
    items.filter((i) => MARKER.includes(i.type)).forEach((i) => {
      const et = ent(i.type)
      const x = S(i.x), y = S(i.y)
      const r = i.type === 'boss' ? 13 : i.type === 'tank' ? 10 : i.type === 'goal' ? 10 : 8
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fillStyle = et?.color || '#fff'; ctx.globalAlpha = 0.92; ctx.fill(); ctx.globalAlpha = 1
      ctx.fillStyle = '#0a0612'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      const glyph = i.type === 'pod' ? String(i.props.kind || 'P')[0].toUpperCase() : (et?.glyph || '?')
      ctx.fillText(glyph, x, y + 0.5)
      if (sel === i.iid) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r + 3, 0, Math.PI * 2); ctx.stroke() }
    })
  }, [items, meta, sel, spec])

  const scale = Math.min(CW / meta.w, CH / meta.h)

  const evPos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top
    return { sx, sy, wx: sx / scale, wy: sy / scale }
  }
  const hitTest = (sx: number, sy: number): EditItem | null => {
    const marks = items.filter((i) => MARKER.includes(i.type))
    for (let k = marks.length - 1; k >= 0; k--) {
      const i = marks[k], dx = sx - i.x * scale, dy = sy - i.y * scale
      if (dx * dx + dy * dy < 15 * 15) return i
    }
    const rects = items.filter((i) => RECT.includes(i.type))
    for (let k = rects.length - 1; k >= 0; k--) {
      const i = rects[k]
      const x = (i.x - (i.w || 0) / 2) * scale, w = (i.w || 0) * scale, y = i.y * scale
      const h = (i.type === 'wall' ? (i.h || 0) : i.type === 'ground' ? meta.h - i.y : 8) * scale
      if (sx >= x && sx <= x + w && sy >= y && sy <= y + h) return i
    }
    return null
  }

  const addItem = (type: string, wx: number, wy: number) => {
    const et = ent(type)
    if (!et) return
    const props: Record<string, number | string> = {}
    et.props?.forEach((p) => { props[p.key] = p.default })
    if (type === 'pod') props.kind = podKind
    const ni: EditItem = { iid: 'n' + Math.round(wx) + '_' + Math.round(wy) + '_' + items.length, type, x: Math.round(wx), y: Math.round(wy), props }
    if (et.sized) { ni.w = type === 'ground' ? 400 : type === 'wall' ? 90 : 130; if (type === 'wall') ni.h = 130 }
    setItems((prev) => {
      const base = type === 'goal' || type === 'spawn' ? prev.filter((i) => i.type !== type) : prev
      return [...base, ni]
    })
    setSel(ni.iid)
  }

  const onDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { sx, sy, wx, wy } = evPos(e)
    if (tool !== 'select') { addItem(tool, wx, wy); return }
    const hit = hitTest(sx, sy)
    if (hit) { setSel(hit.iid); drag.current = { iid: hit.iid, ox: wx - hit.x, oy: wy - hit.y } }
    else setSel(null)
  }
  const onMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drag.current) return
    const { wx, wy } = evPos(e)
    const d = drag.current
    setItems((prev) => prev.map((i) => (i.iid === d.iid ? { ...i, x: Math.round(wx - d.ox), y: Math.round(wy - d.oy) } : i)))
  }
  const onUp = () => { drag.current = null }

  const patch = (p: Partial<EditItem>) => setItems((prev) => prev.map((i) => (i.iid === sel ? { ...i, ...p } : i)))
  const patchProp = (k: string, v: number | string) => setItems((prev) => prev.map((i) => (i.iid === sel ? { ...i, props: { ...i.props, [k]: v } } : i)))
  const del = () => { if (!sel) return; setItems((prev) => prev.filter((i) => i.iid !== sel)); setSel(null) }

  const loadLevel = (level: unknown) => { const r = spec.read(level); setItems(r.items); setMeta(r.meta); setSel(null) }

  // delete key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel && !playing) {
        const t = (e.target as HTMLElement).tagName
        if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return
        e.preventDefault(); del()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sel, playing]) // eslint-disable-line react-hooks/exhaustive-deps

  // play-test mount
  useEffect(() => {
    if (!playing || !playHostRef.current) return
    const level = spec.write(items, meta)
    const cleanup = spec.mountPlaytest(playHostRef.current, level)
    return cleanup
  }, [playing]) // eslint-disable-line react-hooks/exhaustive-deps

  const S: Record<string, React.CSSProperties> = STYLES

  return (
    <div style={S.root}>
      <header style={S.header}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <span style={{ fontWeight: 800, letterSpacing: 2, color: '#e879f9' }}>LEVEL LAB</span>
          <span style={{ color: '#8b7ea8', fontSize: 12 }}>{spec.name} · reusable engine · CLKN Productions</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select style={S.select} onChange={(e) => { const s = spec.samples()[Number(e.target.value)]; if (s) loadLevel(s.level) }}>
            {spec.samples().map((s, i) => <option key={i} value={i}>{s.name}</option>)}
          </select>
          <button style={S.btn} onClick={() => loadLevel(spec.blankLevel())}>+ Blank</button>
          <button style={{ ...S.btn, ...S.play }} onClick={() => setPlaying(true)}>▶ Play-test</button>
          <button style={S.btn} onClick={() => setIo({ mode: 'export', text: JSON.stringify(spec.write(items, meta)) })}>Export</button>
          <button style={S.btn} onClick={() => setIo({ mode: 'import', text: '' })}>Import</button>
        </div>
      </header>

      <div style={S.body}>
        <div style={S.left}>
          <div style={S.palette}>
            <button style={{ ...S.tool, ...(tool === 'select' ? S.toolOn : {}) }} onClick={() => setTool('select')}>▸ Select / Move</button>
            {spec.entities.map((et) => (
              <button key={et.id} style={{ ...S.tool, ...(tool === et.id ? S.toolOn : {}), borderColor: et.color }} onClick={() => setTool(et.id)}>
                <span style={{ color: et.color }}>{et.glyph}</span> {et.label}
              </button>
            ))}
            {tool === 'pod' && (
              <select style={S.select} value={podKind} onChange={(e) => setPodKind(e.target.value)}>
                {(ent('pod')?.kinds || []).map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            )}
          </div>
          <canvas
            ref={canvasRef} width={CW} height={CH} style={S.canvas}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
          />
          <div style={S.hint}>
            {tool === 'select' ? 'Click an object to select · drag to move · Delete key removes it.' : `Placing: ${ent(tool)?.label}. Click on the map to drop one. Switch to Select to move things.`}
          </div>
        </div>

        <aside style={S.right}>
          <Section title="SELECTED">
            {selItem ? (
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ color: ent(selItem.type)?.color, fontWeight: 700 }}>{ent(selItem.type)?.label} <span style={{ color: '#6b5d86' }}>#{selItem.iid.slice(0, 6)}</span></div>
                <Row label="X"><input style={S.num} type="number" value={selItem.x} onChange={(e) => patch({ x: Number(e.target.value) })} /></Row>
                <Row label="Y"><input style={S.num} type="number" value={selItem.y} onChange={(e) => patch({ y: Number(e.target.value) })} /></Row>
                {ent(selItem.type)?.sized && <Row label="Width"><input style={S.num} type="number" value={selItem.w || 0} onChange={(e) => patch({ w: Number(e.target.value) })} /></Row>}
                {selItem.type === 'wall' && <Row label="Height"><input style={S.num} type="number" value={selItem.h || 0} onChange={(e) => patch({ h: Number(e.target.value) })} /></Row>}
                {ent(selItem.type)?.props?.map((p) => (
                  <Row key={p.key} label={p.label}>
                    <input style={S.range} type="range" min={p.min} max={p.max} step={p.step} value={Number(selItem.props[p.key] ?? p.default)} onChange={(e) => patchProp(p.key, Number(e.target.value))} />
                    <span style={{ color: '#e9d5ff', width: 34, textAlign: 'right' }}>{selItem.props[p.key] ?? p.default}</span>
                  </Row>
                ))}
                {selItem.type === 'pod' && (
                  <Row label="Weapon"><select style={S.select} value={String(selItem.props.kind || 'spread')} onChange={(e) => patchProp('kind', e.target.value)}>{(ent('pod')?.kinds || []).map((k) => <option key={k} value={k}>{k}</option>)}</select></Row>
                )}
                <button style={{ ...S.btn, background: '#3a0d18', borderColor: '#f43f5e', color: '#fda4af', marginTop: 4 }} onClick={del}>Delete</button>
              </div>
            ) : <div style={{ color: '#6b5d86', fontSize: 12 }}>Nothing selected. Pick a tool above and click the map, or select an object to edit it.</div>}
          </Section>

          <Section title="STAGE">
            <Row label="Name"><input style={{ ...S.num, width: 130 }} value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} /></Row>
            <Row label="Theme"><select style={S.select} value={meta.theme} onChange={(e) => setMeta({ ...meta, theme: e.target.value })}>{Object.keys(spec.themes).map((t) => <option key={t} value={t}>{t}</option>)}</select></Row>
            <Row label="World W"><input style={S.num} type="number" value={meta.w} onChange={(e) => setMeta({ ...meta, w: Number(e.target.value) })} /></Row>
            <Row label="World H"><input style={S.num} type="number" value={meta.h} onChange={(e) => setMeta({ ...meta, h: Number(e.target.value) })} /></Row>
          </Section>

          <Section title="METRICS">
            <div style={S.metricGrid}>
              <Metric label="Enemies" value={metrics.enemyCount} />
              <Metric label="Pods" value={metrics.pods} />
              <Metric label="Pits" value={metrics.pits} />
              <Metric label="Difficulty" value={metrics.difficulty} accent />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {Object.entries(metrics.byType).map(([t, n]) => (
                <span key={t} style={{ fontSize: 11, color: ent(t)?.color, border: `1px solid ${ent(t)?.color}55`, borderRadius: 3, padding: '1px 6px' }}>{ent(t)?.label || t}: {n}</span>
              ))}
            </div>
          </Section>

          <Section title={`FLOW CHECKS ${metrics.warnings.length ? '· ' + metrics.warnings.length : ''}`}>
            {metrics.warnings.length === 0
              ? <div style={{ color: '#4ade80', fontSize: 12 }}>✓ No flow problems detected.</div>
              : <ul style={{ margin: 0, paddingLeft: 16, color: '#fbbf24', fontSize: 12, display: 'grid', gap: 4 }}>{metrics.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
          </Section>
        </aside>
      </div>

      {io && (
        <div style={S.modal} onClick={() => setIo(null)}>
          <div style={S.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 700, color: '#22d3ee', marginBottom: 8 }}>{io.mode === 'export' ? 'Export level data' : 'Import level JSON'}</div>
            <textarea style={S.textarea} value={io.text} readOnly={io.mode === 'export'} onChange={(e) => setIo({ ...io, text: e.target.value })} />
            <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
              {io.mode === 'export' && <button style={S.btn} onClick={() => navigator.clipboard?.writeText(io.text)}>Copy</button>}
              {io.mode === 'import' && <button style={{ ...S.btn, ...S.play }} onClick={() => { try { loadLevel(JSON.parse(io.text)); setIo(null) } catch { alert('Invalid JSON') } }}>Load</button>}
              <button style={S.btn} onClick={() => setIo(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {playing && (
        <div style={S.modal}>
          <div style={{ ...S.modalCard, width: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontWeight: 700, color: '#22d3ee' }}>Play-test · {meta.name}</div>
              <button style={S.btn} onClick={() => setPlaying(false)}>✕ Close</button>
            </div>
            <div ref={playHostRef} style={{ width: 768, height: 576, background: '#0a0612', borderRadius: 6, overflow: 'hidden' }} />
            <div style={{ color: '#8b7ea8', fontSize: 12, marginTop: 8 }}>Arrows / WASD move · W or ↑ jump (double-jump) · Space fire · ↑/↓ aim · this is the real game on your edited level.</div>
          </div>
        </div>
      )}
    </div>
  )
}

function strokeSel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]); ctx.strokeRect(x, y, w, h); ctx.setLineDash([])
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div style={{ borderTop: '1px solid #2c1f44', paddingTop: 10 }}><div style={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: 1.5, color: '#8b7ea8', marginBottom: 8 }}>{title}</div>{children}</div>
}
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#c4b5fd' }}><span style={{ width: 58, color: '#8b7ea8' }}>{label}</span>{children}</label>
}
function Metric({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return <div style={{ background: '#160b24', border: '1px solid #2c1f44', borderRadius: 4, padding: '6px 8px' }}><div style={{ fontSize: 10, color: '#8b7ea8' }}>{label}</div><div style={{ fontSize: 18, fontWeight: 700, color: accent ? '#fbbf24' : '#e9d5ff', fontFamily: 'monospace' }}>{value}</div></div>
}

const STYLES: Record<string, React.CSSProperties> = {
  root: { minHeight: '100vh', background: '#0a0612', color: '#ece7f5', fontFamily: 'system-ui, sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid #2c1f44', position: 'sticky', top: 0, background: 'rgba(10,6,18,0.9)', zIndex: 10, flexWrap: 'wrap', gap: 8 },
  body: { display: 'flex', gap: 16, padding: 16, alignItems: 'flex-start', flexWrap: 'wrap' },
  left: { flex: '1 1 640px' },
  right: { flex: '0 0 300px', display: 'grid', gap: 14, background: '#120a1f', border: '1px solid #2c1f44', borderRadius: 8, padding: 14 },
  palette: { display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  canvas: { width: CW, maxWidth: '100%', height: CH, background: '#0a0612', border: '1px solid #2c1f44', borderRadius: 6, cursor: 'crosshair', display: 'block' },
  hint: { color: '#8b7ea8', fontSize: 12, marginTop: 8 },
  tool: { background: '#160b24', borderWidth: 1, borderStyle: 'solid', borderColor: '#2c1f44', color: '#e9d5ff', borderRadius: 4, padding: '5px 9px', fontSize: 12, cursor: 'pointer' },
  toolOn: { background: '#2a1a4d', borderColor: '#a855f7', color: '#fff' },
  btn: { background: '#160b24', borderWidth: 1, borderStyle: 'solid', borderColor: '#3d2b5e', color: '#e9d5ff', borderRadius: 4, padding: '5px 10px', fontSize: 12, cursor: 'pointer' },
  play: { background: '#0d2a1a', borderColor: '#4ade80', color: '#86efac' },
  select: { background: '#160b24', border: '1px solid #3d2b5e', color: '#e9d5ff', borderRadius: 4, padding: '4px 6px', fontSize: 12 },
  num: { background: '#0a0612', border: '1px solid #3d2b5e', color: '#e9d5ff', borderRadius: 4, padding: '3px 6px', fontSize: 12, width: 80 },
  range: { flex: 1 },
  metricGrid: { display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 6 },
  modal: { position: 'fixed', inset: 0, background: 'rgba(5,3,10,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 },
  modalCard: { background: '#120a1f', border: '1px solid #3d2b5e', borderRadius: 8, padding: 16, width: 'min(680px, 96vw)', maxHeight: '92vh', overflow: 'auto' },
  textarea: { width: '100%', height: 220, background: '#0a0612', border: '1px solid #2c1f44', color: '#9ae6b4', borderRadius: 4, padding: 8, fontFamily: 'monospace', fontSize: 11 },
}
