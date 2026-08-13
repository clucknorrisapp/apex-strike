// Client for our own leaderboard API (served same-origin by server/index.js).
// Everything degrades silently: if the board is offline or no wallet is connected,
// submits no-op and fetches return an empty offline board — the game never blocks on it.

export interface BoardRow { wallet: string; handle: string | null; score: number; sector: number; prestige?: number }
export interface BoardYou { handle: string | null; score: number; sector: number; rank: number; prestige?: number }
export interface RivalRow { handle: string | null; score: number; prestige?: number }   // the named rank one rung above you
// prestige = the player's Apex Rank (account prestige ladder), rendered as a Lv badge beside their handle on every board.
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

// PERSISTENT RIVAL — the named rung above you that a board hands back is otherwise forgotten the moment
// you leave the results screen. Pin it locally so the chase spans sessions and passing them can be
// celebrated. Season-scoped (the catchable board), stored { handle, score }.
export interface PinnedRival { handle: string; score: number }
export function loadRival(): PinnedRival | null {
  try {
    const r = JSON.parse(localStorage.getItem('apex_rival') || 'null')
    if (!r || typeof r.score !== 'number' || !r.handle) return null
    // Season-scoped: the Season board resets each month, so a pin from a past month is void — otherwise
    // a stale rival fires a bogus "OVERTOOK" the first run after rollover for a race you never ran. (round-11 bug#2)
    if (r.month !== monthKey()) return null
    return { handle: String(r.handle).slice(0, 16), score: r.score }
  } catch { return null }
}
export function saveRival(r: PinnedRival): void { try { localStorage.setItem('apex_rival', JSON.stringify({ month: monthKey(), handle: String(r.handle).slice(0, 16), score: Math.max(0, Math.round(r.score)) })) } catch { /* storage blocked */ } }
export function clearRival(): void { try { localStorage.removeItem('apex_rival') } catch { /* storage blocked */ } }

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

// ---- MONTHLY SEASON board (calendar-month reset of the campaign-score ladder) ----
// Same score metric as the all-time board, but keyed by month so there's a fresh, catchable race
// every month while the global board stays a permanent all-time record.
export interface SeasonData { online: boolean; month: string; top: BoardRow[]; you: BoardYou | null; next: RivalRow | null }

// Current season key in UTC, e.g. "2026-08". UTC so every player's month flips at the same instant.
export function monthKey(d: Date = new Date()): string {
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0')
}

export async function fetchSeason(month: string): Promise<SeasonData> {
  try {
    const w = myWallet()
    const res = await fetch('/api/season?month=' + encodeURIComponent(month) + (w ? '&wallet=' + w : ''), { headers: { accept: 'application/json' } })
    const d = await res.json()
    return { online: !!d.online, month, top: Array.isArray(d.top) ? d.top : [], you: d.you || null, next: d.next || null }
  } catch { return { online: false, month, top: [], you: null, next: null } }
}

// Post a campaign run to the current month's board and return the authoritative monthly rank + rival
// (mirrors submitScore). Called alongside submitScore on every base-campaign death. No-ops when
// there's no wallet / the board is offline.
export async function submitSeason(month: string, score: number, sector: number): Promise<SubmitResult | null> {
  const wallet = myWallet()
  if (!wallet) return null
  try {
    const res = await fetch('/api/season/scores', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ month, wallet, handle: localHandle() || undefined, score: Math.max(0, Math.round(score)), sector }),
      keepalive: true,
    })
    if (!res.ok) return null
    const d = await res.json()
    return { ok: !!d.ok, best: d.best || null, rank: typeof d.rank === 'number' ? d.rank : null, next: d.next || null }
  } catch { return null }
}

// ---- APEX HEAT ascension board (scoped by heat tier; row.sector = sector reached) ----
export interface AscensionData { online: boolean; heat: number; top: BoardRow[]; you: BoardYou | null; next: RivalRow | null }

export async function fetchAscension(heat: number): Promise<AscensionData> {
  try {
    const w = myWallet()
    const res = await fetch('/api/ascension?heat=' + encodeURIComponent(heat) + (w ? '&wallet=' + w : ''), { headers: { accept: 'application/json' } })
    const d = await res.json()
    return { online: !!d.online, heat, top: Array.isArray(d.top) ? d.top : [], you: d.you || null, next: d.next || null }
  } catch { return { online: false, heat, top: [], you: null, next: null } }
}

// Post an APEX HEAT run and return the authoritative per-tier rank + rival (mirrors submitScore).
export async function submitAscension(heat: number, score: number, sector: number): Promise<SubmitResult | null> {
  const wallet = myWallet()
  if (!wallet) return null
  try {
    const res = await fetch('/api/ascension/scores', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ heat, wallet, handle: localHandle() || undefined, score: Math.max(0, Math.round(score)), sector }),
      keepalive: true,
    })
    if (!res.ok) return null
    const d = await res.json()
    return { ok: !!d.ok, best: d.best || null, rank: typeof d.rank === 'number' ? d.rank : null, next: d.next || null }
  } catch { return null }
}

// ---- Campaign SPEEDRUN board (fastest full-campaign clear; ranked ascending by ms) ----
export interface SpeedRow { wallet: string; handle: string | null; ms: number; sector: number; prestige?: number }
export interface SpeedYou { handle: string | null; ms: number; sector: number; rank: number; prestige?: number }
export interface SpeedRival { handle: string | null; ms: number; prestige?: number }   // the next-faster ghost
export interface SpeedData { online: boolean; top: SpeedRow[]; you: SpeedYou | null; next: SpeedRival | null }
export interface SpeedResult { ok: boolean; best: { ms: number; sector: number } | null; rank: number | null; next: SpeedRival | null }

export async function fetchSpeedruns(): Promise<SpeedData> {
  try {
    const w = myWallet()
    const res = await fetch('/api/speedruns' + (w ? '?wallet=' + w : ''), { headers: { accept: 'application/json' } })
    const d = await res.json()
    return { online: !!d.online, top: Array.isArray(d.top) ? d.top : [], you: d.you || null, next: d.next || null }
  } catch { return { online: false, top: [], you: null, next: null } }
}

// Post a full-campaign clear time and return the authoritative global speed rank + next-faster rival.
export async function submitSpeedrun(ms: number, sector: number): Promise<SpeedResult | null> {
  const wallet = myWallet()
  if (!wallet) return null
  try {
    const res = await fetch('/api/speedruns/scores', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ wallet, handle: localHandle() || undefined, ms: Math.max(1, Math.round(ms)), sector }),
      keepalive: true,
    })
    if (!res.ok) return null
    const d = await res.json()
    return { ok: !!d.ok, best: d.best || null, rank: typeof d.rank === 'number' ? d.rank : null, next: d.next || null }
  } catch { return null }
}

// ---- APEX RANK board (account prestige ladder; row.rank = enlisted rank, ranked DESC) ----
export interface RankRow { wallet: string; handle: string | null; rank: number }
export interface RankYou { handle: string | null; rank: number; pos: number }
export interface RankRival { handle: string | null; rank: number }   // the next player one rung up the ladder
export interface RankData { online: boolean; top: RankRow[]; you: RankYou | null; next: RankRival | null }
export interface RankResult { ok: boolean; rank: number | null; pos: number | null; next: RankRival | null }

export async function fetchRanks(): Promise<RankData> {
  try {
    const w = myWallet()
    const res = await fetch('/api/ranks' + (w ? '?wallet=' + w : ''), { headers: { accept: 'application/json' } })
    const d = await res.json()
    return { online: !!d.online, top: Array.isArray(d.top) ? d.top : [], you: d.you || null, next: d.next || null }
  } catch { return { online: false, top: [], you: null, next: null } }
}

// Post the player's account Rank (climbs only — the server keeps GREATEST). Returns the authoritative
// standing + the next-higher-ranked rival. No-ops (null) with no wallet / offline.
export async function submitRank(rank: number): Promise<RankResult | null> {
  const wallet = myWallet()
  if (!wallet) return null
  try {
    const res = await fetch('/api/rank', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ wallet, handle: localHandle() || undefined, rank: Math.max(0, Math.round(rank)) }),
      keepalive: true,
    })
    if (!res.ok) return null
    const d = await res.json()
    return { ok: !!d.ok, rank: typeof d.rank === 'number' ? d.rank : null, pos: typeof d.pos === 'number' ? d.pos : null, next: d.next || null }
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
