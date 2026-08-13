// DAILY BOUNTIES — three rotating objectives, the same for everyone each UTC day, that pay out
// Apex Shards (the Armory currency) the first time you meet them. A light daily engagement loop on
// top of the Daily Challenge: a reason to come back, and a shard top-up for the meta grind. Which
// three show, and their order, are seeded by the day key so they're deterministic and shareable;
// completion is tracked per-device in localStorage and resets when the day rolls over.

export type BountyMetric = 'kills' | 'bosses' | 'combo' | 'sector'
export interface Bounty { id: string; label: string; metric: BountyMetric; need: number; reward: number }
// The peak stats of a single run, evaluated at run end.
export interface BountyStat { kills: number; bosses: number; maxCombo: number; sector: number }

// Template pool — 3 with distinct metrics are drawn per day (so you always get variety).
const POOL: Bounty[] = [
  { id: 'k40', label: 'Defeat 40 enemies in a run', metric: 'kills',  need: 40, reward: 3 },
  { id: 'k75', label: 'Defeat 75 enemies in a run', metric: 'kills',  need: 75, reward: 5 },
  { id: 'b2',  label: 'Down 2 bosses in a run',      metric: 'bosses', need: 2,  reward: 4 },
  { id: 'b3',  label: 'Down 3 bosses in a run',      metric: 'bosses', need: 3,  reward: 6 },
  { id: 'c12', label: 'Land a 12× combo',            metric: 'combo',  need: 12, reward: 3 },
  { id: 'c20', label: 'Land a 20× combo',            metric: 'combo',  need: 20, reward: 5 },
  { id: 's3',  label: 'Reach Sector 3',              metric: 'sector', need: 3,  reward: 3 },
  { id: 's5',  label: 'Reach Sector 5',              metric: 'sector', need: 5,  reward: 6 },
]

// Deterministic day-seeded PRNG (FNV-1a hash → LCG), same shape as rush.ts's week shuffle.
function seeded(key: string): () => number {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) h = (Math.imul(h ^ key.charCodeAt(i), 16777619)) >>> 0
  return () => { h = (Math.imul(h, 1664525) + 1013904223) >>> 0; return h / 4294967296 }
}

// The day's three bounties: shuffle the pool by the day seed, then take the first entry of each of
// three distinct metrics (variety), preserving the shuffled order for a stable daily layout.
export function todayBounties(dayKey: string): Bounty[] {
  const rng = seeded('bounty:' + dayKey)
  const a = [...POOL]
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t }
  const out: Bounty[] = []
  const seen = new Set<BountyMetric>()
  for (const b of a) { if (!seen.has(b.metric)) { seen.add(b.metric); out.push(b) } if (out.length === 3) break }
  return out
}

const KEY = 'apex_bounties_v1'
interface State { day: string; done: string[] }

// Load completion for `dayKey`, resetting automatically when the stored day is stale.
export function loadBountyState(dayKey: string): State {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}')
    if (s && s.day === dayKey && Array.isArray(s.done)) return { day: dayKey, done: s.done.filter((x: unknown) => typeof x === 'string') }
  } catch { /* fall through to a fresh day */ }
  return { day: dayKey, done: [] }
}
function saveState(s: State) { try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* storage blocked */ } }

// How many of today's three are already done (for a compact title/screen readout).
export function bountyDoneCount(dayKey: string): number {
  const done = new Set(loadBountyState(dayKey).done)
  return todayBounties(dayKey).filter((b) => done.has(b.id)).length
}
export function isBountyDone(dayKey: string, id: string): boolean { return loadBountyState(dayKey).done.includes(id) }

// Evaluate a finished run against today's still-open bounties. Marks any newly met, persists, and
// returns them plus the total shard reward (the caller banks the shards + toasts). Idempotent: a
// bounty already done never pays out twice.
export function evalBounties(dayKey: string, stat: BountyStat): { newly: Bounty[]; reward: number } {
  const state = loadBountyState(dayKey)
  const done = new Set(state.done)
  const val = (m: BountyMetric) => m === 'kills' ? stat.kills : m === 'bosses' ? stat.bosses : m === 'combo' ? stat.maxCombo : stat.sector
  const newly: Bounty[] = []
  for (const b of todayBounties(dayKey)) {
    if (done.has(b.id)) continue
    if (val(b.metric) >= b.need) { done.add(b.id); newly.push(b) }
  }
  if (newly.length) saveState({ day: dayKey, done: [...done] })
  return { newly, reward: newly.reduce((sum, b) => sum + b.reward, 0) }
}
