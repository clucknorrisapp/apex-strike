// Client for our own leaderboard API (served same-origin by server/index.js).
// Everything degrades silently: if the board is offline or no wallet is connected,
// submits no-op and fetches return an empty offline board — the game never blocks on it.

export interface BoardRow { wallet: string; handle: string | null; score: number; sector: number }
export interface BoardYou { handle: string | null; score: number; sector: number; rank: number }
export interface RivalRow { handle: string | null; score: number }   // the named rank one rung above you
export interface BoardData { online: boolean; top: BoardRow[]; you: BoardYou | null; next: RivalRow | null }
// What a score POST hands back: authoritative rank + rival computed after the upsert commits.
export interface SubmitResult { ok: boolean; best: { score: number; sector: number } | null; rank: number | null; next: RivalRow | null }

const WALLET_RE = /^0x[0-9a-fA-F]{40}$/

export function myWallet(): string | null {
  try { const w = localStorage.getItem('apex_wallet'); return w && WALLET_RE.test(w) ? w.toLowerCase() : null } catch { return null }
}
export function hasWallet(): boolean { return !!myWallet() }
export function localHandle(): string { try { return localStorage.getItem('apex_handle') || '' } catch { return '' } }
function cacheHandle(h: string) { try { localStorage.setItem('apex_handle', h) } catch { /* ignore */ } }

export function cleanHandle(h: string): string {
  return h.replace(/[^A-Za-z0-9 _-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16)
}

export async function fetchLeaderboard(): Promise<BoardData> {
  try {
    const w = myWallet()
    const res = await fetch('/api/leaderboard' + (w ? '?wallet=' + w : ''), { headers: { accept: 'application/json' } })
    const d = await res.json()
    return { online: !!d.online, top: Array.isArray(d.top) ? d.top : [], you: d.you || null, next: d.next || null }
  } catch { return { online: false, top: [], you: null, next: null } }
}

// Post a run to the global board and return the authoritative rank + rival the server
// computes after the upsert commits. keepalive lets the POST survive scene teardown, yet
// the death screen can still await this promise (the page stays up) to render the real rank
// with no POST-then-GET race. Returns null when there's nothing to post (no wallet / offline).
export async function submitScore(score: number, sector: number): Promise<SubmitResult | null> {
  const wallet = myWallet()
  if (!wallet) return null
  const handle = localHandle()
  try {
    const res = await fetch('/api/scores', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ wallet, handle: handle || undefined, score: Math.max(0, Math.round(score)), sector }),
      keepalive: true,
    })
    if (!res.ok) return null
    const d = await res.json()
    return { ok: !!d.ok, best: d.best || null, rank: typeof d.rank === 'number' ? d.rank : null, next: d.next || null }
  } catch { return null }   // offline / no board — caller falls back to the local Best line
}

// ---- Daily Challenge board (scoped by UTC day) ----
export interface DailyData { online: boolean; day: string; top: BoardRow[]; you: BoardYou | null; next: RivalRow | null }

export async function fetchDaily(day: string): Promise<DailyData> {
  try {
    const w = myWallet()
    const res = await fetch('/api/daily?day=' + encodeURIComponent(day) + (w ? '&wallet=' + w : ''), { headers: { accept: 'application/json' } })
    const d = await res.json()
    return { online: !!d.online, day, top: Array.isArray(d.top) ? d.top : [], you: d.you || null, next: d.next || null }
  } catch { return { online: false, day, top: [], you: null, next: null } }
}

export async function submitDaily(day: string, score: number, sector: number): Promise<void> {
  const wallet = myWallet()
  if (!wallet) return
  try {
    await fetch('/api/daily/scores', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ day, wallet, handle: localHandle() || undefined, score: Math.max(0, Math.round(score)), sector }),
      keepalive: true,
    })
  } catch { /* offline / no board — ignore */ }
}

// ---- Weekly APEX TRIALS board (scoped by ISO week key; row.sector = bosses cleared 0..7) ----
export interface TrialsData { online: boolean; week: string; top: BoardRow[]; you: BoardYou | null; next: RivalRow | null }

export async function fetchTrials(week: string): Promise<TrialsData> {
  try {
    const w = myWallet()
    const res = await fetch('/api/trials?week=' + encodeURIComponent(week) + (w ? '&wallet=' + w : ''), { headers: { accept: 'application/json' } })
    const d = await res.json()
    return { online: !!d.online, week, top: Array.isArray(d.top) ? d.top : [], you: d.you || null, next: d.next || null }
  } catch { return { online: false, week, top: [], you: null, next: null } }
}

// Post a TRIALS run and return the authoritative weekly rank + rival the server computes after the
// upsert commits (mirrors submitScore, so the Trials results screen shows a real standing). bosses =
// how many of the 7 gauntlet bosses fell this run. No-ops (returns null) with no wallet / offline.
export async function submitTrials(week: string, score: number, bosses: number): Promise<SubmitResult | null> {
  const wallet = myWallet()
  if (!wallet) return null
  try {
    const res = await fetch('/api/trials/scores', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ week, wallet, handle: localHandle() || undefined, score: Math.max(0, Math.round(score)), sector: Math.max(0, Math.min(7, Math.round(bosses))) }),
      keepalive: true,
    })
    if (!res.ok) return null
    const d = await res.json()
    return { ok: !!d.ok, best: d.best || null, rank: typeof d.rank === 'number' ? d.rank : null, next: d.next || null }
  } catch { return null }
}

export async function setHandle(handle: string): Promise<boolean> {
  const clean = cleanHandle(handle)
  if (!clean) return false
  cacheHandle(clean)                    // cache locally so it tags future scores even offline
  const wallet = myWallet()
  if (!wallet) return true
  try {
    const res = await fetch('/api/handle', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ wallet, handle: clean }),
    })
    return res.ok
  } catch { return false }
}
