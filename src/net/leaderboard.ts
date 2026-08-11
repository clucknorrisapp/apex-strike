// Client for our own leaderboard API (served same-origin by server/index.js).
// Everything degrades silently: if the board is offline or no wallet is connected,
// submits no-op and fetches return an empty offline board — the game never blocks on it.

export interface BoardRow { wallet: string; handle: string | null; score: number; sector: number }
export interface BoardYou { handle: string | null; score: number; sector: number; rank: number }
export interface BoardData { online: boolean; top: BoardRow[]; you: BoardYou | null }

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
    return { online: !!d.online, top: Array.isArray(d.top) ? d.top : [], you: d.you || null }
  } catch { return { online: false, top: [], you: null } }
}

// Fire-and-forget on run end. keepalive lets the POST survive the scene teardown.
export async function submitScore(score: number, sector: number): Promise<void> {
  const wallet = myWallet()
  if (!wallet) return
  const handle = localHandle()
  try {
    await fetch('/api/scores', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ wallet, handle: handle || undefined, score: Math.max(0, Math.round(score)), sector }),
      keepalive: true,
    })
  } catch { /* offline / no board — ignore */ }
}

// ---- Daily Challenge board (scoped by UTC day) ----
export interface DailyData { online: boolean; day: string; top: BoardRow[]; you: BoardYou | null }

export async function fetchDaily(day: string): Promise<DailyData> {
  try {
    const w = myWallet()
    const res = await fetch('/api/daily?day=' + encodeURIComponent(day) + (w ? '&wallet=' + w : ''), { headers: { accept: 'application/json' } })
    const d = await res.json()
    return { online: !!d.online, day, top: Array.isArray(d.top) ? d.top : [], you: d.you || null }
  } catch { return { online: false, day, top: [], you: null } }
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
