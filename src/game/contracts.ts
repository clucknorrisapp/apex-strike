// WEEKLY CONTRACTS — a battle-pass-lite checklist of CUMULATIVE goals that fill across many runs in
// a week (500 kills, 10 bosses, 5 wins, 300 grazes…), paying Apex Shards as each completes plus a
// capstone bonus for finishing all four. Unlike Daily Bounties (which read one run's peak stats),
// contracts accumulate run-to-run — a weekly heartbeat that rewards coming back across several days.
// The four are seeded by the ISO week key (deterministic + shared), tracked per-device, and reset on
// the weekly rollover. Local-only, no new art.

import { weekKey } from './rush'

export type ContractMetric = 'kills' | 'bosses' | 'wins' | 'grazes'
export interface Contract { id: string; label: string; metric: ContractMetric; need: number; reward: number }
// One run's contribution toward the weekly totals, folded at run end.
export interface ContractDelta { kills: number; bosses: number; win: number; grazes: number }

const CAPSTONE = 20   // bonus shards for clearing all four contracts in a week

const POOL: Contract[] = [
  { id: 'k500',  label: 'Defeat 500 enemies this week', metric: 'kills',  need: 500,  reward: 8 },
  { id: 'k1000', label: 'Defeat 1000 enemies this week', metric: 'kills', need: 1000, reward: 14 },
  { id: 'b10',   label: 'Down 10 bosses this week',       metric: 'bosses', need: 10,  reward: 10 },
  { id: 'b20',   label: 'Down 20 bosses this week',       metric: 'bosses', need: 20,  reward: 16 },
  { id: 'w3',    label: 'Win 3 runs this week',           metric: 'wins',   need: 3,   reward: 12 },
  { id: 'w5',    label: 'Win 5 runs this week',           metric: 'wins',   need: 5,   reward: 18 },
  { id: 'g300',  label: 'Graze 300 bolts this week',      metric: 'grazes', need: 300, reward: 8 },
  { id: 'g600',  label: 'Graze 600 bolts this week',      metric: 'grazes', need: 600, reward: 14 },
]

function seeded(key: string): () => number {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) h = (Math.imul(h ^ key.charCodeAt(i), 16777619)) >>> 0
  return () => { h = (Math.imul(h, 1664525) + 1013904223) >>> 0; return h / 4294967296 }
}

// The week's four contracts: shuffle by the week seed, take one per distinct metric (all four metrics).
export function weekContracts(week: string = weekKey()): Contract[] {
  const rng = seeded('contract:' + week)
  const a = [...POOL]
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t }
  const out: Contract[] = []
  const seen = new Set<ContractMetric>()
  for (const c of a) { if (!seen.has(c.metric)) { seen.add(c.metric); out.push(c) } if (out.length === 4) break }
  return out
}

const KEY = 'apex_contracts_v1'
interface State { week: string; progress: Record<string, number>; claimed: string[]; capstone: boolean }

export function loadContractState(week: string = weekKey()): State {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}')
    if (s && s.week === week && s.progress && Array.isArray(s.claimed)) {
      return { week, progress: s.progress, claimed: s.claimed.filter((x: unknown) => typeof x === 'string'), capstone: !!s.capstone }
    }
  } catch { /* fall through to a fresh week */ }
  return { week, progress: {}, claimed: [], capstone: false }
}
function saveState(s: State) { try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* storage blocked */ } }

// Progress fraction per contract for the UI (current / need, capped at need).
export function contractProgress(week: string = weekKey()): { list: { c: Contract; have: number; done: boolean }[]; done: number; total: number } {
  const st = loadContractState(week)
  const claimed = new Set(st.claimed)
  const list = weekContracts(week).map((c) => {
    const have = Math.min(c.need, st.progress[c.metric] || 0)
    return { c, have, done: claimed.has(c.id) || have >= c.need }
  })
  return { list, done: list.filter((x) => x.done).length, total: list.length }
}

// Fold one finished run into the weekly totals, then pay out any newly-completed contracts (plus the
// capstone once all four are done). Returns what completed + the total shard reward; caller banks it.
export function foldRun(week: string, delta: ContractDelta): { completed: Contract[]; reward: number; capstone: boolean } {
  const st = loadContractState(week)
  const add = (m: ContractMetric, n: number) => { st.progress[m] = (st.progress[m] || 0) + Math.max(0, n) }
  add('kills', delta.kills); add('bosses', delta.bosses); add('wins', delta.win); add('grazes', delta.grazes)

  const claimed = new Set(st.claimed)
  const completed: Contract[] = []
  let reward = 0
  for (const c of weekContracts(week)) {
    if (claimed.has(c.id)) continue
    if ((st.progress[c.metric] || 0) >= c.need) { claimed.add(c.id); completed.push(c); reward += c.reward }
  }
  st.claimed = [...claimed]
  let capstone = false
  if (!st.capstone && weekContracts(week).every((c) => claimed.has(c.id))) { st.capstone = true; capstone = true; reward += CAPSTONE }
  saveState(st)
  return { completed, reward, capstone }
}
