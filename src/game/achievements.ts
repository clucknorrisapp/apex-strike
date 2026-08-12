// Apex Badges — a persistent, per-device achievement set (localStorage), the completionist
// long-tail past the campaign. Every predicate is satisfiable from state the game already
// tracks, so unlocking is pure surfacing of latent progress. Honest + serverless, like the
// Daily streak: a motivator, not an audited stat (localStorage is per-device).

// What one finished run reports. Everything here is already tracked by the scene.
export interface RunSummary {
  score: number
  kills: number        // kills THIS run
  maxCombo: number     // best combo THIS run
  sector: number       // sector reached (1-based)
  win: boolean         // beat the final boss this run
  noHit: boolean       // took zero damage the whole run
  gunMaxed: boolean    // maxed a weapon's mastery (★★) this run
  dailyStreak: number  // current Daily streak (0 if not a daily / broken)
  shards: number       // Apex Shards collected this run
}

// Lifetime cumulative stats, folded forward each run end.
export interface Life {
  kills: number
  runs: number
  wins: number
  bossMask: number     // bitmask of distinct boss KINDS ever defeated
  bestCombo: number
  shards: number       // gross lifetime shards collected
}

export interface AchState { unlocked: string[]; life: Life }

export interface AchDef {
  id: string
  name: string
  desc: string
  glyph: string
  hex: string
  test: (run: RunSummary, life: Life) => boolean
}

// The 7 campaign bosses, in bit order (matches MainScene's boss kinds).
export const BOSS_KINDS = ['reaper', 'brute', 'tyrant', 'warden', 'sentinel', 'wraith', 'revenant']
const ALL_BOSSES = (1 << BOSS_KINDS.length) - 1   // 127 — every boss defeated

// The badge set. Glyphs are plain unicode (rendered as text, no art assets), matching the Armory.
export const ACHIEVEMENTS: AchDef[] = [
  { id: 'first_blood',   name: 'FIRST BLOOD',   desc: 'Land your first kill',        glyph: '✷', hex: '#f43f5e', test: (_r, l) => l.kills >= 1 },
  { id: 'centurion',     name: 'CENTURION',     desc: '100 lifetime kills',          glyph: '⚔', hex: '#fb923c', test: (_r, l) => l.kills >= 100 },
  { id: 'warlord',       name: 'WARLORD',       desc: '500 lifetime kills',          glyph: '⛨', hex: '#ef4444', test: (_r, l) => l.kills >= 500 },
  { id: 'combo_adept',   name: 'COMBO ADEPT',   desc: 'Reach a ×15 combo',           glyph: '✦', hex: '#22d3ee', test: (_r, l) => l.bestCombo >= 15 },
  { id: 'combo_master',  name: 'COMBO MASTER',  desc: 'Reach a ×30 combo',           glyph: '✧', hex: '#67e8f9', test: (_r, l) => l.bestCombo >= 30 },
  { id: 'boss_breaker',  name: 'BOSS BREAKER',  desc: 'Defeat any sector boss',      glyph: '◈', hex: '#c084fc', test: (_r, l) => l.bossMask !== 0 },
  { id: 'apex_slayer',   name: 'APEX SLAYER',   desc: 'Defeat all 7 bosses',         glyph: '♛', hex: '#fbbf24', test: (_r, l) => (l.bossMask & ALL_BOSSES) === ALL_BOSSES },
  { id: 'champion',      name: 'CHAMPION',      desc: 'Win the campaign',            glyph: '❖', hex: '#4ade80', test: (_r, l) => l.wins >= 1 },
  { id: 'flawless',      name: 'FLAWLESS',      desc: 'Win without taking a hit',    glyph: '❈', hex: '#a5b4fc', test: (r, _l) => r.win && r.noHit },
  { id: 'gun_guru',      name: 'GUN GURU',      desc: "Max a weapon's mastery",      glyph: '★', hex: '#fde047', test: (r, _l) => r.gunMaxed },
  { id: 'daily_devotee', name: 'DAILY DEVOTEE', desc: '7-day Daily streak',          glyph: '☀', hex: '#f59e0b', test: (r, _l) => r.dailyStreak >= 7 },
  { id: 'shardlord',     name: 'SHARDLORD',     desc: 'Collect 200 shards',          glyph: '◆', hex: '#34d399', test: (_r, l) => l.shards >= 200 },
  { id: 'veteran',       name: 'VETERAN',       desc: 'Finish 25 runs',              glyph: '⬢', hex: '#93c5fd', test: (_r, l) => l.runs >= 25 },
]

const KEY = 'apex_ach'
const DEFAULT_LIFE: Life = { kills: 0, runs: 0, wins: 0, bossMask: 0, bestCombo: 0, shards: 0 }

const num = (v: unknown): number => { const n = Math.floor(Number(v) || 0); return n > 0 ? n : 0 }

export function loadAch(): AchState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { unlocked: [], life: { ...DEFAULT_LIFE } }
    const m = JSON.parse(raw)
    const life = m?.life || {}
    const known = new Set(ACHIEVEMENTS.map((a) => a.id))
    return {
      unlocked: Array.isArray(m?.unlocked) ? m.unlocked.filter((x: unknown): x is string => typeof x === 'string' && known.has(x)) : [],
      life: {
        kills: num(life.kills), runs: num(life.runs), wins: num(life.wins),
        bossMask: num(life.bossMask) & ALL_BOSSES, bestCombo: num(life.bestCombo), shards: num(life.shards),
      },
    }
  } catch {
    return { unlocked: [], life: { ...DEFAULT_LIFE } }
  }
}

export function saveAch(st: AchState): void {
  try { localStorage.setItem(KEY, JSON.stringify(st)) } catch { /* storage blocked */ }
}

// Fold a finished run into lifetime stats, then unlock anything newly earned. Returns the newly
// unlocked defs (for the toast queue) — never re-returns an already-owned badge.
export function evalAchievements(run: RunSummary): AchDef[] {
  const st = loadAch()
  const l = st.life
  l.kills += num(run.kills)
  l.runs += 1
  if (run.win) l.wins += 1
  l.bestCombo = Math.max(l.bestCombo, num(run.maxCombo))
  l.shards += num(run.shards)
  const newly: AchDef[] = []
  for (const a of ACHIEVEMENTS) {
    if (st.unlocked.includes(a.id)) continue
    if (a.test(run, l)) { st.unlocked.push(a.id); newly.push(a) }
  }
  saveAch(st)
  return newly
}

// Set a boss's bit the instant it dies, so the slayer mask is durable even mid-run (the
// APEX SLAYER badge then unlocks at the next run-end eval).
export function recordBossKill(kind: string): void {
  const i = BOSS_KINDS.indexOf(kind)
  if (i < 0) return
  const st = loadAch()
  st.life.bossMask |= (1 << i)
  saveAch(st)
}

// For the title screen: how many badges earned out of the total.
export function achievementCount(): { unlocked: number; total: number } {
  return { unlocked: loadAch().unlocked.length, total: ACHIEVEMENTS.length }
}
