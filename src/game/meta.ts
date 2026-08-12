// Apex Armory — persistent meta-progression. Apex Shards collected in runs bank here
// (localStorage) and are spent on permanent upgrades that apply at the start of every
// run. This turns the campaign from a one-shot arcade run into a roguelite growth loop:
// every run pays out, and each upgrade lets you push a little further.

export type UpgradeKey = 'vitality' | 'reserves' | 'firepower' | 'boots' | 'dash'

export interface Meta {
  shards: number                       // banked, spendable currency
  up: Record<UpgradeKey, number>       // owned tier per upgrade (0..max)
}

export interface UpgradeDef {
  key: UpgradeKey
  name: string
  blurb: string            // what one tier does
  max: number
  costs: number[]          // shard cost of each tier (length === max)
  hex: string              // accent colour
  glyph: string
}

// Costs escalate so early tiers are ~1–2 runs of shards and deep tiers are a grind.
// A full 6-sector run yields on the order of ~60–70 shards.
export const UPGRADES: UpgradeDef[] = [
  { key: 'vitality',  name: 'VITALITY',      blurb: '+1 max heart',        max: 3, costs: [20, 45, 90],  hex: '#4ade80', glyph: '♥' },
  { key: 'reserves',  name: 'RESERVES',      blurb: '+1 starting life',    max: 2, costs: [30, 75],      hex: '#67e8f9', glyph: '⛊' },
  { key: 'firepower', name: 'FIREPOWER',     blurb: 'faster fire (all guns)', max: 3, costs: [25, 55, 105], hex: '#fbbf24', glyph: '⚡' },
  { key: 'boots',     name: 'KINETIC BOOTS', blurb: '+1 air-jump',         max: 2, costs: [35, 85],      hex: '#c084fc', glyph: '➶' },
  { key: 'dash',      name: 'PHASE DASH',    blurb: 'unlock a dodge-dash (i-frames)', max: 2, costs: [45, 95], hex: '#22d3ee', glyph: '»' },
]

const KEY = 'apex_meta'
const DEFAULT: Meta = { shards: 0, up: { vitality: 0, reserves: 0, firepower: 0, boots: 0, dash: 0 } }

const clampTier = (v: unknown, max: number): number => {
  const n = Math.floor(Number(v) || 0)
  return n < 0 ? 0 : n > max ? max : n
}

export function loadMeta(): Meta {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { shards: 0, up: { ...DEFAULT.up } }
    const m = JSON.parse(raw)
    const up = m?.up || {}
    return {
      shards: Math.max(0, Math.floor(Number(m?.shards) || 0)),
      up: {
        vitality:  clampTier(up.vitality,  3),
        reserves:  clampTier(up.reserves,  2),
        firepower: clampTier(up.firepower, 3),
        boots:     clampTier(up.boots,     2),
        dash:      clampTier(up.dash,      2),
      },
    }
  } catch {
    return { shards: 0, up: { ...DEFAULT.up } }
  }
}

export function saveMeta(m: Meta): void {
  try { localStorage.setItem(KEY, JSON.stringify(m)) } catch { /* storage blocked */ }
}

// Add (or subtract) banked shards; persists immediately so nothing is lost on a crash/close.
export function bankShards(n: number): number {
  const m = loadMeta()
  m.shards = Math.max(0, m.shards + n)
  saveMeta(m)
  return m.shards
}

const defFor = (key: UpgradeKey): UpgradeDef => UPGRADES.find((u) => u.key === key)!

// Cost of the NEXT tier, or null if maxed.
export function nextCost(key: UpgradeKey, tier: number): number | null {
  const def = defFor(key)
  return tier >= def.max ? null : def.costs[tier]
}

// Attempt to buy the next tier. Returns the updated Meta (unchanged if maxed / unaffordable).
export function buyUpgrade(key: UpgradeKey): Meta {
  const m = loadMeta()
  const tier = m.up[key]
  const cost = nextCost(key, tier)
  if (cost == null || m.shards < cost) return m
  m.shards -= cost
  m.up[key] = tier + 1
  saveMeta(m)
  return m
}
