// Level Lab — reusable, game-agnostic editor engine.
// The editor UI only ever speaks in generic EditItems + EntityTypes.
// Each game provides a GameSpec that bridges those to its own level format
// and hands back a play-test mount. Swap the spec → new game, same tool.
import Phaser from 'phaser'
import { MainScene, LEVELS, THEMES, setLabLevels } from '../game/MainScene'
import type { LevelDef, ThemeName } from '../game/MainScene'

export interface PropDef { key: string; label: string; min: number; max: number; step: number; default: number }

export interface EntityType {
  id: string
  label: string
  category: 'enemy' | 'pod' | 'platform' | 'wall' | 'turret' | 'marker' | 'ground'
  color: string
  glyph: string
  sized?: boolean
  props?: PropDef[]
  kinds?: string[] // e.g. pod weapon kinds
}

export interface EditItem {
  iid: string
  type: string
  x: number
  y: number
  w?: number
  h?: number
  props: Record<string, number | string>
}

export interface EditorTheme { bg: string; rim: string; fill: string; ledge: string; accent: string }
export interface LevelMeta { name: string; theme: string; w: number; h: number }

export interface GameSpec {
  id: string
  name: string
  world: { tile: number; jumpReach: number; minH: number }
  themes: Record<string, EditorTheme>
  entities: EntityType[]
  samples(): { name: string; level: unknown }[]
  blankLevel(): unknown
  read(level: unknown): { items: EditItem[]; meta: LevelMeta }
  write(items: EditItem[], meta: LevelMeta): unknown
  mountPlaytest(el: HTMLElement, level: unknown): () => void
}

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0')
let iidN = 0
const nid = () => 'e' + (iidN++)

const ENEMY_WEIGHT: Record<string, number> = { soldier: 1, flyer: 1.2, tank: 2, boss: 6 }

// ---- Apex Strike spec (first client) ----
export const apexSpec: GameSpec = {
  id: 'apex-strike',
  name: 'Apex Strike',
  world: { tile: 24, jumpReach: 300, minH: 700 },
  themes: Object.fromEntries(
    (Object.keys(THEMES) as ThemeName[]).map((k) => {
      const t = THEMES[k]
      return [k, { bg: hex(t.bg), rim: hex(t.rim), fill: hex(t.fill), ledge: hex(t.ledge), accent: hex(t.accent) }]
    })
  ),
  entities: [
    { id: 'soldier', label: 'Grunt', category: 'enemy', color: '#f43f5e', glyph: 'G', props: [{ key: 'hp', label: 'HP', min: 1, max: 30, step: 1, default: 3 }, { key: 'speed', label: 'Speed', min: 20, max: 180, step: 5, default: 65 }] },
    { id: 'flyer', label: 'Drone', category: 'enemy', color: '#a855f7', glyph: 'D', props: [{ key: 'hp', label: 'HP', min: 1, max: 30, step: 1, default: 3 }, { key: 'speed', label: 'Speed', min: 20, max: 180, step: 5, default: 55 }] },
    { id: 'tank', label: 'Tank', category: 'enemy', color: '#ea580c', glyph: 'T', props: [{ key: 'hp', label: 'HP', min: 1, max: 40, step: 1, default: 7 }, { key: 'speed', label: 'Speed', min: 15, max: 120, step: 5, default: 30 }] },
    { id: 'boss', label: 'Boss', category: 'enemy', color: '#dc2626', glyph: 'B', props: [{ key: 'hp', label: 'HP', min: 10, max: 300, step: 5, default: 64 }, { key: 'speed', label: 'Speed', min: 15, max: 120, step: 5, default: 55 }] },
    { id: 'turret', label: 'Turret', category: 'turret', color: '#22d3ee', glyph: 'U' },
    { id: 'pod', label: 'Weapon Pod', category: 'pod', color: '#4ade80', glyph: 'P', kinds: ['spread', 'rapid', 'laser', 'fire', 'health'] },
    { id: 'shard', label: 'Apex Shard', category: 'marker', color: '#67e8f9', glyph: '◆' },
    { id: 'platform', label: 'Platform', category: 'platform', color: '#67e8f9', glyph: '▬', sized: true },
    { id: 'wall', label: 'Wall / Block', category: 'wall', color: '#8b5cf6', glyph: '▮', sized: true },
    { id: 'ground', label: 'Ground span', category: 'ground', color: '#3b2a63', glyph: '⬛', sized: true },
    { id: 'goal', label: 'Extraction Goal', category: 'marker', color: '#fbbf24', glyph: '⚑' },
    { id: 'spawn', label: 'Player Spawn', category: 'marker', color: '#22d3ee', glyph: 'S' },
  ],

  samples: () => LEVELS.map((l) => ({ name: l.name, level: l })),

  blankLevel: (): LevelDef => ({
    name: 'NEW STAGE', theme: 'streets', w: 2400, h: 1200, spawn: [80, 1060], goal: [2200, 620],
    ground: [[0, 2400, 1140]], plats: [], walls: [], turrets: [], enemies: [], pods: [],
  }),

  read: (levelU) => {
    const level = levelU as LevelDef
    const items: EditItem[] = []
    ;(level.ground || []).forEach(([x1, x2, top]) => items.push({ iid: nid(), type: 'ground', x: (x1 + x2) / 2, y: top, w: x2 - x1, props: {} }))
    ;(level.plats || []).forEach(([cx, top, w]) => items.push({ iid: nid(), type: 'platform', x: cx, y: top, w, props: {} }))
    ;(level.walls || []).forEach(([cx, top, w, h]) => items.push({ iid: nid(), type: 'wall', x: cx, y: top, w, h, props: {} }))
    ;(level.turrets || []).forEach(([x, y]) => items.push({ iid: nid(), type: 'turret', x, y, props: {} }))
    ;(level.enemies || []).forEach((e) => items.push({ iid: nid(), type: e.kind, x: e.x, y: e.y, props: { hp: e.hp, speed: e.speed } }))
    ;(level.pods || []).forEach(([x, y, kind]) => items.push({ iid: nid(), type: 'pod', x, y, props: { kind } }))
    ;(level.shards || []).forEach(([x, y]) => items.push({ iid: nid(), type: 'shard', x, y, props: {} }))
    items.push({ iid: nid(), type: 'goal', x: level.goal[0], y: level.goal[1], props: {} })
    items.push({ iid: nid(), type: 'spawn', x: level.spawn[0], y: level.spawn[1], props: {} })
    return { items, meta: { name: level.name, theme: level.theme, w: level.w, h: level.h } }
  },

  write: (items, meta): LevelDef => {
    const R = Math.round
    const ground = items.filter((i) => i.type === 'ground')
      .map((i) => [R(i.x - (i.w || 200) / 2), R(i.x + (i.w || 200) / 2), R(i.y)] as [number, number, number])
      .sort((a, b) => a[0] - b[0])
    const plats = items.filter((i) => i.type === 'platform').map((i) => [R(i.x), R(i.y), R(i.w || 120)] as [number, number, number])
    const walls = items.filter((i) => i.type === 'wall').map((i) => [R(i.x), R(i.y), R(i.w || 80), R(i.h || 120)] as [number, number, number, number])
    const turrets = items.filter((i) => i.type === 'turret').map((i) => [R(i.x), R(i.y)] as [number, number])
    const enemies = items.filter((i) => i.type in ENEMY_WEIGHT).map((i) => ({ kind: i.type, x: R(i.x), y: R(i.y), hp: Number(i.props.hp) || 3, speed: Number(i.props.speed) || 60 }))
    const pods = items.filter((i) => i.type === 'pod').map((i) => [R(i.x), R(i.y), String(i.props.kind || 'spread')] as [number, number, string])
    const shards = items.filter((i) => i.type === 'shard').map((i) => [R(i.x), R(i.y)] as [number, number])
    const goal = items.find((i) => i.type === 'goal')
    const spawn = items.find((i) => i.type === 'spawn')
    return {
      name: meta.name, theme: meta.theme as ThemeName, w: meta.w, h: meta.h,
      spawn: [spawn ? R(spawn.x) : 80, spawn ? R(spawn.y) : meta.h - 140],
      goal: [goal ? R(goal.x) : meta.w - 200, goal ? R(goal.y) : 620],
      ground, plats, walls, turrets, enemies, pods, shards,
    }
  },

  mountPlaytest: (el, levelU) => {
    setLabLevels([levelU as LevelDef])
    const game = new Phaser.Game({
      type: Phaser.AUTO, width: 512, height: 384, parent: el, backgroundColor: '#0a0612',
      physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 1000 }, debug: false } },
      scene: [MainScene], scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      input: { keyboard: true, gamepad: true },
    })
    return () => { game.destroy(true); setLabLevels(null) }
  },
}

export interface Metrics {
  enemyCount: number
  byType: Record<string, number>
  pods: number
  pits: number
  difficulty: number
  warnings: string[]
}

export function computeMetrics(items: EditItem[], meta: LevelMeta, spec: GameSpec): Metrics {
  const isEnemy = (t: string) => spec.entities.find((e) => e.id === t)?.category === 'enemy'
  const enemies = items.filter((i) => isEnemy(i.type))
  const byType: Record<string, number> = {}
  enemies.forEach((e) => { byType[e.type] = (byType[e.type] || 0) + 1 })
  const grounds = items.filter((i) => i.type === 'ground').map((i) => [i.x - (i.w || 0) / 2, i.x + (i.w || 0) / 2]).sort((a, b) => a[0] - b[0])
  const pits: { x: number; w: number }[] = []
  for (let k = 1; k < grounds.length; k++) {
    const gap = grounds[k][0] - grounds[k - 1][1]
    if (gap > 6) pits.push({ x: grounds[k - 1][1], w: gap })
  }
  const difficulty = Math.round(enemies.reduce((s, e) => s + (Number(e.props.hp) || 1) * (ENEMY_WEIGHT[e.type] || 1), 0))

  const warnings: string[] = []
  pits.forEach((p) => { if (p.w > spec.world.jumpReach) warnings.push(`Pit at x≈${Math.round(p.x)} is ${Math.round(p.w)}px wide — beyond the ~${spec.world.jumpReach}px jump reach. Add a bridge platform.`) })
  enemies.filter((e) => e.type === 'soldier' || e.type === 'tank').forEach((e) => {
    const onGround = grounds.some((g) => e.x >= g[0] - 20 && e.x <= g[1] + 20)
    const onPlat = items.some((i) => (i.type === 'platform' || i.type === 'wall') && Math.abs(i.x - e.x) <= (i.w || 0) / 2 + 20 && i.y >= e.y - 10)
    if (!onGround && !onPlat) warnings.push(`${spec.entities.find((t) => t.id === e.type)?.label || e.type} at x≈${Math.round(e.x)} has no ground beneath it — it will fall into a pit.`)
  })
  if (!items.some((i) => i.type === 'spawn')) warnings.push('No player spawn set.')
  if (!items.some((i) => i.type === 'goal') && !enemies.some((e) => e.type === 'boss')) warnings.push('No extraction goal and no boss — the level cannot be cleared.')
  if (meta.h < spec.world.minH) warnings.push(`World height ${meta.h} is short — vertical stages want ≥ ${spec.world.minH}.`)
  return { enemyCount: enemies.length, byType, pods: items.filter((i) => i.type === 'pod').length, pits: pits.length, difficulty, warnings }
}
