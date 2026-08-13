// Per-sector SPLITS — your best cumulative clear-time at each campaign sector, speedrun-style.
// "Cumulative" = milliseconds from run start to the moment you clear that sector. We keep the
// fastest time per sector (per device) and surface the delta on every clear, giving campaign runs
// a personal-best improvement loop on top of the score chase. Local-only, like the Daily streak.

const KEY = 'apex_splits_v1'
export type Splits = Record<string, number>   // sector number (string key) -> best cumulative ms

export function loadSplits(): Splits {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || '{}')
    return o && typeof o === 'object' && !Array.isArray(o) ? o : {}
  } catch { return {} }
}

// Record a clear time for `sector`. Returns the best after this run, the delta vs the previous best
// (ms; negative = faster), whether this run set a new best, and whether it's the first-ever clear.
export function recordSplit(sector: number, cumulativeMs: number): { best: number; delta: number; record: boolean; first: boolean } {
  const ms = Math.max(0, Math.round(cumulativeMs))
  const s = loadSplits()
  const k = String(sector)
  const prev = s[k]
  const first = typeof prev !== 'number'
  const record = first || ms < prev
  const best = record ? ms : prev
  if (record) {
    s[k] = ms
    try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* storage blocked — splits just won't persist */ }
  }
  return { best, delta: first ? 0 : ms - prev, record, first }
}

// m:ss.d — a clean stopwatch string (tenths of a second).
export function fmtTime(ms: number): string {
  const tenths = Math.max(0, Math.round(ms / 100))
  const m = Math.floor(tenths / 600)
  const s = (tenths - m * 600) / 10
  return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1)
}

// Signed delta like "−2.1s" / "+3.0s" (a true minus glyph for the ahead case).
export function fmtDelta(ms: number): string {
  const secs = Math.round(Math.abs(ms) / 100) / 10
  return (ms <= 0 ? '−' : '+') + secs.toFixed(1) + 's'
}
