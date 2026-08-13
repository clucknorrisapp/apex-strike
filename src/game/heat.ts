// APEX HEAT — an ascension difficulty ladder. Once you've cleared the campaign, stacking Heat tiers
// unlock one at a time: each is a fixed bundle of multipliers on knobs the engine already exposes
// (enemy HP + speed, elite density, powerup scarcity), with its own per-tier score board. "I beat the
// game" becomes "I've only cleared Heat 6." Local unlock state mirrors the Daily-streak helpers; the
// modifiers are pure so they're trivially testable. No new art, no new combat code.

const HEAT_NAMES = ['HARDENED', 'RELENTLESS', 'MERCILESS', 'SAVAGE', 'BRUTAL', 'NIGHTMARE', 'APEX', 'ASCENDANT']
export const MAX_HEAT = HEAT_NAMES.length   // 8

export interface HeatMod {
  tier: number
  name: string
  hp: number       // enemy max-HP multiplier
  spd: number      // enemy move-speed multiplier
  elite: number    // elite-chance multiplier
  pods: number     // powerup drop-rate multiplier (scarcer as heat rises)
}

const clampTier = (t: number) => Math.max(0, Math.min(MAX_HEAT, Math.floor(t || 0)))

// Tier 0 = no heat (the normal campaign). Tiers 1..MAX escalate on a smooth curve.
export function heatMods(tier: number): HeatMod {
  const t = clampTier(tier)
  if (t === 0) return { tier: 0, name: '', hp: 1, spd: 1, elite: 1, pods: 1 }
  return {
    tier: t,
    name: HEAT_NAMES[t - 1],
    hp: 1 + t * 0.22,                          // +22% HP/tier → Heat 8 ≈ 2.76x
    spd: 1 + t * 0.05,                         // +5% speed/tier → Heat 8 = 1.40x
    elite: 1 + t * 0.35,                       // elites get denser
    pods: Math.max(0.5, 1 - t * 0.06),         // drops get scarcer (floor 0.5x)
  }
}

const KEY = 'apex_heat_unlocked'
// The highest Heat tier the player may select. 0 = Heat still locked (clear the campaign to reach 1).
export function loadHeatUnlocked(): number {
  try { return clampTier(Number(localStorage.getItem(KEY))) } catch { return 0 }
}
// Raise the unlock ceiling (never lowers it). Clearing Heat N — or the base campaign (N=0) — unlocks N+1.
export function noteCampaignClear(heatTier: number): { unlocked: number; raised: boolean } {
  const cur = loadHeatUnlocked()
  const next = Math.min(MAX_HEAT, clampTier(heatTier) + 1)
  const raised = next > cur
  if (raised) { try { localStorage.setItem(KEY, String(next)) } catch { /* storage blocked */ } }
  return { unlocked: Math.max(cur, next), raised }
}
