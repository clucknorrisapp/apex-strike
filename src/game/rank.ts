// APEX RANK — an uncapped prestige ladder that gives banked Apex Shards a purpose forever.
// The Armory sink caps at 705 shards (~11 clears); past that, every shard a run pays out is dead
// weight — bounties, contracts and pods all bank into a black hole. ENLISTING converts banked shards
// into permanent account Rank on a rising triangular curve, so those shard sources always matter.
//
// Rank is COSMETIC — it buys NO in-run power (a title on the boards + a flex frame), so the score
// ladders stay pure. Local ledger in localStorage; a dedicated server board ranks players by Rank.

import { loadMeta, saveMeta } from './meta'

const KEY = 'apex_rank'
export const STEP = 25   // shards for the FIRST rank; rank R costs STEP*R, so the climb steepens forever

export interface RankState { enlisted: number }   // total shards ever enlisted (monotonic, never spent back)

export function loadRank(): RankState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { enlisted: 0 }
    const r = JSON.parse(raw)
    return { enlisted: Math.max(0, Math.floor(Number(r?.enlisted) || 0)) }
  } catch { return { enlisted: 0 } }
}

export function saveRank(r: RankState): void {
  try { localStorage.setItem(KEY, JSON.stringify({ enlisted: Math.max(0, Math.floor(r.enlisted)) })) } catch { /* storage blocked */ }
}

// Cumulative shards to REACH rank R = STEP * (1+2+…+R) = STEP * R*(R+1)/2 (triangular).
export function cumulativeCost(rank: number): number { return rank <= 0 ? 0 : (STEP * rank * (rank + 1)) / 2 }

// Rank achieved for an enlisted total = largest R with cumulativeCost(R) <= enlisted.
// Closed-form inverse of the triangular curve, then a tiny correction loop so exact boundaries are
// never off-by-one from floating-point sqrt error.
export function rankForEnlisted(enlisted: number): number {
  if (enlisted < STEP) return 0
  let r = Math.floor((-1 + Math.sqrt(1 + (8 * enlisted) / STEP)) / 2)
  while (cumulativeCost(r + 1) <= enlisted) r++
  while (r > 0 && cumulativeCost(r) > enlisted) r--
  return r
}

// Shards still needed to reach the NEXT rank from the current enlisted total.
export function toNextRank(enlisted: number): number {
  const r = rankForEnlisted(enlisted)
  return cumulativeCost(r + 1) - enlisted
}

export function currentRank(): number { return rankForEnlisted(loadRank().enlisted) }

// Prestige title band for a rank number — every 5 ranks promotes to the next title.
const TITLES = ['RECRUIT', 'OPERATIVE', 'SPECIALIST', 'VETERAN', 'ELITE', 'APEX', 'WARLORD', 'LEGEND', 'MYTHIC']
export function rankTitle(rank: number): string {
  if (rank <= 0) return 'UNRANKED'
  return TITLES[Math.min(TITLES.length - 1, Math.floor((rank - 1) / 5))]
}

// Compact badge for rendering beside a handle on the boards, e.g. "Lv12".
export function rankBadge(rank: number): string { return rank > 0 ? 'Lv' + rank : '' }

// INSIGNIA — a per-title-band glyph + color so a high rank *reads* as earned at a glance instead of
// every prestige badge looking identical. Band = the same 5-rank promotion step as rankTitle (0..8,
// one per TITLE), so glyph/color/title always agree. Glyphs escalate humble→radiant; colors climb
// slate→sky→cyan→emerald→indigo→violet→fuchsia→gold→rose. All glyphs are BMP symbols already proven
// to render in the game's canvas monospace (· › » ▸ ◆ ✦ ★ elsewhere in the UI).
function rankBand(rank: number): number { return Math.min(TITLES.length - 1, Math.floor((rank - 1) / 5)) }
const BAND_GLYPHS = ['·', '›', '»', '▸', '◆', '✦', '★', '✷', '✹']
const BAND_COLORS = ['#94a3b8', '#7dd3fc', '#67e8f9', '#6ee7b7', '#a5b4fc', '#c4b5fd', '#f0abfc', '#fbbf24', '#fb7185']

// Escalating insignia glyph for a rank's title band (empty when unranked).
export function prestigeGlyph(rank: number): string { return rank > 0 ? BAND_GLYPHS[rankBand(rank)] : '' }

// Escalating insignia color for a rank's title band (muted gray when unranked).
export function rankBandColor(rank: number): string { return rank > 0 ? BAND_COLORS[rankBand(rank)] : '#52525b' }

// Move up to `n` banked shards (default: ALL banked) from meta into enlisted. Conserves total
// currency (meta.shards + enlisted is invariant across the move) and returns the resulting rank.
export function enlist(n?: number): number {
  const m = loadMeta()
  const move = Math.max(0, Math.min(n == null ? m.shards : Math.floor(n), m.shards))
  if (move <= 0) return rankForEnlisted(loadRank().enlisted)
  const r = loadRank()
  r.enlisted += move
  m.shards -= move
  saveMeta(m)
  saveRank(r)
  return rankForEnlisted(r.enlisted)
}
