// APEX TRIALS — a weekly-rotating Boss Rush that recycles all 7 finished bosses into one
// back-to-back gauntlet (no sectors, no ambient waves — just boss after boss). The order is
// seeded by the ISO week, so everyone faces the same sequence that week (shareable + fair) and
// it rerolls every Monday. Local-best only for now; a weekly server board is a fast-follow.

export const RUSH_BOSSES = ['reaper', 'brute', 'tyrant', 'warden', 'sentinel', 'wraith', 'revenant']

// ISO-week key (YYYY-Www), UTC — the same order for everyone that week; rolls Monday 00:00 UTC.
export function weekKey(d = new Date()): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const day = (t.getUTCDay() + 6) % 7                 // Mon=0 … Sun=6
  t.setUTCDate(t.getUTCDate() - day + 3)               // shift to this week's Thursday (ISO anchor)
  const firstThu = Date.UTC(t.getUTCFullYear(), 0, 4)
  const week = 1 + Math.round((t.getTime() - firstThu) / 86400000 / 7)
  return t.getUTCFullYear() + '-W' + String(week).padStart(2, '0')
}

// Deterministic Fisher–Yates shuffle of the 7 bosses, seeded from the week key (LCG PRNG).
export function bossOrderForWeek(key: string): string[] {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) h = (Math.imul(h ^ key.charCodeAt(i), 16777619)) >>> 0
  const rng = () => { h = (Math.imul(h, 1664525) + 1013904223) >>> 0; return h / 4294967296 }
  const a = [...RUSH_BOSSES]
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const tmp = a[i]; a[i] = a[j]; a[j] = tmp }
  return a
}

// Local best (per-device) — honest motivator like the Daily streak, no server yet.
const BKEY = 'apex_trials_best'
export function loadTrialsBest(): number {
  try { return Math.max(0, Math.floor(Number(localStorage.getItem(BKEY)) || 0)) } catch { return 0 }
}
export function saveTrialsBest(score: number): { best: number; record: boolean; prevBest: number } {
  const prevBest = loadTrialsBest()
  const s = Math.max(0, Math.round(score))
  const record = s > prevBest
  const best = Math.max(prevBest, s)
  if (record) { try { localStorage.setItem(BKEY, String(best)) } catch { /* storage blocked */ } }
  return { best, record, prevBest }
}
