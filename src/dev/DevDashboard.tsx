import { useEffect, useMemo, useState } from 'react'
import { LEVELS } from '../game/MainScene'
import { fetchAll, clearLocal, exportJson, REMOTE_ON, type TelemetryEvent, type DeathEvent, type RunEvent, type DeathCause } from './telemetry'

const CAUSE_COLOR: Record<DeathCause, string> = {
  pit: '#fbbf24', enemy: '#f43f5e', bullet: '#c084fc', hazard: '#fb7185', boss: '#f97316',
}
const CAUSE_LABEL: Record<DeathCause, string> = {
  pit: 'Pits / falls', enemy: 'Enemy contact', bullet: 'Enemy fire', hazard: 'Spikes', boss: 'Boss',
}
// enemy internal type → readable name
const KILLER_LABEL: Record<string, string> = { walker: 'soldier', flyer: 'flyer', tank: 'tank', charger: 'charger', diver: 'diver', turret: 'turret', boss: 'boss' }

function Card({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-violet-900/50 bg-zinc-950/60 px-4 py-3">
      <div className="text-2xl font-bold text-fuchsia-300">{value}</div>
      <div className="text-xs text-zinc-400">{label}</div>
      {sub && <div className="text-[10px] text-zinc-600 mt-0.5">{sub}</div>}
    </div>
  )
}

// One level, its terrain + a dot for every death, colored by cause.
function LevelMap({ levelIndex, deaths }: { levelIndex: number; deaths: DeathEvent[] }) {
  const def = LEVELS[levelIndex]
  if (!def) return null
  const H = def.h + 40
  // x-bucket hotspots (240px buckets)
  const buckets = new Map<number, number>()
  for (const d of deaths) { const b = Math.round(d.x / 240) * 240; buckets.set(b, (buckets.get(b) || 0) + 1) }
  const hot = [...buckets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).filter(([, n]) => n > 0)

  return (
    <div className="rounded-xl border border-violet-900/50 bg-zinc-950/60 p-3 overflow-hidden">
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-sm font-semibold text-cyan-300">L{levelIndex + 1} · {def.name}</div>
        <div className="text-xs text-zinc-400">{deaths.length} death{deaths.length === 1 ? '' : 's'}</div>
      </div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${def.w} ${H}`} width={def.w * 0.16} height={H * 0.16} style={{ minWidth: 340, background: '#0b0713', borderRadius: 8, display: 'block' }} preserveAspectRatio="xMidYMid meet">
          {/* ground */}
          {def.ground.map(([x1, x2, top], i) => (
            <rect key={'g' + i} x={x1} y={top} width={x2 - x1} height={H - top} fill="#3a3357" />
          ))}
          {/* platforms */}
          {def.plats.map(([cx, top, w], i) => (
            <rect key={'p' + i} x={cx - w / 2} y={top} width={w} height={16} fill="#2563eb" opacity={0.85} />
          ))}
          {/* walls */}
          {def.walls.map(([cx, top, w, h], i) => (
            <rect key={'w' + i} x={cx - w / 2} y={top} width={w} height={h} fill="#7c3aed" opacity={0.6} />
          ))}
          {/* hazards */}
          {(def.hazards || []).map(([cx, top, w], i) => (
            <rect key={'h' + i} x={cx - w / 2} y={(top || 600) - 10} width={w} height={12} fill="#ef4444" opacity={0.7} />
          ))}
          {/* goal */}
          {!(def.goal[0] === 0 && def.goal[1] === 0) && (
            <rect x={def.goal[0] - 4} y={440} width={8} height={160} fill="#fde047" opacity={0.7} />
          )}
          {/* death markers */}
          {deaths.map((d, i) => (
            <circle key={'d' + i} cx={d.x} cy={d.y} r={22} fill={CAUSE_COLOR[d.cause] || '#fff'} opacity={0.42} stroke="#000" strokeWidth={2} strokeOpacity={0.25} />
          ))}
        </svg>
      </div>
      {hot.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
          {hot.map(([x, n], i) => (
            <span key={i} className="rounded-md bg-red-500/15 border border-red-500/30 text-red-300 px-2 py-0.5">
              hot-spot x≈{x} · {n} death{n === 1 ? '' : 's'}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function Bar({ label, n, total, color }: { label: string; n: number; total: number; color: string }) {
  const pct = total ? Math.round((n / total) * 100) : 0
  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="w-28 shrink-0 text-zinc-300 truncate">{label}</div>
      <div className="flex-1 h-3 rounded bg-zinc-800 overflow-hidden">
        <div className="h-full rounded" style={{ width: pct + '%', background: color }} />
      </div>
      <div className="w-14 shrink-0 text-right text-zinc-400">{n} · {pct}%</div>
    </div>
  )
}

export function DevDashboard() {
  const [events, setEvents] = useState<TelemetryEvent[] | null>(null)
  const [loading, setLoading] = useState(true)

  const load = () => { setLoading(true); fetchAll().then((e) => { setEvents(e); setLoading(false) }) }
  useEffect(() => { load() }, [])

  const { deaths, runs } = useMemo(() => {
    const all = events || []
    return {
      deaths: all.filter((e): e is DeathEvent => e.t === 'death'),
      runs: all.filter((e): e is RunEvent => e.t === 'run'),
    }
  }, [events])

  const wins = runs.filter((r) => r.outcome === 'win').length
  const avgLevel = runs.length ? (runs.reduce((s, r) => s + r.levelReached, 0) / runs.length).toFixed(1) : '—'
  const winRate = runs.length ? Math.round((wins / runs.length) * 100) + '%' : '—'

  const byCause = useMemo(() => {
    const m = new Map<DeathCause, number>()
    for (const d of deaths) m.set(d.cause, (m.get(d.cause) || 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [deaths])

  const byKiller = useMemo(() => {
    const m = new Map<string, number>()
    for (const d of deaths) { if (d.cause === 'enemy' && d.killer) { const k = KILLER_LABEL[d.killer] || d.killer; m.set(k, (m.get(k) || 0) + 1) } }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
  }, [deaths])

  const deathsByLevel = (i: number) => deaths.filter((d) => d.lvl === i + 1)
  const recentRuns = [...runs].sort((a, b) => b.ts - a.ts).slice(0, 12)

  const download = () => {
    const blob = new Blob([exportJson()], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = 'apex-telemetry.json'; a.click()
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#05030a] via-[#0a0612] to-black text-zinc-200 px-4 py-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-400 bg-clip-text text-transparent">
              Apex Strike · Playtest Dashboard
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              Where testers get taken out, and what got them.{' '}
              <span className={REMOTE_ON ? 'text-emerald-400' : 'text-amber-400'}>
                {REMOTE_ON ? '● shared store (all testers)' : '● local only (this device) — add a shared store to aggregate everyone'}
              </span>
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={load} className="text-xs px-3 py-1.5 rounded-lg border border-violet-700/60 hover:border-fuchsia-500/70 hover:text-fuchsia-200">Refresh</button>
            <button onClick={download} className="text-xs px-3 py-1.5 rounded-lg border border-violet-700/60 hover:border-fuchsia-500/70 hover:text-fuchsia-200">Export JSON</button>
            <button onClick={() => { if (confirm('Clear locally-stored telemetry on this device?')) { clearLocal(); load() } }} className="text-xs px-3 py-1.5 rounded-lg border border-red-800/60 text-red-300 hover:border-red-500/70">Clear local</button>
            <a href="?dev" className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700/60 hover:border-zinc-500 text-zinc-300">← Game</a>
          </div>
        </div>

        {loading ? (
          <div className="text-fuchsia-400 animate-pulse py-20 text-center">Loading telemetry…</div>
        ) : deaths.length === 0 && runs.length === 0 ? (
          <div className="rounded-xl border border-violet-900/50 bg-zinc-950/60 p-8 text-center text-zinc-400">
            No playtest data yet. Play a few runs (and die a few times) — deaths log automatically, then show up here.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              <Card label="Runs" value={runs.length} />
              <Card label="Deaths logged" value={deaths.length} />
              <Card label="Win rate" value={winRate} sub={`${wins} win${wins === 1 ? '' : 's'}`} />
              <Card label="Avg level reached" value={avgLevel} sub="of 5" />
            </div>

            <div className="grid md:grid-cols-2 gap-3 mb-5">
              <div className="rounded-xl border border-violet-900/50 bg-zinc-950/60 p-4">
                <div className="text-sm font-semibold text-zinc-200 mb-3">What got them</div>
                <div className="space-y-2">
                  {byCause.map(([c, n]) => <Bar key={c} label={CAUSE_LABEL[c] || c} n={n} total={deaths.length} color={CAUSE_COLOR[c] || '#a1a1aa'} />)}
                  {byCause.length === 0 && <div className="text-xs text-zinc-500">No deaths yet.</div>}
                </div>
              </div>
              <div className="rounded-xl border border-violet-900/50 bg-zinc-950/60 p-4">
                <div className="text-sm font-semibold text-zinc-200 mb-3">Deadliest enemies (contact)</div>
                <div className="space-y-2">
                  {byKiller.map(([k, n]) => <Bar key={k} label={k} n={n} total={deaths.filter((d) => d.cause === 'enemy').length} color="#f43f5e" />)}
                  {byKiller.length === 0 && <div className="text-xs text-zinc-500">No enemy-contact deaths yet.</div>}
                </div>
              </div>
            </div>

            <div className="text-sm font-semibold text-zinc-200 mb-2">Death maps — hot-spots per level</div>
            <div className="grid gap-3 mb-5">
              {LEVELS.map((_, i) => <LevelMap key={i} levelIndex={i} deaths={deathsByLevel(i)} />)}
            </div>

            <div className="rounded-xl border border-violet-900/50 bg-zinc-950/60 p-4">
              <div className="text-sm font-semibold text-zinc-200 mb-3">Recent runs</div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-zinc-500 text-left">
                    <tr><th className="py-1 pr-4">When</th><th className="pr-4">Outcome</th><th className="pr-4">Reached</th><th className="pr-4">Score</th><th className="pr-4">Deaths</th><th className="pr-4">Duration</th></tr>
                  </thead>
                  <tbody className="text-zinc-300">
                    {recentRuns.map((r, i) => (
                      <tr key={i} className="border-t border-zinc-800/60">
                        <td className="py-1 pr-4 text-zinc-500">{new Date(r.ts).toLocaleString()}</td>
                        <td className="pr-4">{r.outcome === 'win' ? <span className="text-emerald-400">win</span> : <span className="text-red-400">game over</span>}</td>
                        <td className="pr-4">L{r.levelReached}</td>
                        <td className="pr-4">{r.score}</td>
                        <td className="pr-4">{r.deaths}</td>
                        <td className="pr-4">{Math.round(r.durationMs / 1000)}s</td>
                      </tr>
                    ))}
                    {recentRuns.length === 0 && <tr><td colSpan={6} className="py-2 text-zinc-500">No completed runs yet.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
