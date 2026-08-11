// Daily Challenge — one rotating modifier everyone plays under the same rules each
// day (UTC), with its own daily leaderboard that resets at midnight UTC. Modifiers
// only touch player START stats (health / lives / fire cadence / air-jumps / starting
// weapon) so the run stays the fixed campaign — fair, shared, low blast-radius.
// Armory upgrades are ignored in a daily run: it's a pure-skill board.

export interface DailyMod {
  id: string
  name: string
  blurb: string
  hex: string
  maxHealth?: number     // absolute hearts (default 6)
  lives?: number         // absolute lives (default 3)
  fireBonus?: number     // + = faster fire, - = slower (default 0)
  bonusJumps?: number    // added to the base 2 jumps (default 0)
  weapon?: string        // starting weapon (default 'normal')
}

export const DAILY_MODS: DailyMod[] = [
  { id: 'glass',      name: 'GLASS CANNON', blurb: '1 heart · lightning-fast fire',     hex: '#f43f5e', maxHealth: 1,  fireBonus: 42 },
  { id: 'juggernaut', name: 'JUGGERNAUT',   blurb: '12 hearts · heavy, slower rounds',  hex: '#4ade80', maxHealth: 12, fireBonus: -34 },
  { id: 'sudden',     name: 'SUDDEN DEATH', blurb: 'one life · start with the LASER',   hex: '#e879f9', lives: 1,      weapon: 'laser' },
  { id: 'skywire',    name: 'SKYWIRE',      blurb: 'quad-jump · SPREAD from the start', hex: '#67e8f9', bonusJumps: 2, weapon: 'spread' },
  { id: 'onslaught',  name: 'ONSLAUGHT',    blurb: 'RAPID loadout · only 2 hearts',     hex: '#fb923c', maxHealth: 2,  weapon: 'rapid', fireBonus: 18 },
  { id: 'purist',     name: 'PURIST',       blurb: 'no upgrades, no gimmicks · pure skill', hex: '#a5b4fc' },
]

// UTC day key (YYYY-MM-DD) — same challenge for everyone that day; rolls at 00:00 UTC.
export function todayKey(): string { return new Date().toISOString().slice(0, 10) }

export function modForDay(day: string): DailyMod {
  let h = 0
  for (let i = 0; i < day.length; i++) h = (Math.imul(h, 31) + day.charCodeAt(i)) >>> 0
  return DAILY_MODS[h % DAILY_MODS.length]
}

export function todayMod(): DailyMod { return modForDay(todayKey()) }
