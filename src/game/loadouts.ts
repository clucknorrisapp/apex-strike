// APEX LOADOUTS — "Strike Doctrines". A pre-run identity choice so a campaign run no longer boots
// identically every time: each Doctrine is a starting weapon (pre-mastered), a reshaped stat profile,
// and one signature passive. Doctrines are SIDE-GRADES with trade-offs (glass vs tanky, DPS vs
// utility), not power creep — the whole point is expression, not a strictly-best pick. The engine can
// already boot a run from a kit descriptor (the Daily system proves it), so this just layers on top of
// applyArmory. Local selection in localStorage; no new art.

// 'none' is the neutral runtime state for modes that ignore the Armory/Doctrine kit (Daily, Trials) —
// no Doctrine ever carries it; it just switches every passive check off so those boards stay equal-kit.
export type DoctrinePassive = 'none' | 'refund' | 'ignite' | 'pierce' | 'rampage' | 'guard'
export type WeaponId = 'normal' | 'spread' | 'rapid' | 'laser' | 'fire' | 'arc'

export interface Doctrine {
  id: string
  name: string
  blurb: string
  hex: string
  glyph: string
  startWeapon: WeaponId
  startMastery: number   // 0-2 stars pre-banked on the start weapon
  dHealth: number        // layered onto the Armory result (max hearts)
  dLives: number
  dFire: number          // added to fireBonus (positive = faster base fire)
  dJumps: number         // extra air-jumps
  passive: DoctrinePassive
  passiveText: string    // one-line description of the signature passive
}

export const DOCTRINES: Doctrine[] = [
  { id: 'vanguard',   name: 'VANGUARD',   blurb: 'balanced all-rounder — the safe pick',          hex: '#a5b4fc', glyph: '◆',
    startWeapon: 'normal', startMastery: 0, dHealth: 0, dLives: 0, dFire: 0,   dJumps: 0, passive: 'refund',  passiveText: 'a PUNISH crit refunds dash cooldown' },
  { id: 'pyro',       name: 'PYRO',       blurb: 'FIRE★ · +1 heart · slower base fire',           hex: '#fb923c', glyph: '🔥',
    startWeapon: 'fire',   startMastery: 1, dHealth: 1, dLives: 0, dFire: -8,  dJumps: 0, passive: 'ignite',  passiveText: 'a burning kill spreads fire to a nearby foe' },
  { id: 'lancer',     name: 'LANCER',     blurb: 'LASER★ · glass (−1 heart)',                     hex: '#e879f9', glyph: '⟶',
    startWeapon: 'laser',  startMastery: 1, dHealth: -1, dLives: 0, dFire: 6,  dJumps: 0, passive: 'pierce',  passiveText: 'the laser pierces one extra enemy' },
  { id: 'gunslinger', name: 'GUNSLINGER', blurb: 'RAPID★ · +1 air-jump',                          hex: '#fbbf24', glyph: '✦',
    startWeapon: 'rapid',  startMastery: 1, dHealth: 0, dLives: 0, dFire: 0,   dJumps: 1, passive: 'rampage', passiveText: 'fire rate climbs as your combo grows' },
  { id: 'bastion',    name: 'BASTION',    blurb: 'SPREAD★ · +2 hearts +1 life · slow',            hex: '#4ade80', glyph: '⛨',
    startWeapon: 'spread', startMastery: 1, dHealth: 2, dLives: 1, dFire: -12, dJumps: 0, passive: 'guard',   passiveText: 'spread fires an extra pellet' },
]

const KEY = 'apex_doctrine'

export function loadSelected(): string {
  try { const id = localStorage.getItem(KEY); return DOCTRINES.some((d) => d.id === id) ? (id as string) : 'vanguard' } catch { return 'vanguard' }
}
export function saveSelected(id: string): void {
  if (!DOCTRINES.some((d) => d.id === id)) return
  try { localStorage.setItem(KEY, id) } catch { /* storage blocked */ }
}
export function doctrineById(id: string): Doctrine { return DOCTRINES.find((d) => d.id === id) || DOCTRINES[0] }
export function selectedDoctrine(): Doctrine { return doctrineById(loadSelected()) }
