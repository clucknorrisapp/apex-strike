import Phaser from 'phaser'

const ASSETS = {
  huntress: '/assets/huntress.png',
  huntress_run: '/assets/huntress_run.png',
  huntress_jump: '/assets/huntress_jump.png',
  huntress_crouch: '/assets/huntress_crouch.png',
  enemy_soldier: '/assets/enemy_soldier.png',
  enemy_flyer: '/assets/enemy_flyer.png',
  enemy_tank: '/assets/enemy_tank.png',
  boss: '/assets/boss.png',
  pickup_pod: '/assets/pickup_pod.png',
  platform_tile: '/assets/platform_tile.png',
  logo: '/assets/logo.png',
}

// Painted per-stage backdrops (real art — replaces the procedural skyline when present)
const WORLD_BG: Record<string, string> = {
  streets: '/assets/bg_streets.webp',
  industrial: '/assets/bg_industrial.webp',
  sky: '/assets/bg_sky.webp',
  core: '/assets/bg_core.webp',
  throne: '/assets/bg_throne.webp',
}

// ---- Feel kit (Contra run-and-gun + Mario-grade jump) ----
const GROUND_ENEMIES = new Set(['soldier', 'tank', 'charger', 'turret'])  // get drop shadows
const RUN = 275          // horizontal top speed
const ACCEL = 1500       // ground acceleration (doubled when reversing = snappy turns)
const AIR_ACCEL = 950
const DRAG = 1700        // deceleration when no input
const GRAV = 900         // rising gravity
const FALL_BOOST = 560   // extra gravity while falling => snappy, asymmetric arc
const JUMP_V = -545      // jump impulse
const SHORT_HOP = -150   // released-early velocity clamp (variable height)
const COYOTE = 110       // ms of grace after leaving a ledge
const BUFFER = 130       // ms a jump press stays "remembered"
const MAX_JUMPS = 2
// How much WORLD width the main camera shows across the canvas. Bigger = pulled
// back = more of the level on screen at once (the Contra "run-and-gun" wide
// view: small hero, enemies visible as they approach). The HUD camera stays at
// 512 so the interface keeps its crisp hi-res scale independent of this.
const WORLD_VIEW_W = 720

// Asset-free procedural sound — short Web-Audio blips, no files needed.
class Sfx {
  private ctx: AudioContext | null = null
  muted = false
  constructor() {
    try {
      const AC = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
      const Ctor = AC.AudioContext || AC.webkitAudioContext
      this.ctx = Ctor ? new Ctor() : null
    } catch { this.ctx = null }
  }
  resume() { this.ctx?.resume?.() }
  setMuted(v: boolean) {
    this.muted = v
    if (this.musicGain && this.ctx) this.musicGain.gain.setTargetAtTime(v ? 0 : this.MUSIC_VOL, this.ctx.currentTime, 0.02)
  }
  private tone(f0: number, f1: number, dur: number, type: OscillatorType, gain: number) {
    const c = this.ctx; if (!c || this.muted) return
    const t = c.currentTime
    const o = c.createOscillator(); const g = c.createGain()
    o.type = type
    o.frequency.setValueAtTime(f0, t)
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur)
    g.gain.setValueAtTime(gain, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g); g.connect(c.destination)
    o.start(t); o.stop(t + dur + 0.02)
  }
  private noise(dur: number, gain: number) {
    const c = this.ctx; if (!c || this.muted) return
    const t = c.currentTime
    const n = Math.floor(c.sampleRate * dur)
    const buf = c.createBuffer(1, n, c.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n)
    const src = c.createBufferSource(); src.buffer = buf
    const g = c.createGain()
    g.gain.setValueAtTime(gain, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(g); g.connect(c.destination); src.start(t)
  }
  shoot() { this.tone(820 + Math.random() * 180, 300, 0.05, 'square', 0.045) }
  jump() { this.tone(420, 780, 0.12, 'square', 0.05) }
  hit() { this.tone(240, 140, 0.05, 'square', 0.035) }
  explode() { this.noise(0.28, 0.09) }
  pickup() { this.tone(620, 1240, 0.16, 'sine', 0.06) }
  hurt() { this.tone(300, 70, 0.28, 'sawtooth', 0.08) }
  stomp() { this.tone(520, 150, 0.1, 'square', 0.06) }
  clear() { this.tone(520, 940, 0.14, 'square', 0.05) }
  dash() { this.tone(200, 520, 0.14, 'sawtooth', 0.05) }
  swap() { this.tone(440, 720, 0.08, 'square', 0.05) }

  // ---- Procedural background music: a subtle driving synth loop ----
  private musicGain: GainNode | null = null
  private musicTimer: ReturnType<typeof setInterval> | null = null
  private musicStep = 0
  private readonly MUSIC_VOL = 0.05
  startMusic() {
    const c = this.ctx
    if (!c || this.musicTimer !== null) return
    this.musicGain = c.createGain()
    this.musicGain.gain.value = this.muted ? 0 : this.MUSIC_VOL
    this.musicGain.connect(c.destination)
    this.musicStep = 0
    const bpm = 138, stepDur = (60 / bpm) / 2 // eighth-note pulse
    const bass = [55, 55, 82.41, 55, 65.41, 55, 82.41, 97.99]       // A-minor drive
    const lead = [220, 0, 261.63, 0, 329.63, 0, 261.63, 391.995]    // arp on top half of the phrase
    const tick = () => {
      const cc = this.ctx
      if (!cc || !this.musicGain) return
      const t = cc.currentTime + 0.06
      const s = this.musicStep % 8
      this.musicNote(bass[s], t, stepDur * 0.92, 'sawtooth', 0.5)
      if (lead[s] > 0 && this.musicStep % 16 < 8) this.musicNote(lead[s], t, stepDur * 0.5, 'square', 0.13)
      this.musicStep++
    }
    tick()
    this.musicTimer = setInterval(tick, stepDur * 1000)
  }
  private musicNote(freq: number, t: number, dur: number, type: OscillatorType, gain: number) {
    const c = this.ctx
    if (!c || !this.musicGain) return
    const o = c.createOscillator(); const g = c.createGain()
    o.type = type; o.frequency.setValueAtTime(freq, t)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain, t + 0.015)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g); g.connect(this.musicGain)
    o.start(t); o.stop(t + dur + 0.02)
  }
  stopMusic() {
    if (this.musicTimer !== null) { clearInterval(this.musicTimer); this.musicTimer = null }
    if (this.musicGain) { try { this.musicGain.disconnect() } catch { /* noop */ } this.musicGain = null }
  }
  dispose() {
    this.stopMusic()
    try { this.ctx?.close?.() } catch { /* noop */ }
    this.ctx = null
  }
}

export type ThemeName = 'streets' | 'industrial' | 'sky' | 'core' | 'throne'

export interface Theme {
  bg: number
  far: number
  mid: number
  rim: number
  fill: number
  ledge: number
  accent: number
}

export const THEMES: Record<ThemeName, Theme> = {
  streets:    { bg: 0x0a0612, far: 0x1a1030, mid: 0x2a1a4d, rim: 0x22d3ee, fill: 0x2c1f4a, ledge: 0x3b2a63, accent: 0xe879f9 },
  industrial: { bg: 0x0f0a07, far: 0x2a1c10, mid: 0x3d2a15, rim: 0xfb923c, fill: 0x3a2917, ledge: 0x4a3420, accent: 0xfbbf24 },
  sky:        { bg: 0x071018, far: 0x122438, mid: 0x1d3a57, rim: 0x22d3ee, fill: 0x1f3a52, ledge: 0x2a4a63, accent: 0x67e8f9 },
  core:       { bg: 0x120406, far: 0x2e0d14, mid: 0x4a141f, rim: 0xf43f5e, fill: 0x45141d, ledge: 0x5a1a26, accent: 0xfb7185 },
  throne:     { bg: 0x0b0714, far: 0x241a3a, mid: 0x3a2a5c, rim: 0xfbbf24, fill: 0x362a52, ledge: 0x4a3a2a, accent: 0xfde68a },
}

export interface EnemySpawn { kind: string; x: number; y: number; hp: number; speed: number }

export interface LevelDef {
  name: string
  theme: ThemeName
  w: number
  h: number
  spawn: [number, number]
  ground: [number, number, number][]         // [x1, x2, topY]  — gaps = pits
  plats: [number, number, number][]           // [centerX, topY, width]
  walls: [number, number, number, number][]   // [centerX, topY, width, height]
  turrets: [number, number][]                 // [x, surfaceTopY]
  enemies: EnemySpawn[]
  pods: [number, number, string][]            // [x, y, kind]
  goal: [number, number]                      // reach this point to clear
  shards?: [number, number][]                 // optional explicit Apex Shard spots; auto-scattered when omitted
  movers?: [number, number, number, string, number, number][]  // [cx, top, w, axis 'h'|'v', dist, speed] — moving platforms
  hazards?: [number, number, number][]        // [cx, topY, w] — spike strips that damage on contact
  bouncers?: [number, number, number][]       // [cx, topY, w] — launch pads that spring you upward
}

// Horizontal Contra-style run-and-gun stages: push RIGHT through distinct
// sections — cross pits, ride movers, climb staircases, gun waves of enemies —
// to the extraction at the far right. Each stage has its own structural
// character (streets staircases / industrial conveyors+rise / sky rails+gaps /
// core hazard-corridors) and ends on the throne boss. Ground top is 600 so the
// pulled-back camera frames the action; pits are ~180px (jumpable, some
// mover-bridged); staircases climb in staged ~110px steps.
export const LEVELS: LevelDef[] = [
  {
    // NEON STREETS — the opening run. Rubble staircases, two mover-bridged pits,
    // a high catwalk line, turret nests. Longer + sectioned vs the old stub.
    name: 'NEON STREETS', theme: 'streets', w: 3800, h: 780, spawn: [120, 500], goal: [3700, 540],
    ground: [[0, 760, 600], [940, 1560, 600], [1740, 2560, 600], [2740, 3800, 600]],
    plats: [[280, 430, 150], [1900, 410, 150], [2200, 390, 150], [3600, 360, 150]],
    walls: [
      [420, 550, 180, 120], [600, 490, 180, 240],                              // S1 entry staircase
      [1160, 540, 190, 130], [1350, 470, 190, 300],                            // S2 mid staircase
      [2980, 550, 190, 110], [3170, 490, 190, 230], [3360, 430, 190, 350],     // S4 end 3-step climb
    ],
    turrets: [[600, 490], [1350, 470], [3360, 430]],
    enemies: [
      { kind: 'soldier', x: 250, y: 566, hp: 2, speed: 70 }, { kind: 'soldier', x: 600, y: 456, hp: 2, speed: 65 },
      { kind: 'soldier', x: 1160, y: 506, hp: 3, speed: 65 }, { kind: 'tank', x: 1500, y: 560, hp: 6, speed: 30 },
      { kind: 'charger', x: 1800, y: 566, hp: 4, speed: 64 }, { kind: 'soldier', x: 2400, y: 566, hp: 3, speed: 70 },
      { kind: 'tank', x: 2500, y: 560, hp: 6, speed: 30 }, { kind: 'soldier', x: 2800, y: 566, hp: 3, speed: 70 },
      { kind: 'soldier', x: 3550, y: 566, hp: 3, speed: 70 }, { kind: 'soldier', x: 3700, y: 566, hp: 3, speed: 70 },
      { kind: 'flyer', x: 700, y: 300, hp: 2, speed: 48 }, { kind: 'flyer', x: 1650, y: 280, hp: 3, speed: 52 },
      { kind: 'flyer', x: 2450, y: 300, hp: 3, speed: 52 }, { kind: 'flyer', x: 3250, y: 280, hp: 3, speed: 52 },
    ],
    pods: [[600, 460, 'spread'], [1350, 440, 'health'], [3360, 400, 'rapid']],
    movers: [[850, 590, 120, 'h', 85, 0.9], [1650, 590, 130, 'h', 95, 0.9]],
    hazards: [[1000, 600, 110], [2350, 600, 120]],
    bouncers: [[2050, 600, 90]],
  },
  {
    // INDUSTRIAL RISE — factory. Long conveyor shuttles bridge the pits, a
    // vertical lift climbs the "rise", spike vents on the floor, divers overhead.
    name: 'INDUSTRIAL RISE', theme: 'industrial', w: 3900, h: 800, spawn: [120, 500], goal: [3800, 540],
    ground: [[0, 700, 600], [880, 1440, 600], [1620, 2200, 600], [2380, 3900, 600]],
    plats: [[250, 430, 150], [1150, 420, 170], [2950, 400, 160], [3450, 400, 150]],
    walls: [
      [450, 540, 200, 140],                                    // S1 machine housing
      [1750, 520, 160, 200], [1950, 440, 160, 320],            // S3 the RISE (staircase up)
      [2600, 540, 180, 120], [2790, 470, 180, 260],            // S4 staircase
    ],
    turrets: [[1950, 440], [2790, 470]],
    enemies: [
      { kind: 'soldier', x: 250, y: 566, hp: 3, speed: 65 }, { kind: 'tank', x: 630, y: 560, hp: 6, speed: 28 },
      { kind: 'soldier', x: 1150, y: 386, hp: 3, speed: 70 }, { kind: 'charger', x: 1300, y: 566, hp: 4, speed: 62 },
      { kind: 'diver', x: 1050, y: 300, hp: 3, speed: 100 }, { kind: 'soldier', x: 1750, y: 486, hp: 3, speed: 70 },
      { kind: 'tank', x: 2120, y: 560, hp: 7, speed: 30 }, { kind: 'diver', x: 2050, y: 300, hp: 4, speed: 104 },
      { kind: 'soldier', x: 2600, y: 506, hp: 3, speed: 70 }, { kind: 'tank', x: 3050, y: 560, hp: 7, speed: 30 },
      { kind: 'soldier', x: 3500, y: 566, hp: 3, speed: 70 },
      { kind: 'flyer', x: 850, y: 300, hp: 3, speed: 55 }, { kind: 'flyer', x: 2350, y: 280, hp: 3, speed: 55 },
      { kind: 'flyer', x: 3300, y: 280, hp: 3, speed: 55 },
    ],
    pods: [[450, 500, 'rapid'], [1950, 400, 'health'], [2790, 430, 'laser']],
    movers: [[790, 590, 140, 'h', 90, 0.85], [1530, 590, 130, 'h', 95, 0.9], [2290, 500, 120, 'v', 150, 0.7]],
    hazards: [[1000, 600, 130], [2450, 600, 120]],
    bouncers: [[1250, 600, 90]],
  },
  {
    // SKY RAIL — high altitude. Frequent pits over the void, floating rail
    // platforms, mover-rails and bounce pads to cross + climb, aerial-heavy.
    name: 'SKY RAIL', theme: 'sky', w: 4000, h: 820, spawn: [120, 500], goal: [3900, 540],
    ground: [[0, 640, 600], [820, 1300, 600], [1480, 1960, 600], [2140, 2620, 600], [2800, 4000, 600]],
    plats: [[300, 420, 140], [520, 350, 140], [1000, 410, 150], [1650, 400, 150], [1850, 320, 150], [2400, 400, 150], [3150, 380, 150], [3500, 320, 150]],
    walls: [[1100, 540, 180, 120], [3300, 520, 180, 180]],
    turrets: [[520, 350], [1850, 320], [3500, 320]],
    enemies: [
      { kind: 'soldier', x: 300, y: 566, hp: 3, speed: 70 }, { kind: 'charger', x: 560, y: 566, hp: 5, speed: 64 },
      { kind: 'soldier', x: 870, y: 566, hp: 3, speed: 75 }, { kind: 'tank', x: 1600, y: 560, hp: 7, speed: 30 },
      { kind: 'soldier', x: 1750, y: 566, hp: 3, speed: 75 }, { kind: 'charger', x: 2300, y: 566, hp: 5, speed: 66 },
      { kind: 'soldier', x: 2900, y: 566, hp: 4, speed: 70 }, { kind: 'tank', x: 3550, y: 560, hp: 8, speed: 32 },
      { kind: 'diver', x: 900, y: 300, hp: 4, speed: 104 }, { kind: 'diver', x: 2000, y: 300, hp: 4, speed: 108 },
      { kind: 'diver', x: 3000, y: 300, hp: 4, speed: 108 },
      { kind: 'flyer', x: 450, y: 260, hp: 3, speed: 65 }, { kind: 'flyer', x: 1150, y: 240, hp: 3, speed: 70 },
      { kind: 'flyer', x: 1700, y: 260, hp: 4, speed: 65 }, { kind: 'flyer', x: 2500, y: 240, hp: 4, speed: 70 },
      { kind: 'flyer', x: 3400, y: 240, hp: 4, speed: 70 },
    ],
    pods: [[520, 320, 'laser'], [1650, 370, 'health'], [3150, 350, 'fire']],
    movers: [[730, 590, 130, 'h', 95, 0.9], [1390, 590, 130, 'h', 95, 0.9], [2050, 500, 120, 'v', 160, 0.7], [2710, 590, 130, 'h', 95, 0.9]],
    hazards: [[950, 600, 110]],
    bouncers: [[400, 600, 90], [1700, 600, 90], [3200, 600, 90]],
  },
  {
    // CORE ACCESS — reactor interior. Hazard-heavy (spike vents everywhere),
    // tight walls/chokes, mover-bridged pits, intense run-up to the throne.
    name: 'CORE ACCESS', theme: 'core', w: 3900, h: 780, spawn: [120, 500], goal: [3800, 540],
    ground: [[0, 760, 600], [940, 1520, 600], [1700, 2360, 600], [2540, 3900, 600]],
    plats: [[280, 430, 140], [1300, 410, 150], [2200, 400, 150], [3600, 380, 150]],
    walls: [
      [500, 500, 160, 200],                                    // S1 choke
      [1200, 480, 180, 240], [1400, 540, 180, 120],            // S2 tiered
      [2000, 480, 180, 240],                                   // S3 choke
      [2900, 500, 180, 220], [3100, 440, 180, 320],            // S4 staircase
    ],
    turrets: [[1200, 480], [2000, 480], [3100, 440]],
    enemies: [
      { kind: 'soldier', x: 250, y: 566, hp: 4, speed: 70 }, { kind: 'tank', x: 720, y: 560, hp: 8, speed: 30 },
      { kind: 'soldier', x: 1000, y: 566, hp: 4, speed: 75 }, { kind: 'charger', x: 1600, y: 566, hp: 5, speed: 66 },
      { kind: 'tank', x: 1850, y: 560, hp: 8, speed: 32 }, { kind: 'soldier', x: 2200, y: 566, hp: 4, speed: 75 },
      { kind: 'soldier', x: 2650, y: 566, hp: 4, speed: 75 }, { kind: 'tank', x: 3400, y: 560, hp: 9, speed: 32 },
      { kind: 'soldier', x: 3600, y: 566, hp: 4, speed: 75 },
      { kind: 'flyer', x: 850, y: 280, hp: 4, speed: 75 }, { kind: 'flyer', x: 1650, y: 260, hp: 4, speed: 80 },
      { kind: 'flyer', x: 2450, y: 280, hp: 4, speed: 75 }, { kind: 'flyer', x: 3300, y: 260, hp: 4, speed: 80 },
    ],
    pods: [[500, 460, 'rapid'], [1400, 500, 'health'], [2000, 440, 'laser'], [3100, 400, 'fire']],
    movers: [[850, 590, 120, 'h', 85, 0.9], [1610, 590, 130, 'h', 95, 0.9], [2450, 590, 120, 'h', 85, 0.9]],
    hazards: [[650, 600, 110], [1050, 600, 120], [1780, 600, 120], [2700, 600, 120], [3450, 600, 120]],
    bouncers: [[1500, 600, 90]],
  },
  {
    // APEX THRONE — the boss arena. A short flat stage where the Apex boss looms
    // (kept low enough to stay in the pulled-back frame); clear the boss to win.
    name: 'APEX THRONE', theme: 'throne', w: 2000, h: 760, spawn: [120, 500], goal: [0, 0],
    ground: [[0, 2000, 600]],
    plats: [[350, 440, 150], [750, 400, 160], [1250, 400, 160], [1650, 440, 150]],
    walls: [[120, 560, 100, 120], [1880, 560, 100, 120]],
    turrets: [[120, 500], [1880, 500]],
    enemies: [
      { kind: 'boss', x: 1000, y: 330, hp: 64, speed: 55 },
      { kind: 'flyer', x: 300, y: 250, hp: 3, speed: 55 }, { kind: 'flyer', x: 1700, y: 250, hp: 3, speed: 55 },
      { kind: 'tank', x: 450, y: 560, hp: 8, speed: 28 }, { kind: 'tank', x: 1550, y: 560, hp: 8, speed: 28 },
    ],
    pods: [[350, 400, 'health'], [1000, 360, 'laser'], [1650, 400, 'fire']],
  },
]

// Level Lab injection: when set, the scene plays THESE levels instead of the campaign.
let LAB_LEVELS: LevelDef[] | null = null
export function setLabLevels(levels: LevelDef[] | null) { LAB_LEVELS = levels }

interface TouchState {
  left: boolean
  right: boolean
  jump: boolean
  shoot: boolean
  up: boolean
  down: boolean
}

export class MainScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd!: {
    up: Phaser.Input.Keyboard.Key
    down: Phaser.Input.Keyboard.Key
    left: Phaser.Input.Keyboard.Key
    right: Phaser.Input.Keyboard.Key
  }
  private spaceKey!: Phaser.Input.Keyboard.Key
  private bullets!: Phaser.Physics.Arcade.Group
  private enemyBullets!: Phaser.Physics.Arcade.Group
  private enemies!: Phaser.Physics.Arcade.Group
  private platforms!: Phaser.Physics.Arcade.StaticGroup
  private movers!: Phaser.Physics.Arcade.StaticGroup   // moving platforms (ride them)
  private hazards!: Phaser.Physics.Arcade.StaticGroup  // spike strips (damage on contact)
  private bouncers!: Phaser.Physics.Arcade.StaticGroup // launch pads (spring you up)
  private powerups!: Phaser.Physics.Arcade.Group
  private bgFar!: Phaser.GameObjects.TileSprite
  private bgMid!: Phaser.GameObjects.TileSprite
  private bgStars!: Phaser.GameObjects.TileSprite
  private bgImage!: Phaser.GameObjects.Image
  private bgScrim!: Phaser.GameObjects.Rectangle
  private uiCam?: Phaser.Cameras.Scene2D.Camera  // crisp HUD camera (hi-res render)
  private decor: Phaser.GameObjects.GameObject[] = []
  private shadowGfx!: Phaser.GameObjects.Graphics  // per-frame drop shadows (grounding)
  private runFrameT = 0     // run-cycle timer (2-frame bounding run)
  private runFrame = 0      // which run frame (0/1)
  private landRecoverUntil = 0  // brief crouch-on-landing window
  private airborneT = 0     // ms spent airborne (for landing detection)
  private sfx?: Sfx
  private lastSfxShot = 0
  private lastFired = 0
  private fireRate = 100
  private health = 5
  private maxHealth = 6
  private score = 0
  private level = 1
  private lives = 3
  private combo = 0
  private comboTimer = 0
  private kills = 0
  private maxCombo = 0
  private prevOnGround = false
  private fallSpeed = 0
  private deathParticles!: Phaser.GameObjects.Particles.ParticleEmitter
  private healthText!: Phaser.GameObjects.Text
  private scoreText!: Phaser.GameObjects.Text
  private levelText!: Phaser.GameObjects.Text
  private weaponText!: Phaser.GameObjects.Text
  private livesText!: Phaser.GameObjects.Text
  private comboText!: Phaser.GameObjects.Text
  private gameOver = false
  private levelTransition = false
  private controllerSeen = false
  private invulnerable = false
  private facingRight = true
  private aimUp = false
  private aimDown = false
  private movingH = false
  private onGround = false
  private prone = false
  private touch: TouchState = { left: false, right: false, jump: false, shoot: false, up: false, down: false }
  // On-screen touch controls: collected so they can be toggled off (e.g. when a
  // keyboard or controller is attached). Preference persists across sessions.
  private touchUI: Phaser.GameObjects.GameObject[] = []
  private touchHidden = false
  private touchToggle?: Phaser.GameObjects.Text
  private weapon: 'normal' | 'spread' | 'rapid' | 'laser' | 'fire' = 'normal'
  // Two-weapon carry: a backup slot you can swap into (Q / touch / gamepad Y).
  private altWeapon: 'normal' | 'spread' | 'rapid' | 'laser' | 'fire' = 'normal'
  private padSwapPrev = false
  private particles!: Phaser.GameObjects.Particles.ParticleEmitter
  private jumpsLeft = 2
  private lastGroundAt = 0
  private jumpBufferAt = -9999
  private prevJump = false
  private isJumping = false
  private lastGroundX = 80
  private lastGroundY = 480
  private spawnTimer = 0
  private bossPhase = 1
  private levelW = 2600
  private levelH = 1200
  private goalX = 0
  private goalY = 0
  // Pause / mute
  private userPaused = false
  private muted = false
  private prevStart = false
  private pauseUI: Phaser.GameObjects.GameObject[] = []
  private muteIcon!: Phaser.GameObjects.Text
  // Boss HP bar
  private bossRef?: Phaser.Physics.Arcade.Sprite
  private bossBar: Phaser.GameObjects.GameObject[] = []
  private bossBarFill?: Phaser.GameObjects.Rectangle
  // Apex Shards (collectibles)
  private shards!: Phaser.Physics.Arcade.Group
  private shardsGot = 0
  private shardsTotal = 0
  private shardText!: Phaser.GameObjects.Text
  // Title / start gate (skipped in the Level Lab)
  private started = false
  private titleUI: Phaser.GameObjects.GameObject[] = []
  // Extraction compass — edge arrow pointing to the goal when it's off-screen
  private compass?: Phaser.GameObjects.Triangle

  constructor() {
    super({ key: 'MainScene' })
  }

  // Active level set — the injected Lab levels if present, else the campaign.
  private levels(): LevelDef[] { return LAB_LEVELS ?? LEVELS }
  private isBossLevel(): boolean {
    const d = this.levels()[this.level - 1]
    return !!d && d.goal[0] === 0 && d.goal[1] === 0
  }

  // Brief physics freeze — makes meaningful impacts LAND (Contra crunch). Not on per-bullet ticks.
  private hitstop(ms: number) {
    if (this.physics.world.isPaused) return
    this.physics.world.pause()
    this.time.delayedCall(ms, () => { if (!this.userPaused) this.physics.world.resume() })
  }
  // Expanding neon ring on kills/impacts.
  private shockwave(x: number, y: number, color: number, r = 30) {
    const ring = this.add.circle(x, y, r, color, 0).setStrokeStyle(2, color, 0.9).setDepth(23).setScale(0.25)
    this.tweens.add({ targets: ring, scale: 1, alpha: 0, duration: 260, onComplete: () => ring.destroy() })
  }
  // Weapon-colored muzzle burst at the gun tip — sells every shot.
  private muzzleFlash(x: number, y: number, dir: number, angle: number) {
    const color = this.weapon === 'laser' ? 0xe879f9 : this.weapon === 'fire' ? 0xfb923c : 0x22d3ee
    const rad = Phaser.Math.DegToRad(angle)
    const isVert = angle === -90 || angle === 90
    const dx = isVert ? 0 : Math.cos(rad) * dir
    const dy = Math.sin(rad)
    const fx = x + dx * 10, fy = y + dy * 10
    const spin = Math.atan2(dy, dx)
    // Directional cone pointing along the shot + a hot white core — sharp, not a soft blob.
    const cone = this.add.triangle(fx, fy, 0, -5, 20, 0, 0, 5, color, 1).setRotation(spin).setDepth(21).setBlendMode(Phaser.BlendModes.ADD)
    const core = this.add.circle(fx, fy, 4.5, 0xffffff, 1).setDepth(22).setBlendMode(Phaser.BlendModes.ADD)
    this.tweens.add({ targets: [cone, core], scaleX: 0.15, scaleY: 0.15, alpha: 0, duration: 80, onComplete: () => { cone.destroy(); core.destroy() } })
  }
  // Kicked-up dust when you hit the ground hard.
  private landingDust(speed: number) {
    const y = (this.player.body as Phaser.Physics.Arcade.Body).bottom
    const n = Phaser.Math.Clamp(Math.floor(speed / 90), 3, 12)
    this.deathParticles.setParticleTint(0xcbd5e1)
    this.deathParticles.emitParticleAt(this.player.x, y, n)
    if (speed > 760) this.cameras.main.shake(70, 0.008)
  }

  preload() {
    // Hero pose set — one consistent side-view lioness across all states, each
    // aligned to a shared canvas so they swap without jitter (ready/run/jump/crouch).
    this.load.image('huntress', ASSETS.huntress)
    this.load.image('huntress_run', ASSETS.huntress_run)
    this.load.image('huntress_jump', ASSETS.huntress_jump)
    this.load.image('huntress_crouch', ASSETS.huntress_crouch)
    this.load.image('enemy_soldier', ASSETS.enemy_soldier)
    this.load.image('enemy_flyer', ASSETS.enemy_flyer)
    this.load.image('enemy_tank', ASSETS.enemy_tank)
    this.load.image('boss_art', ASSETS.boss)
    this.load.image('pickup_pod', ASSETS.pickup_pod)
    this.load.image('platform_tile', ASSETS.platform_tile)
    this.load.image('logo', ASSETS.logo)
    // Painted backdrops; tolerate a missing file (falls back to procedural skyline)
    Object.entries(WORLD_BG).forEach(([k, url]) => this.load.image('bg_' + k, url))
    this.load.on('loaderror', (f: Phaser.Loader.File) => { if (f.key?.startsWith('bg_')) console.warn('bg missing', f.key) })
  }

  create() {
    this.gameOver = false
    this.levelTransition = false
    this.health = 5
    this.lives = 3
    this.score = 0
    this.level = 1
    this.combo = 0
    this.comboTimer = 0
    this.kills = 0
    this.maxCombo = 0
    this.prevOnGround = false
    this.fallSpeed = 0
    this.invulnerable = false
    this.facingRight = true
    this.weapon = 'normal'
    this.altWeapon = 'normal'
    this.padSwapPrev = false
    this.fireRate = 100
    this.jumpsLeft = MAX_JUMPS
    this.jumpBufferAt = -9999
    this.isJumping = false
    this.spawnTimer = 0
    this.bossPhase = 1
    this.prone = false
    this.decor = []
    this.userPaused = false
    this.prevStart = false
    this.pauseUI = []
    this.bossBar = []
    this.bossRef = undefined
    this.shardsGot = 0
    this.shardsTotal = 0
    this.touch = { left: false, right: false, jump: false, shoot: false, up: false, down: false }

    this.physics.world.gravity.y = GRAV
    this.sfx?.dispose()   // kill any prior music/context before a fresh restart
    this.sfx = new Sfx()
    this.events.once('shutdown', () => this.sfx?.dispose())  // stop music on restart / unmount
    this.createTextures()
    this.createThemeTextures()

    this.platforms = this.physics.add.staticGroup()
    this.movers = this.physics.add.staticGroup()
    this.hazards = this.physics.add.staticGroup()
    this.bouncers = this.physics.add.staticGroup()
    // Projectiles ignore world gravity so they fly straight + flat (no droop).
    this.bullets = this.physics.add.group({ classType: Phaser.Physics.Arcade.Image, maxSize: 120, allowGravity: false })
    this.enemyBullets = this.physics.add.group({ classType: Phaser.Physics.Arcade.Image, maxSize: 80, allowGravity: false })
    this.enemies = this.physics.add.group()
    this.powerups = this.physics.add.group()
    this.shards = this.physics.add.group({ allowGravity: false, immovable: true })

    // Restore the saved mute preference (persists across page reloads too).
    try { this.muted = localStorage.getItem('apex_muted') === '1' } catch { /* ignore */ }
    this.sfx.setMuted(this.muted)

    // Backdrop pinned to the camera. Sized to the pulled-back world view (plus a
    // margin) so it fills the wide run-and-gun frame instead of leaving black bars.
    const vw = WORLD_VIEW_W, vh = WORLD_VIEW_W * 0.75, vcx = vw / 2, vcy = vh / 2
    this.bgImage = this.add.image(vcx, vcy, 'stars').setScrollFactor(0).setDepth(-10).setVisible(false)
    this.bgScrim = this.add.rectangle(vcx, vcy, vw + 60, vh + 60, 0x05040a, 0.16).setScrollFactor(0).setDepth(-9).setVisible(false)
    // Procedural parallax fallback (both axes for the 2D world)
    this.bgStars = this.add.tileSprite(vcx, vcy, vw + 60, vh + 60, 'stars').setScrollFactor(0).setDepth(0)
    this.bgFar = this.add.tileSprite(vcx, vcy, vw + 60, vh + 60, 'far_streets').setScrollFactor(0).setDepth(1)
    this.bgMid = this.add.tileSprite(vcx, vcy, vw + 60, vh + 60, 'mid_streets').setScrollFactor(0).setDepth(2)
    // Drop shadows drawn fresh each frame (grounds the player + enemies on the busy art).
    this.shadowGfx = this.add.graphics().setDepth(8)

    this.buildLevel(1)

    const def = this.levels()[0]
    const pKey = this.textures.exists('huntress') ? 'huntress' : 'player'
    this.player = this.physics.add.sprite(def.spawn[0], def.spawn[1], pKey)
    this.sizePlayer()
    this.player.setCollideWorldBounds(true)
    this.player.setBounce(0)
    this.player.setDepth(25)
    this.player.setMaxVelocity(RUN, 1250)

    this.cameras.main.startFollow(this.player, true, 0.12, 0.12)
    this.cameras.main.setDeadzone(110, 90)
    // Bias the view so the hero rides left-of-centre — you see the ground ahead
    // and enemies approaching from the right (run-and-gun framing).
    this.cameras.main.setFollowOffset(-140, 24)

    this.physics.add.collider(this.player, this.platforms)
    this.physics.add.collider(this.player, this.movers)
    this.physics.add.overlap(this.player, this.hazards, () => this.damagePlayer(), undefined, this)
    this.physics.add.collider(this.player, this.bouncers, ((_p: unknown, pad: unknown) => this.bounce(pad as Phaser.Physics.Arcade.Sprite)) as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this)
    this.physics.add.collider(this.enemies, this.platforms)
    this.physics.add.collider(this.powerups, this.platforms)

    this.physics.add.overlap(this.bullets, this.enemies, this.hitEnemy as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this)
    this.physics.add.overlap(this.player, this.enemies, this.hitPlayer as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this)
    this.physics.add.overlap(this.player, this.powerups, this.collectPowerup as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this)
    this.physics.add.overlap(this.player, this.enemyBullets, this.hitByEnemyBullet as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this)
    this.physics.add.overlap(this.player, this.shards, this.collectShard as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this)

    this.cursors = this.input.keyboard!.createCursorKeys()
    this.wasd = {
      up: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    }
    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)

    // Web-Audio needs a user gesture before it can play
    const resumeAudio = () => this.sfx?.resume()
    this.input.keyboard!.once('keydown', resumeAudio)
    this.input.once('pointerdown', resumeAudio)

    // Pause (P / Esc) and mute (M) — event-driven so they work while paused.
    this.input.keyboard!.on('keydown-P', () => this.togglePause())
    this.input.keyboard!.on('keydown-ESC', () => this.togglePause())
    this.input.keyboard!.on('keydown-M', () => this.toggleMute())
    this.input.keyboard!.on('keydown-Q', () => this.swapWeapon())

    // Controller: confirm the pad the instant it wakes up (browsers only surface
    // gamepads after the first input) — and if one is already active.
    this.input.gamepad?.on('connected', () => this.controllerToast())
    if ((this.input.gamepad?.total ?? 0) > 0) this.controllerToast()

    this.particles = this.add.particles(0, 0, 'spark', {
      speed: { min: 120, max: 380 },
      scale: { start: 0.8, end: 0 },
      lifespan: 340,
      blendMode: 'ADD',
      emitting: false,
    })
    this.particles.setDepth(24)

    // Chunky debris burst on kills — arcs up and falls (gravity), reads as gibs not sparkle.
    this.deathParticles = this.add.particles(0, 0, 'spark', {
      speed: { min: 90, max: 300 },
      angle: { min: 200, max: 340 },
      gravityY: 520,
      scale: { start: 1.7, end: 0 },
      lifespan: 620,
      emitting: false,
    })
    this.deathParticles.setDepth(22)

    this.createHUD()
    // On-screen controls only where they're needed (touch devices) — keep desktop clean.
    if (this.sys.game.device.input.touch) this.createTouchControls()

    // Real game opens on a title screen; the Level Lab drops straight into play.
    if (LAB_LEVELS) {
      this.started = true
      this.showBanner('LEVEL 1', def.name)
    } else {
      this.started = false
      this.showTitle()
    }

    this.initHiResCameras()

    // Test hook: ?probe exposes the scene for headless physics verification.
    // Zero impact for players (only attaches when the URL opts in).
    try {
      if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('probe')) {
        ;(window as unknown as { __scene?: MainScene }).__scene = this
      }
    } catch { /* ignore */ }
  }

  // Render at 2x on the real game (1024x768) while keeping every coordinate in
  // the 512x384 design space: the world camera zooms to show the SAME view at 2x
  // pixels, and a non-scrolling UI camera (same zoom) draws the HUD crisp on top.
  // RES is 1 in the Level Lab (512-wide), so it behaves exactly as before there.
  private initHiResCameras() {
    const RES = this.scale.width / 512
    // World camera pulls back to show WORLD_VIEW_W of level (wide run-and-gun
    // view); the HUD camera below stays at RES so the interface is unaffected.
    this.cameras.main.setZoom(this.scale.width / WORLD_VIEW_W)
    this.uiCam = this.cameras.add(0, 0, this.scale.width, this.scale.height)
    this.uiCam.setZoom(RES)
    // Anchor the UI camera's zoom at the top-left so the HUD's 512x384-space
    // coordinates scale straight to the 1024x768 canvas (design x,y -> x*RES,y*RES)
    // instead of zooming around the canvas centre and flying off to the corner.
    this.uiCam.setOrigin(0, 0)
    this.uiCam.setScroll(0, 0)
    this.routeCameras()
    // Cinematic pass on the WORLD camera only (HUD stays crisp): a subtle bloom
    // makes the neon/cyan tech glow pop like the reference vibe, and a soft
    // vignette frames the action. Guarded — postFX needs the WebGL renderer.
    try {
      this.cameras.main.postFX.addBloom(0xffffff, 1, 1, 1, 0.55, 3)
      this.cameras.main.postFX.addVignette(0.5, 0.5, 1.05, 0.16)
    } catch { /* Canvas renderer / no postFX — skip gracefully */ }
  }

  // Assign each display object to exactly one camera: screen-pinned HUD/overlays
  // (scrollFactor 0, depth >= 100) render on the UI camera; everything else
  // (world + backgrounds) on the main camera. Runs each frame so dynamically
  // spawned objects (bullets, enemies, hit FX, transient overlays) get routed.
  private routeCameras() {
    if (!this.uiCam) return
    const list = this.children.list
    for (let i = 0; i < list.length; i++) {
      const go = list[i] as Phaser.GameObjects.GameObject & { _routed?: boolean; depth?: number; scrollFactorX?: number }
      if (go._routed) continue
      go._routed = true
      const isUI = go.scrollFactorX === 0 && (go.depth ?? 0) >= 100
      if (isUI) this.cameras.main.ignore(go)
      else this.uiCam.ignore(go)
    }
  }

  private sizePlayer() {
    const k = this.player.texture.key
    if (k === 'huntress' || k === 'huntress_run' || k === 'huntress_jump' || k === 'huntress_crouch') {
      // All hero poses share one aligned 1024x900 canvas — each already scaled to
      // a consistent apparent size (crouch a touch shorter) and anchored feet@760
      // — so one display size + hitbox keeps the physics stable across swaps.
      const DISP_H = 156
      this.player.setDisplaySize(DISP_H * (1024 / 900), DISP_H)
      const tw = this.player.width, th = this.player.height   // 1024 x 900
      const b = this.player.body as Phaser.Physics.Arcade.Body
      b.setSize(tw * 0.11, th * 0.44)          // torso+legs column
      b.setOffset(tw * 0.445, th * 0.40)       // centred x, from mid-torso down to the feet
    }
  }

  private createTextures() {
    if (!this.textures.exists('player')) {
      const p = this.make.graphics({ x: 0, y: 0 })
      p.fillStyle(0x7c3aed, 1); p.fillRoundedRect(4, 8, 24, 36, 4)
      p.fillStyle(0x22d3ee, 1); p.fillCircle(16, 10, 6)
      p.generateTexture('player', 32, 48); p.destroy()
    }
    if (!this.textures.exists('terrain')) {
      const g = this.make.graphics({ x: 0, y: 0 })
      g.fillGradientStyle(0xbfc4d6, 0xbfc4d6, 0x30323f, 0x30323f, 1)
      g.fillRect(0, 0, 32, 256)
      g.generateTexture('terrain', 32, 256); g.destroy()
    }
    // Tileable armored tech-plate — the terrain surface. Light base so a per-theme
    // tint colours it; panel seams + bevels + rivets + brushed sheen give real
    // texture (tiled across any platform size = no stretch, no "cheap flat bar").
    if (!this.textures.exists('slab')) {
      const g = this.make.graphics({ x: 0, y: 0 })
      g.fillStyle(0xb7bccf, 1); g.fillRect(0, 0, 64, 64)                              // metallic base
      // brushed vertical sheen
      g.fillStyle(0xffffff, 0.05); g.fillRect(7, 0, 3, 64); g.fillRect(39, 0, 3, 64)
      g.fillStyle(0x000000, 0.06); g.fillRect(21, 0, 2, 64); g.fillRect(53, 0, 2, 64)
      // panel seams on a 32px grid (wrap seamlessly when tiled)
      g.fillStyle(0x353947, 1); g.fillRect(0, 30, 64, 4); g.fillRect(30, 0, 4, 64)
      g.fillStyle(0xe9ecf5, 0.45); g.fillRect(0, 28, 64, 2); g.fillRect(28, 0, 2, 64) // raised bevel (lit)
      g.fillStyle(0x1d2029, 0.5); g.fillRect(0, 34, 64, 2); g.fillRect(34, 0, 2, 64)  // groove shadow
      // rivets (top-left of each sub-panel) — bolt + tiny specular
      const rivet = (x: number, y: number) => { g.fillStyle(0x2a2d38, 1); g.fillCircle(x, y, 2.4); g.fillStyle(0xeef1f8, 0.6); g.fillCircle(x - 0.7, y - 0.7, 1) }
      ;[[9, 9], [41, 9], [9, 41], [41, 41], [24, 24], [56, 56]].forEach(([x, y]) => rivet(x, y))
      g.generateTexture('slab', 64, 64); g.destroy()
    }
    // Projectiles: crisp directional energy bolts (drawn pointing RIGHT, tip at
    // the right edge) at hi-res so they stay sharp under the 2x render. Each bolt
    // is rotated to its travel angle at spawn — clean "new-age" look, no blobs.
    if (!this.textures.exists('bullet')) {
      const g = this.make.graphics({ x: 0, y: 0 })
      g.fillStyle(0x0e7490, 1); g.fillRoundedRect(1, 3, 40, 12, 6)   // dark cyan shell
      g.fillStyle(0x22d3ee, 1); g.fillRoundedRect(3, 4, 36, 10, 5)   // bright cyan
      g.fillStyle(0xcffafe, 1); g.fillRoundedRect(7, 6, 26, 6, 3)    // pale inner
      g.fillStyle(0xffffff, 1); g.fillCircle(40, 9, 6)               // hot leading tip
      g.generateTexture('bullet', 48, 18); g.destroy()
    }
    if (!this.textures.exists('laser')) {
      const g = this.make.graphics({ x: 0, y: 0 })
      g.fillStyle(0x86198f, 1); g.fillRoundedRect(0, 4, 72, 7, 3)    // magenta shell
      g.fillStyle(0xe879f9, 1); g.fillRoundedRect(2, 5, 68, 5, 2)    // bright magenta
      g.fillStyle(0xfdf4ff, 1); g.fillRect(5, 6, 62, 2)             // white core line
      g.fillStyle(0xffffff, 1); g.fillCircle(68, 7, 5)              // hot tip
      g.generateTexture('laser', 72, 14); g.destroy()
    }
    if (!this.textures.exists('fireball')) {
      const g = this.make.graphics({ x: 0, y: 0 })
      g.fillStyle(0xc2410c, 1); g.fillEllipse(22, 12, 42, 20)        // deep-orange body
      g.fillStyle(0xf97316, 1); g.fillEllipse(25, 12, 32, 16)        // orange
      g.fillStyle(0xfacc15, 1); g.fillEllipse(29, 12, 20, 11)        // yellow core
      g.fillStyle(0xfffbeb, 1); g.fillCircle(32, 12, 5)             // white-hot head
      g.generateTexture('fireball', 44, 24); g.destroy()
    }
    if (!this.textures.exists('enemyBullet')) {
      const g = this.make.graphics({ x: 0, y: 0 })
      g.fillStyle(0x9f1239, 1); g.fillRoundedRect(1, 3, 24, 9, 4)    // dark red shell
      g.fillStyle(0xf43f5e, 1); g.fillRoundedRect(3, 4, 20, 7, 3)    // red
      g.fillStyle(0xffe4e6, 1); g.fillRoundedRect(6, 5, 11, 4, 2)    // pink core
      g.fillStyle(0xffffff, 1); g.fillCircle(24, 7, 4)              // tip
      g.generateTexture('enemyBullet', 28, 14); g.destroy()
    }
    if (!this.textures.exists('turret')) {
      const g = this.make.graphics({ x: 0, y: 0 })
      g.fillStyle(0x2b2740, 1); g.fillRect(4, 22, 40, 16)
      g.fillStyle(0x3f3a5c, 1); g.fillRoundedRect(10, 8, 28, 18, 6)
      g.fillStyle(0x18151f, 1); g.fillRect(30, 14, 18, 7)
      g.fillStyle(0xf43f5e, 1); g.fillCircle(24, 17, 4)
      g.generateTexture('turret', 48, 40); g.destroy()
    }
    const mk = (key: string, color: number, w: number, h: number) => {
      if (this.textures.exists(key)) return
      const g = this.make.graphics({ x: 0, y: 0 })
      g.fillStyle(color, 1); g.fillRect(0, 0, w, h)
      g.generateTexture(key, w, h); g.destroy()
    }
    mk('enemy', 0xe11d48, 32, 36); mk('flyer', 0xa855f7, 32, 32)
    mk('tank', 0xea580c, 44, 40); mk('boss', 0xdc2626, 64, 58)

    ;['pow_health', 'pow_spread', 'pow_rapid', 'pow_laser', 'pow_fire'].forEach((k, i) => {
      const colors = [0x4ade80, 0x22d3ee, 0xfbbf24, 0xe879f9, 0xfb923c]
      if (!this.textures.exists(k)) {
        const g = this.make.graphics({ x: 0, y: 0 })
        g.fillStyle(colors[i], 1); g.fillCircle(14, 14, 14)
        g.fillStyle(0xffffff, 0.95); g.fillCircle(14, 14, 6)
        g.generateTexture(k, 28, 28); g.destroy()
      }
    })
    if (!this.textures.exists('spark')) {
      // Tight, crisp glint (hot core + minimal falloff) instead of a soft ball,
      // so muzzle/impact sparks read sharp under the 2x render.
      const s = this.make.graphics({ x: 0, y: 0 })
      s.fillStyle(0xffffff, 0.22); s.fillCircle(8, 8, 8)
      s.fillStyle(0xffffff, 0.6); s.fillCircle(8, 8, 4)
      s.fillStyle(0xffffff, 1); s.fillCircle(8, 8, 2)
      s.generateTexture('spark', 16, 16); s.destroy()
    }
    if (!this.textures.exists('spike')) {
      const g = this.make.graphics({ x: 0, y: 0 })
      const n = 5, sw = 64 / n
      for (let i = 0; i < n; i++) {
        const x = i * sw
        g.fillStyle(0x7f1d1d, 1); g.fillTriangle(x, 22, x + sw / 2, 1, x + sw, 22)             // dark base
        g.fillStyle(0xef4444, 1); g.fillTriangle(x + 2, 22, x + sw / 2, 6, x + sw - 2, 22)     // red body
        g.fillStyle(0xfecaca, 0.9); g.fillTriangle(x + sw / 2 - 1, 12, x + sw / 2, 4, x + sw / 2 + 2, 12) // glint
      }
      g.generateTexture('spike', 64, 22); g.destroy()
    }
    if (!this.textures.exists('pad')) {
      const g = this.make.graphics({ x: 0, y: 0 })
      g.fillStyle(0x0f3d2e, 1); g.fillRoundedRect(0, 8, 64, 16, 5)        // dark housing
      g.fillStyle(0x10b981, 1); g.fillRoundedRect(3, 4, 58, 12, 5)        // green spring face
      g.fillStyle(0x6ee7b7, 1)
      g.fillTriangle(20, 12, 26, 3, 32, 12); g.fillTriangle(34, 12, 40, 3, 46, 12)  // up chevrons
      g.generateTexture('pad', 64, 26); g.destroy()
    }
    if (!this.textures.exists('shard')) {
      const g = this.make.graphics({ x: 0, y: 0 })
      const diamond = (cx: number, cy: number, r: number) => { g.beginPath(); g.moveTo(cx, cy - r); g.lineTo(cx + r, cy); g.lineTo(cx, cy + r); g.lineTo(cx - r, cy); g.closePath(); g.fillPath() }
      g.fillStyle(0x22d3ee, 1); diamond(11, 11, 11)
      g.fillStyle(0xa5f3fc, 1); diamond(11, 11, 6)
      g.fillStyle(0xffffff, 0.95); diamond(11, 9, 2.5)
      g.generateTexture('shard', 22, 22); g.destroy()
    }
  }

  private createThemeTextures() {
    if (!this.textures.exists('stars')) {
      const g = this.make.graphics({ x: 0, y: 0 })
      for (let i = 0; i < 90; i++) {
        const a = 0.3 + Math.random() * 0.6
        g.fillStyle(0xffffff, a)
        g.fillCircle(Math.random() * 800, Math.random() * 420, Math.random() > 0.85 ? 1.6 : 1)
      }
      g.generateTexture('stars', 800, 600); g.destroy()
    }
    const makeSkyline = (key: string, color: number, accent: number, baseY: number, step: number) => {
      if (this.textures.exists(key)) return
      const g = this.make.graphics({ x: 0, y: 0 })
      let x = 0
      while (x < 800) {
        const w = Phaser.Math.Between(Math.floor(step * 0.6), Math.floor(step * 1.5))
        const h = Phaser.Math.Between(80, 300)
        const top = baseY - h
        g.fillStyle(color, 1); g.fillRect(x, top, w - 6, h)
        g.fillStyle(accent, 0.4)
        for (let wy = top + 12; wy < baseY - 10; wy += 22) {
          for (let wx = x + 6; wx < x + w - 14; wx += 16) {
            if (Math.random() > 0.62) g.fillRect(wx, wy, 6, 9)
          }
        }
        x += w
      }
      g.generateTexture(key, 800, 600); g.destroy()
    }
    ;(Object.keys(THEMES) as ThemeName[]).forEach((name) => {
      const t = THEMES[name]
      makeSkyline('far_' + name, t.far, t.rim, 430, 66)
      makeSkyline('mid_' + name, t.mid, t.accent, 560, 108)
    })
  }

  private buildLevel(lvl: number) {
    this.platforms.clear(true, true)
    this.enemies.clear(true, true)
    this.powerups.clear(true, true)
    this.bullets.clear(true, true)
    this.enemyBullets.clear(true, true)
    this.movers.clear(true, true)
    this.hazards.clear(true, true)
    this.bouncers.clear(true, true)
    this.shards?.getChildren().forEach((s) => this.tweens.killTweensOf(s))
    this.shards?.clear(true, true)
    this.destroyBossBar()
    this.bossRef = undefined
    this.shardsGot = 0
    this.shardsTotal = 0
    this.decor.forEach((d) => { this.tweens.killTweensOf(d); d.destroy() })
    this.decor = []
    this.spawnTimer = 0
    this.bossPhase = 1

    const def = this.levels()[lvl - 1]
    const theme = THEMES[def.theme]
    this.levelW = def.w
    this.levelH = def.h
    this.goalX = def.goal[0]
    this.goalY = def.goal[1]

    this.cameras.main.setBackgroundColor(theme.bg)
    // Extra fall room below the content so pits are real drops.
    this.physics.world.setBounds(0, 0, def.w, def.h + 400)
    this.cameras.main.setBounds(0, 0, def.w, def.h)

    const bgKey = 'bg_' + def.theme
    if (this.textures.exists(bgKey)) {
      this.bgImage.setTexture(bgKey).setDisplaySize(WORLD_VIEW_W + 60, WORLD_VIEW_W * 0.75 + 60).setVisible(true)
      this.bgScrim.setVisible(true)
      this.bgStars.setVisible(false); this.bgFar.setVisible(false); this.bgMid.setVisible(false)
    } else {
      this.bgImage.setVisible(false); this.bgScrim.setVisible(false)
      this.bgStars.setVisible(true).setTexture('stars')
      this.bgFar.setVisible(true).setTexture('far_' + def.theme)
      this.bgMid.setVisible(true).setTexture('mid_' + def.theme)
    }

    // Per-theme environmental set-dressing (procedural, behind + around the terrain)
    // so each stage reads as a distinct place, not just a recolour.
    this.decorateLevel(def, theme)

    // A solid terrain block: textured tech-plate body (tiled → no stretch), shaded
    // mass toward the bottom, dimensional side edges, and a bright walkable top.
    const solid = (cx: number, top: number, w: number, h: number, tint: number, rim: number) => {
      const s = this.platforms.create(cx, top + h / 2, 'terrain') as Phaser.Physics.Arcade.Sprite
      s.setDisplaySize(w, h); s.setDepth(5); s.refreshBody(); s.setVisible(false)              // collision only
      this.decor.push(this.add.tileSprite(cx, top + h / 2, w, h, 'slab').setTint(tint).setDepth(5))
      this.decor.push(this.add.rectangle(cx, top + h * 0.66, w, h * 0.68, 0x000000, 0.32).setDepth(5))            // mass shade (darker low)
      this.decor.push(this.add.rectangle(cx - w / 2 + 2, top + h / 2, 3, h, 0xffffff, 0.10).setDepth(6))          // lit left edge
      this.decor.push(this.add.rectangle(cx + w / 2 - 2, top + h / 2, 3, h, 0x000000, 0.28).setDepth(6))          // shadow right edge
      this.decor.push(this.add.rectangle(cx, top + 6, w + 10, 20, rim, 0.14).setDepth(4).setBlendMode(Phaser.BlendModes.ADD))  // top glow halo
      this.decor.push(this.add.rectangle(cx, top + 5, w - 2, 9, 0xffffff, 0.12).setDepth(6))                      // top sheen
      this.decor.push(this.add.rectangle(cx, top + 1, w, 3, rim, 1).setDepth(7))                                  // crisp neon lip
    }

    def.ground.forEach(([x1, x2, top]) => solid((x1 + x2) / 2, top, x2 - x1, def.h + 400 - top, theme.fill, theme.rim))
    // Elevated platforms: real chunky solid slabs (varied thickness) you run UNDER
    // and land ON — substantial terrain, not floating bars.
    def.plats.forEach(([cx, top, w]) => {
      const seed = Math.abs(Math.round(cx * 2.3 + top * 1.7))
      const th = 34 + (seed % 4) * 8           // 34..58px thick, varied
      solid(cx, top, w, th, theme.ledge, theme.rim)
    })
    def.walls.forEach(([cx, top, w, h]) => solid(cx, top, w, h, theme.ledge, theme.accent))

    // Spike strips — throwback hazard, new-age look. Overlap = damage.
    def.hazards?.forEach(([cx, top, w]) => {
      const s = this.hazards.create(cx, top - 8, 'spike') as Phaser.Physics.Arcade.Sprite
      s.setDisplaySize(w, 18).setDepth(8).refreshBody()
      this.decor.push(this.add.rectangle(cx, top - 1, w, 3, 0xef4444, 0.7).setDepth(7).setBlendMode(Phaser.BlendModes.ADD))
      this.decor.push(this.add.rectangle(cx, top + 6, w, 10, 0x7f1d1d, 0.55).setDepth(6))  // mounting base
    })

    // Moving platforms — sine-driven lifts/shuttles you ride across gaps and up shafts.
    def.movers?.forEach(([cx, top, w, axis, dist, spd]) => {
      const cy = top + 10
      const m = this.movers.create(cx, cy, 'slab') as Phaser.Physics.Arcade.Sprite
      m.setDisplaySize(w, 22).setTint(theme.ledge).setDepth(18).refreshBody()   // textured tech platform
      const glow = this.add.rectangle(cx, cy, w + 12, 30, theme.accent, 0.18).setDepth(17).setBlendMode(Phaser.BlendModes.ADD)
      const rim = this.add.rectangle(cx, cy - 10, w, 3, theme.accent, 1).setDepth(19)
      const under = this.add.rectangle(cx, cy + 11, w - 6, 4, theme.accent, 0.85).setDepth(19).setBlendMode(Phaser.BlendModes.ADD)  // powered underside
      const chev = axis === 'v' ? '↕' : '↔'
      const mark = this.add.text(cx, cy, chev, { fontFamily: 'monospace', fontSize: '12px', color: '#' + theme.accent.toString(16).padStart(6, '0') }).setOrigin(0.5).setAlpha(0.7).setDepth(19)
      m.setData('axis', axis); m.setData('dist', dist); m.setData('spd', spd); m.setData('t', 0)
      m.setData('home', axis === 'v' ? cy : cx)
      m.setData('rider', [glow, rim, under, mark])
      this.decor.push(glow, rim, under, mark)
    })

    // Launch pads — land on one and spring high (reaches ledges a double-jump can't).
    def.bouncers?.forEach(([cx, top, w]) => {
      const s = this.bouncers.create(cx, top - 5, 'pad') as Phaser.Physics.Arcade.Sprite
      s.setDisplaySize(w, 20).setDepth(9).refreshBody()
      s.setData('lastPop', -9999); s.setData('sy', s.scaleY)
      this.decor.push(this.add.rectangle(cx, top - 2, w, 4, 0x6ee7b7, 0.8).setDepth(9).setBlendMode(Phaser.BlendModes.ADD))
      this.decor.push(this.add.rectangle(cx, top - 26, w + 10, 44, 0x10b981, 0.10).setDepth(8).setBlendMode(Phaser.BlendModes.ADD))
    })

    // Extraction beacon at the goal
    if (!(this.goalX === 0 && this.goalY === 0)) {
      const gx = def.goal[0], gy = def.goal[1]
      this.decor.push(this.add.rectangle(gx, gy, 46, 150, theme.accent, 0.14).setDepth(6))
      this.decor.push(this.add.rectangle(gx - 15, gy, 12, 150, theme.rim, 1).setDepth(7))
      this.decor.push(this.add.rectangle(gx + 15, gy, 12, 150, theme.rim, 1).setDepth(7))
      const chev = this.add.text(gx, gy - 96, '▼', { fontFamily: 'monospace', fontSize: '22px', color: '#' + theme.rim.toString(16).padStart(6, '0') }).setOrigin(0.5).setDepth(7)
      this.tweens.add({ targets: chev, y: gy - 76, duration: 700, yoyo: true, repeat: -1 })
      this.decor.push(chev)
    }

    def.turrets.forEach(([x, surY]) => this.spawnEnemy('turret', x, surY - 19, 4 + lvl, 0))
    def.enemies.forEach((e) => this.spawnEnemy(e.kind, e.x, e.y, e.hp, e.speed))
    def.pods.forEach(([x, y, kind]) => this.spawnPowerup(x, y, kind as string))
    this.placeShards(def)
  }

  // Per-theme environmental set-dressing. Procedural props (no art assets) that give
  // each stage a distinct sense of place — city neon+windows, factory pipes+gears, sky
  // clouds+pylons, reactor conduits+coils, throne columns+braziers. All non-colliding,
  // parallaxed, and pushed to `decor` so they clear on rebuild. Depth < 5 sits behind
  // the terrain; depth 9 is a thin foreground haze that never covers the play space.
  private decorateLevel(def: LevelDef, theme: Theme) {
    const w = def.w
    const gy = 600                                   // standard walk surface (horizontal levels)
    const ADD = Phaser.BlendModes.ADD
    // Deterministic per-stage RNG so each layout is stable + hand-tunable across runs.
    let s = (0x9e3779b9 ^ def.name.length) >>> 0
    for (let i = 0; i < def.name.length; i++) s = Math.imul(s ^ def.name.charCodeAt(i), 0x85ebca6b) >>> 0
    const rnd = () => { s = Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) >>> 0; s = Math.imul(s ^ (s >>> 13), 0x297a2d39) >>> 0; return ((s ^ (s >>> 16)) >>> 0) / 4294967296 }
    const R = (a: number, b: number) => a + rnd() * (b - a)
    const RI = (a: number, b: number) => Math.floor(R(a, b + 0.999))
    const keep = <T extends Phaser.GameObjects.GameObject>(o: T): T => { this.decor.push(o); return o }
    const rect = (x: number, y: number, rw: number, rh: number, c: number, a = 1, d = 4, sf = 1) =>
      keep(this.add.rectangle(x, y, rw, rh, c, a).setDepth(d).setScrollFactor(sf))
    const glow = (x: number, y: number, rw: number, rh: number, c: number, a: number, d = 4, sf = 1) =>
      keep(this.add.rectangle(x, y, rw, rh, c, a).setDepth(d).setScrollFactor(sf).setBlendMode(ADD))
    const gc = (x: number, y: number, r: number, c: number, a = 1, d = 4, sf = 1) =>
      keep(this.add.circle(x, y, r, c, a).setDepth(d).setScrollFactor(sf))
    const pulse = (o: Phaser.GameObjects.GameObject, from: number, to: number, dur: number) =>
      this.tweens.add({ targets: o, alpha: { from, to }, duration: dur, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })
    const A = theme.accent, RIM = theme.rim, LED = theme.ledge

    switch (def.theme) {
      case 'streets': {
        // Back tower faces with lit-window grids (slow parallax; extended below the
        // ground so vertical parallax never reveals a gap under the terrain).
        for (let x = 240; x < w - 160; x += RI(320, 470)) {
          const bw = R(120, 220), bh = R(180, 330), top = gy - bh
          rect(x, (top + gy + 160) / 2, bw, bh + 160, 0x140c26, 0.92, 3, 0.6)
          glow(x, top + 3, bw, 5, A, 0.4, 3, 0.6)
          for (let wy = top + 18; wy < gy - 16; wy += 24)
            for (let wx = x - bw / 2 + 14; wx < x + bw / 2 - 12; wx += 22)
              if (rnd() > 0.62) glow(wx, wy, 7, 11, rnd() > 0.72 ? RIM : 0xfbbf24, R(0.22, 0.55), 3, 0.6)
        }
        // Blinking vertical neon signs hung on the faces.
        for (let x = 320; x < w - 220; x += RI(520, 820)) {
          const sy = gy - R(150, 260), sh = R(70, 120), col = rnd() > 0.5 ? RIM : A
          glow(x, sy, 22, sh + 12, col, 0.12, 3, 0.72)
          const sign = glow(x, sy, 11, sh, col, 0.8, 4, 0.72)
          if (rnd() > 0.45) pulse(sign, 0.32, 0.85, R(560, 1150))
        }
        // Street lamps rising from the walkway, each with a soft down-cone.
        for (let x = 280; x < w - 150; x += RI(360, 520)) {
          const dir = rnd() > 0.5 ? 1 : -1
          rect(x, gy - 62, 5, 128, 0x0e0a1a, 0.95, 4)
          rect(x + 13 * dir, gy - 120, 30, 6, LED, 1, 4)
          glow(x + 24 * dir, gy - 114, 10, 6, 0xfff1a8, 0.85, 5)
          keep(this.add.triangle(x + 24 * dir, gy - 40, -15, -72, 15, -72, 0, 0, 0xfff1a8, 0.06).setDepth(4).setBlendMode(ADD))
        }
        // Drifting ground steam (thin foreground band).
        for (let x = 320; x < w - 150; x += RI(440, 660)) {
          const h = keep(this.add.ellipse(x, gy - 8, R(70, 130), 26, 0x6d5a9a, 0.10).setDepth(9).setBlendMode(ADD))
          this.tweens.add({ targets: h, y: gy - 44, alpha: 0, scaleX: 1.6, duration: R(2600, 4200), repeat: -1, ease: 'Sine.easeOut' })
        }
        break
      }

      case 'industrial': {
        // Fat vertical pipes running the back wall, with band highlights + valves.
        for (let x = 240; x < w - 160; x += RI(280, 440)) {
          const pw = R(26, 44), top = gy - R(160, 300)
          rect(x, (top + gy + 140) / 2, pw, (gy + 140) - top, 0x2a1c10, 0.95, 3, 0.7)
          rect(x - pw / 2 + 3, (top + gy) / 2, 3, gy - top, 0xffd9a0, 0.14, 3, 0.7)   // lit edge
          rect(x + pw / 2 - 3, (top + gy) / 2, 4, gy - top, 0x000000, 0.3, 3, 0.7)    // shade edge
          for (let vy = top + 30; vy < gy - 20; vy += RI(70, 120)) rect(x, vy, pw + 10, 9, LED, 0.9, 3, 0.7)  // couplings
        }
        // A long overhead pipe run with joint boxes.
        {
          const py = gy - R(300, 350)
          rect(w / 2, py, w, 14, 0x241a10, 0.9, 3, 0.7)
          rect(w / 2, py - 8, w, 3, 0xffd9a0, 0.12, 3, 0.7)
          for (let x = 200; x < w; x += RI(260, 420)) rect(x, py, 26, 24, LED, 0.95, 3, 0.7)
        }
        // Slow-turning gears (spokes poke past the rim to read as cogs).
        for (let x = 380; x < w - 200; x += RI(560, 900)) {
          const r = R(34, 60), y = gy - R(120, 240)
          const parts: Phaser.GameObjects.GameObject[] = [
            this.add.circle(0, 0, r + 5, RIM, 0.16).setBlendMode(ADD),
            this.add.circle(0, 0, r, 0x241a10, 0.96),
            this.add.circle(0, 0, r * 0.5, LED, 0.9),
            this.add.circle(0, 0, r * 0.18, 0x120c06, 1),
            this.add.rectangle(0, 0, r * 2.3, 6, RIM, 0.45),
            this.add.rectangle(0, 0, 6, r * 2.3, RIM, 0.45),
            this.add.rectangle(0, 0, r * 2.3, 6, RIM, 0.45).setRotation(Math.PI / 4),
            this.add.rectangle(0, 0, r * 2.3, 6, RIM, 0.45).setRotation(-Math.PI / 4),
          ]
          const gear = keep(this.add.container(x, y, parts).setDepth(3).setScrollFactor(0.75))
          this.tweens.add({ targets: gear, angle: rnd() > 0.5 ? 360 : -360, duration: R(9000, 16000), repeat: -1 })
        }
        // Steam vents puffing off the floor.
        for (let x = 300; x < w - 150; x += RI(500, 760)) {
          const v = keep(this.add.ellipse(x, gy - 10, 40, 20, 0xffd9a0, 0.12).setDepth(9).setBlendMode(ADD))
          this.tweens.add({ targets: v, y: gy - 70, scaleX: 2, scaleY: 2.4, alpha: 0, duration: R(1500, 2400), repeat: -1, ease: 'Sine.easeOut' })
        }
        break
      }

      case 'sky': {
        // Drifting cloud banks (deep parallax) built from stacked soft ellipses.
        for (let i = 0; i < 10; i++) {
          const cx = R(200, w - 200), cy = R(80, 360), cw = R(120, 240)
          const puffs: Phaser.GameObjects.GameObject[] = []
          for (let j = 0; j < 4; j++) puffs.push(keep(this.add.ellipse(cx + R(-cw / 2, cw / 2), cy + R(-14, 14), R(70, 130), R(34, 56), 0xbfe6ff, R(0.05, 0.12)).setDepth(2).setScrollFactor(0.35).setBlendMode(ADD)))
          this.tweens.add({ targets: puffs, x: '+=' + R(40, 90), duration: R(9000, 16000), yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })
        }
        // Tall lattice pylons rising behind the rails (legs + rungs + X-braces).
        for (let x = 300; x < w - 200; x += RI(500, 780)) {
          const top = gy - R(220, 340), half = R(26, 40)
          rect(x - half, (top + gy + 120) / 2, 5, (gy + 120) - top, 0x18344a, 0.9, 3, 0.6)
          rect(x + half, (top + gy + 120) / 2, 5, (gy + 120) - top, 0x18344a, 0.9, 3, 0.6)
          const bl = Math.hypot(half * 2, 44), ba = Math.atan2(44, half * 2)
          for (let ry = top + 24; ry < gy; ry += RI(52, 74)) {
            rect(x, ry, half * 2, 4, 0x1d3a57, 0.9, 3, 0.6)                                   // rung
            keep(this.add.rectangle(x, ry + 22, bl, 3, 0x2a4a63, 0.5).setRotation(ba).setDepth(3).setScrollFactor(0.6))   // X-brace
            keep(this.add.rectangle(x, ry + 22, bl, 3, 0x2a4a63, 0.5).setRotation(-ba).setDepth(3).setScrollFactor(0.6))
          }
        }
        // Blinking beacon masts.
        for (let x = 360; x < w - 200; x += RI(600, 900)) {
          const mh = R(120, 200)
          rect(x, gy - mh / 2, 4, mh, 0x14283a, 0.9, 4)
          const light = gc(x, gy - mh, 6, 0xff5566, 0.95, 5)
          glow(x, gy - mh, 16, 16, 0xff5566, 0.4, 4)
          pulse(light, 0.25, 1, R(500, 800))
        }
        break
      }

      case 'core': {
        // Pulsing vertical energy conduits threading the back wall.
        for (let x = 220; x < w - 140; x += RI(200, 320)) {
          const top = gy - R(180, 320)
          rect(x, (top + gy + 140) / 2, 10, (gy + 140) - top, 0x2a0d13, 0.95, 3, 0.7)
          const vein = glow(x, (top + gy) / 2, 4, gy - top, rnd() > 0.5 ? RIM : A, 0.6, 3, 0.7)
          pulse(vein, 0.25, 0.85, R(900, 1700))
          for (let cy = top + 26; cy < gy - 16; cy += RI(60, 100)) glow(x, cy, 16, 5, A, 0.5, 3, 0.7)  // couplings
        }
        // Reactor coil rings that breathe (concentric strokes, pulsing scale).
        for (let x = 420; x < w - 220; x += RI(560, 900)) {
          const y = gy - R(150, 260)
          const halo = gc(x, y, R(60, 90), A, 0.06, 3, 0.75)
          for (let k = 0; k < 3; k++) {
            const ring = keep(this.add.circle(x, y, 26 + k * 16, 0x000000, 0).setStrokeStyle(3, k === 1 ? RIM : A, 0.7).setDepth(3).setScrollFactor(0.75).setBlendMode(ADD))
            this.tweens.add({ targets: ring, scale: { from: 0.85, to: 1.12 }, duration: R(1400, 2200), yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: k * 160 })
          }
          this.tweens.add({ targets: halo, scale: { from: 0.9, to: 1.2 }, alpha: { from: 0.05, to: 0.12 }, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })
        }
        // Warning chevrons stencilled on the floor.
        for (let x = 300; x < w - 150; x += RI(360, 560)) {
          keep(this.add.text(x, gy - 12, '▶▶', { fontFamily: 'monospace', fontSize: '13px', color: '#' + (RIM >>> 0).toString(16).padStart(6, '0') }).setOrigin(0.5).setAlpha(0.28).setDepth(4))
        }
        break
      }

      case 'throne': {
        // Fluted columns framing the hall (base + shaft highlights + capital).
        for (let x = 260; x < w - 160; x += RI(300, 420)) {
          const top = gy - R(240, 340), cw = R(40, 60)
          rect(x, (top + gy + 120) / 2, cw, (gy + 120) - top, 0x2a2040, 0.92, 3, 0.8)
          rect(x - cw / 2 + 5, (top + gy) / 2, 4, gy - top, 0xffe9b0, 0.12, 3, 0.8)
          rect(x + cw / 2 - 5, (top + gy) / 2, 4, gy - top, 0x000000, 0.28, 3, 0.8)
          rect(x, top + 8, cw + 20, 18, LED, 0.95, 3, 0.8)     // capital
          glow(x, top + 8, cw + 26, 20, RIM, 0.14, 3, 0.8)
        }
        // Hanging banners with an emblem, gently swaying from the top.
        for (let x = 360; x < w - 200; x += RI(420, 640)) {
          const by = gy - R(300, 360), bh = R(120, 180)
          const banner = keep(this.add.rectangle(x, by, 46, bh, A, 0.28).setOrigin(0.5, 0).setDepth(4).setScrollFactor(0.85))
          const emblem = keep(this.add.star(x, by + 34, 4, 5, 13, RIM, 0.7).setOrigin(0.5, 0).setDepth(4).setScrollFactor(0.85))
          this.tweens.add({ targets: [banner, emblem], angle: { from: -2.5, to: 2.5 }, duration: R(2400, 3400), yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })
        }
        // Braziers with a flickering flame + rising embers.
        for (let x = 320; x < w - 150; x += RI(440, 640)) {
          rect(x, gy - 26, 22, 12, 0x3a2a1a, 1, 4)               // bowl
          rect(x, gy - 14, 8, 22, 0x2a1f14, 1, 4)                // stand
          const flame = keep(this.add.ellipse(x, gy - 40, 20, 34, 0xffb347, 0.7).setDepth(5).setBlendMode(ADD))
          glow(x, gy - 40, 44, 50, 0xff7a1a, 0.18, 4)
          this.tweens.add({ targets: flame, scaleY: { from: 0.8, to: 1.25 }, scaleX: { from: 1, to: 0.8 }, alpha: { from: 0.55, to: 0.85 }, duration: R(180, 320), yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })
          for (let e = 0; e < 3; e++) {
            const ember = keep(this.add.circle(x + R(-8, 8), gy - 40, R(1.5, 2.6), 0xffcf7a, 0.9).setDepth(9).setBlendMode(ADD))
            this.tweens.add({ targets: ember, y: gy - R(120, 190), x: '+=' + R(-16, 16), alpha: 0, duration: R(1400, 2400), repeat: -1, ease: 'Sine.easeOut', delay: e * 500 })
          }
        }
        break
      }
    }
  }

  private spawnEnemy(kind: string, x: number, y: number, hp: number, speed: number, type?: string) {
    let tex = 'enemy'
    let t = type || 'walker'
    let displayW = 48, displayH = 48

    if (kind === 'soldier' || kind === 'enemy') {
      tex = this.textures.exists('enemy_soldier') ? 'enemy_soldier' : 'enemy'
      t = 'walker'; displayW = 47; displayH = 64
    } else if (kind === 'flyer') {
      tex = this.textures.exists('enemy_flyer') ? 'enemy_flyer' : 'flyer'
      t = 'flyer'; displayW = 56; displayH = 56
    } else if (kind === 'tank') {
      tex = this.textures.exists('enemy_tank') ? 'enemy_tank' : 'tank'
      t = 'tank'; displayW = 88; displayH = 65
    } else if (kind === 'turret') {
      tex = 'turret'; t = 'turret'; displayW = 50; displayH = 42
    } else if (kind === 'charger') {
      tex = this.textures.exists('enemy_soldier') ? 'enemy_soldier' : 'enemy'
      t = 'charger'; displayW = 52; displayH = 70
    } else if (kind === 'diver') {
      tex = this.textures.exists('enemy_flyer') ? 'enemy_flyer' : 'flyer'
      t = 'diver'; displayW = 58; displayH = 58
    } else if (kind === 'boss') {
      tex = this.textures.exists('boss_art') ? 'boss_art' : 'boss'
      t = 'boss'; displayW = 230; displayH = 230
    }

    const enemy = this.enemies.create(x, y, tex) as Phaser.Physics.Arcade.Sprite
    enemy.setDisplaySize(displayW, displayH)
    if (t === 'charger') { enemy.setData('baseTint', 0xff7a3c); enemy.setTint(0xff7a3c) }
    if (t === 'diver') { enemy.setData('baseTint', 0xff4d6d); enemy.setTint(0xff4d6d) }
    enemy.setData('bsx', enemy.scaleX); enemy.setData('bsy', enemy.scaleY)
    enemy.setBounce(0.02)
    enemy.setCollideWorldBounds(false)
    enemy.setData('hp', hp); enemy.setData('maxHp', hp); enemy.setData('speed', speed)
    enemy.setData('type', t)
    enemy.setData('dir', Math.random() > 0.5 ? 1 : -1)
    enemy.setData('shootTimer', Phaser.Math.Between(200, 900))
    enemy.setDepth(18)

    // Materialize: pop in with a quick scale-up + white flash so spawns read with
    // presence instead of blinking into existence. Boss keeps its own entrance.
    if (t !== 'boss') {
      const bsx = enemy.scaleX, bsy = enemy.scaleY
      enemy.setScale(bsx * 0.25, bsy * 0.25).setTint(0xffffff)
      this.tweens.add({ targets: enemy, scaleX: bsx, scaleY: bsy, duration: 210, ease: 'Back.easeOut' })
      this.time.delayedCall(110, () => this.restoreTint(enemy))
    }

    if (t === 'boss') { this.bossRef = enemy; this.createBossBar(hp) }

    if (t === 'flyer' || t === 'boss' || t === 'diver') {
      enemy.setVelocity(speed * (Math.random() > 0.5 ? 1 : -1), t === 'boss' ? 15 : speed * 0.3)
      ;(enemy.body as Phaser.Physics.Arcade.Body).setAllowGravity(false)
    } else if (t === 'turret') {
      ;(enemy.body as Phaser.Physics.Arcade.Body).setAllowGravity(false)
      enemy.setImmovable(true); enemy.setVelocity(0, 0)
    } else {
      enemy.setVelocityX(speed * (enemy.getData('dir') as number))
    }
  }

  private spawnPowerup(x: number, y: number, kind: string) {
    const usePod = this.textures.exists('pickup_pod')
    // Per-kind color so a heal never reads like a weapon. Health owns green; guns own their bullet colors.
    const tints: Record<string, number> = { health: 0x4ade80, spread: 0x22d3ee, rapid: 0xfbbf24, laser: 0xe879f9, fire: 0xfb923c }
    const glyphs: Record<string, string> = { health: '+', spread: 'S', rapid: 'R', laser: 'L', fire: 'F' }
    const color = tints[kind] || 0xffffff
    const tex = usePod ? 'pickup_pod' : ({
      health: 'pow_health', spread: 'pow_spread', rapid: 'pow_rapid', laser: 'pow_laser', fire: 'pow_fire',
    } as Record<string, string>)[kind]
    const p = this.powerups.create(x, y, tex) as Phaser.Physics.Arcade.Sprite
    p.setData('kind', kind)
    if (usePod) { p.setDisplaySize(40, 40); p.setTint(color) }
    p.setBounce(0.5); p.setCollideWorldBounds(false); p.setVelocityY(-120); p.setDepth(14)
    // Glyph badge that rides along with the pod.
    const badge = this.add.text(x, y, glyphs[kind] || '?', { fontFamily: 'monospace', fontSize: '13px', color: '#0a0612', fontStyle: 'bold' }).setOrigin(0.5).setDepth(15)
    p.setData('badge', badge)
    ;(p as Phaser.GameObjects.Sprite).on('destroy', () => badge.destroy())
  }

  private createHUD() {
    this.add.rectangle(78, 47, 150, 94, 0x0a0612, 0.75).setScrollFactor(0).setDepth(99).setStrokeStyle(1, 0xa855f7, 0.5)
    this.scoreText = this.add.text(10, 7, 'SCORE  0', { fontFamily: 'monospace', fontSize: '11px', color: '#e879f9' }).setScrollFactor(0).setDepth(100)
    this.healthText = this.add.text(10, 21, 'HP  ♥♥♥♥♥', { fontFamily: 'monospace', fontSize: '10px', color: '#f472b6' }).setScrollFactor(0).setDepth(100)
    this.livesText = this.add.text(10, 33, 'LIVES  3', { fontFamily: 'monospace', fontSize: '9px', color: '#a1a1aa' }).setScrollFactor(0).setDepth(100)
    this.levelText = this.add.text(10, 44, 'LEVEL  1', { fontFamily: 'monospace', fontSize: '9px', color: '#71717a' }).setScrollFactor(0).setDepth(100)
    this.weaponText = this.add.text(10, 55, 'GUN  NORMAL', { fontFamily: 'monospace', fontSize: '9px', color: '#22d3ee' }).setScrollFactor(0).setDepth(100)
    this.comboText = this.add.text(10, 66, '', { fontFamily: 'monospace', fontSize: '9px', color: '#fbbf24' }).setScrollFactor(0).setDepth(100)
    this.shardText = this.add.text(10, 78, '◆ ' + this.shardsGot + '/' + this.shardsTotal, { fontFamily: 'monospace', fontSize: '9px', color: '#67e8f9' }).setScrollFactor(0).setDepth(100)
    this.add.text(502, 7, 'APEX STRIKE', { fontFamily: 'monospace', fontSize: '9px', color: '#a855f7' }).setOrigin(1, 0).setScrollFactor(0).setDepth(100)
    this.muteIcon = this.add.text(502, 20, this.muted ? '♪ OFF' : '♪ ON', { fontFamily: 'monospace', fontSize: '9px', color: this.muted ? '#ef4444' : '#a5b4fc' }).setOrigin(1, 0).setScrollFactor(0).setDepth(100)
    if (!this.sys.game.device.input.touch) {
      this.add.text(256, 373, 'P pause   ·   M mute   ·   Q swap gun', { fontFamily: 'monospace', fontSize: '8px', color: '#52525b' }).setOrigin(0.5).setScrollFactor(0).setDepth(100)
    }
    // Extraction compass — points to the goal when it's off-screen.
    this.compass = this.add.triangle(256, 192, 0, -9, 18, 0, 0, 9, 0xfbbf24, 0.9).setScrollFactor(0).setDepth(120).setVisible(false)
    this.compass.setStrokeStyle(2, 0x1a1004, 0.6)
  }

  private updateCompass() {
    if (!this.compass) return
    if (this.isBossLevel()) { this.compass.setVisible(false); return }
    const cam = this.cameras.main
    const gx = this.goalX - cam.scrollX, gy = this.goalY - cam.scrollY
    const m = 44
    if (gx > m && gx < 512 - m && gy > m && gy < 384 - m) { this.compass.setVisible(false); return }
    const ang = Math.atan2(gy - 192, gx - 256)
    const cos = Math.cos(ang), sin = Math.sin(ang)
    const halfW = 256 - 26, halfH = 192 - 26
    const d = Math.min(cos !== 0 ? halfW / Math.abs(cos) : Infinity, sin !== 0 ? halfH / Math.abs(sin) : Infinity)
    this.compass.setPosition(256 + cos * d, 192 + sin * d).setRotation(ang).setVisible(true)
  }

  private createTouchControls() {
    this.touchUI = []
    // Enough simultaneous touches for move + aim + jump + fire at once.
    this.input.addPointer(4)
    const btn = (
      x: number, y: number, w: number, h: number, label: string, key: keyof TouchState,
      tint = 0x1e1b4b, rim = 0xa855f7, fs = '11px'
    ) => {
      const bg = this.add.rectangle(x, y, w, h, tint, 0.42).setScrollFactor(0).setDepth(150).setInteractive()
      bg.setStrokeStyle(2, rim, 0.75)
      const txt = this.add.text(x, y, label, { fontFamily: 'monospace', fontSize: fs, color: '#f5f3ff', fontStyle: 'bold' })
        .setOrigin(0.5).setScrollFactor(0).setDepth(151)
      const press = () => { this.touch[key] = true; bg.setFillStyle(rim, 0.55) }
      const release = () => { this.touch[key] = false; bg.setFillStyle(tint, 0.42) }
      bg.on('pointerdown', press)
      bg.on('pointerup', release)
      bg.on('pointerout', release)
      this.touchUI.push(bg, txt)
    }
    // Left thumb — move (violet) + 8-way aim (cyan). Cross layout, bottom-left.
    btn(78, 268, 56, 38, '▲', 'up', 0x134e4a, 0x22d3ee)
    btn(44, 322, 56, 46, '◀', 'left')
    btn(112, 322, 56, 46, '▶', 'right')
    btn(78, 362, 56, 30, '▼', 'down', 0x134e4a, 0x22d3ee)
    // Right thumb — jump (green) + fire (red). Big targets, bottom-right.
    btn(452, 266, 96, 46, 'JUMP', 'jump', 0x14532d, 0x4ade80, '12px')
    btn(452, 338, 96, 66, 'FIRE', 'shoot', 0x4c0519, 0xf43f5e, '13px')
    // Pause + mute + swap, tucked in the gap between the thumb clusters.
    const tapBtn = (x: number, label: string, cb: () => void) => {
      const bg = this.add.rectangle(x, 361, 42, 26, 0x1e1b4b, 0.4).setScrollFactor(0).setDepth(150).setInteractive()
      bg.setStrokeStyle(1, 0xa855f7, 0.6)
      const txt = this.add.text(x, 361, label, { fontFamily: 'monospace', fontSize: '11px', color: '#e9d5ff' }).setOrigin(0.5).setScrollFactor(0).setDepth(151)
      bg.on('pointerdown', cb)
      this.touchUI.push(bg, txt)
    }
    tapBtn(228, 'II', () => this.togglePause())
    tapBtn(284, '♪', () => this.toggleMute())
    tapBtn(340, '⇄', () => this.swapWeapon())

    // Toggle to hide/show the on-screen controls — handy on an iPad with a
    // keyboard or controller attached. Choice is remembered across sessions.
    try { this.touchHidden = localStorage.getItem('apex_touch') === 'off' } catch { /* ignore */ }
    const toggle = this.add.text(502, 38, '', {
      fontFamily: 'monospace', fontSize: '10px', color: '#c4b5fd',
      backgroundColor: '#0a0612', padding: { x: 6, y: 3 },
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(160).setInteractive({ useHandCursor: true })
    toggle.on('pointerdown', () => this.setTouchControlsHidden(!this.touchHidden))
    this.touchToggle = toggle
    this.applyTouchControls()
  }

  private setTouchControlsHidden(hidden: boolean) {
    this.touchHidden = hidden
    try { localStorage.setItem('apex_touch', hidden ? 'off' : 'on') } catch { /* ignore */ }
    // Drop any held inputs so nothing sticks when the pads vanish.
    if (hidden) this.touch = { left: false, right: false, jump: false, shoot: false, up: false, down: false }
    this.applyTouchControls()
  }

  private applyTouchControls() {
    const vis = !this.touchHidden
    this.touchUI.forEach((o) => {
      const go = o as Phaser.GameObjects.GameObject & { setVisible?: (v: boolean) => void; input?: { enabled: boolean } | null }
      go.setVisible?.(vis)
      if (go.input) go.input.enabled = vis  // hidden pads must not swallow taps
    })
    this.touchToggle?.setText(this.touchHidden ? '⌨ Controls: OFF' : '⌨ Controls: ON')
  }

  private controllerToast() {
    if (this.controllerSeen) return
    this.controllerSeen = true
    const t = this.add.text(256, 28, '🎮  CONTROLLER READY', {
      fontFamily: 'monospace', fontSize: '11px', color: '#67e8f9',
      backgroundColor: '#0a0612', padding: { x: 8, y: 4 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(210).setAlpha(0)
    this.tweens.add({ targets: t, alpha: 1, duration: 200, yoyo: true, hold: 1400, onComplete: () => t.destroy() })
  }

  private screenToast(text: string, color = '#a5b4fc', y = 120) {
    const t = this.add.text(256, y, text, { fontFamily: 'monospace', fontSize: '12px', color })
      .setOrigin(0.5).setScrollFactor(0).setDepth(232).setAlpha(0)
    this.tweens.add({ targets: t, alpha: 1, duration: 160, yoyo: true, hold: 800, onComplete: () => t.destroy() })
  }

  private togglePause() {
    if (!this.started || this.gameOver || this.levelTransition || !this.player?.active) return
    this.userPaused = !this.userPaused
    if (this.userPaused) {
      this.physics.pause()
      const dim = this.add.rectangle(256, 192, 512, 384, 0x05040a, 0.72).setScrollFactor(0).setDepth(230)
      const title = this.add.text(256, 148, 'PAUSED', { fontFamily: 'monospace', fontSize: '26px', color: '#e879f9' }).setOrigin(0.5).setScrollFactor(0).setDepth(231)
      const hint = this.add.text(256, 190, 'P / Start  resume        M  ' + (this.muted ? 'unmute' : 'mute'), { fontFamily: 'monospace', fontSize: '10px', color: '#a5b4fc' }).setOrigin(0.5).setScrollFactor(0).setDepth(231)
      const resume = this.add.text(256, 226, '[ RESUME ]', { fontFamily: 'monospace', fontSize: '12px', color: '#86efac' }).setOrigin(0.5).setScrollFactor(0).setDepth(231).setInteractive({ useHandCursor: true })
      resume.on('pointerdown', () => this.togglePause())
      const restart = this.add.text(256, 254, '[ RESTART MISSION ]', { fontFamily: 'monospace', fontSize: '11px', color: '#c4b5fd' }).setOrigin(0.5).setScrollFactor(0).setDepth(231).setInteractive({ useHandCursor: true })
      restart.on('pointerdown', () => this.scene.restart())
      this.pauseUI = [dim, title, hint, resume, restart]
    } else {
      this.physics.resume()
      this.pauseUI.forEach((o) => o.destroy())
      this.pauseUI = []
    }
  }

  private toggleMute() {
    this.muted = !this.muted
    try { localStorage.setItem('apex_muted', this.muted ? '1' : '0') } catch { /* ignore */ }
    this.sfx?.setMuted(this.muted)
    if (this.muteIcon) { this.muteIcon.setText(this.muted ? '♪ OFF' : '♪ ON'); this.muteIcon.setColor(this.muted ? '#ef4444' : '#a5b4fc') }
    this.screenToast(this.muted ? 'SOUND OFF' : 'SOUND ON')
  }

  private collectShard(
    _p: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    sObj: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile
  ) {
    const s = sObj as Phaser.Physics.Arcade.Sprite
    if (!s.active) return
    this.tweens.killTweensOf(s)
    s.destroy()
    this.shardsGot++
    this.score += 75
    this.scoreText.setText('SCORE  ' + this.score)
    this.shardText?.setText('◆ ' + this.shardsGot + '/' + this.shardsTotal)
    this.particles.emitParticleAt(s.x, s.y, 12)
    this.shockwave(s.x, s.y, 0x67e8f9, 18)
    this.popup(s.x, s.y - 16, '+75', '#67e8f9')
    this.sfx?.pickup()
    if (this.shardsTotal > 0 && this.shardsGot === this.shardsTotal) {
      this.score += 500
      this.scoreText.setText('SCORE  ' + this.score)
      this.screenToast('ALL SHARDS  +500', '#67e8f9', 118)
    }
  }

  // Reward exploration — explicit shard spots (e.g. from the Level Lab) win;
  // otherwise a shard hovers over most ledges + wide ground spans.
  private placeShards(def: LevelDef) {
    let chosen: [number, number][]
    if (def.shards && def.shards.length) {
      chosen = def.shards
    } else {
      const spots: [number, number][] = []
      def.plats.forEach(([cx, top]) => spots.push([cx, top - 26]))
      def.ground.forEach(([x1, x2, top]) => { if (x2 - x1 > 320) spots.push([(x1 + x2) / 2, top - 30]) })
      Phaser.Utils.Array.Shuffle(spots)
      chosen = spots.filter(([x]) => Math.abs(x - def.spawn[0]) > 130).slice(0, 12)
    }
    chosen.forEach(([x, y]) => this.spawnShard(x, y))
    this.shardsTotal = chosen.length
    this.shardText?.setText('◆ 0/' + this.shardsTotal)
  }

  private spawnShard(x: number, y: number) {
    const s = this.shards.create(x, y, 'shard') as Phaser.Physics.Arcade.Sprite
    s.setDepth(13); s.setDisplaySize(20, 20)
    ;(s.body as Phaser.Physics.Arcade.Body).setAllowGravity(false)
    this.tweens.add({ targets: s, angle: 360, duration: 2600, repeat: -1 })
    this.tweens.add({ targets: s, y: y - 7, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.inOut' })
  }

  private createBossBar(maxHp: number) {
    this.destroyBossBar()
    const w = 300
    const frame = this.add.rectangle(256, 26, w + 8, 16, 0x0a0612, 0.85).setScrollFactor(0).setDepth(205).setStrokeStyle(1, 0xf43f5e, 0.85)
    const fill = this.add.rectangle(256 - w / 2, 26, w, 10, 0xf43f5e, 1).setOrigin(0, 0.5).setScrollFactor(0).setDepth(206)
    const label = this.add.text(256, 12, 'APEX SENTINEL', { fontFamily: 'monospace', fontSize: '9px', color: '#fca5a5' }).setOrigin(0.5).setScrollFactor(0).setDepth(206)
    fill.setData('max', maxHp)
    this.bossBarFill = fill
    this.bossBar = [frame, fill, label]
  }

  private updateBossBar() {
    const boss = this.bossRef
    if (!boss || !boss.active) { this.destroyBossBar(); this.bossRef = undefined; return }
    if (!this.bossBarFill) return
    const hp = Math.max(0, boss.getData('hp') as number)
    const max = this.bossBarFill.getData('max') as number
    const frac = Phaser.Math.Clamp(hp / max, 0, 1)
    this.bossBarFill.scaleX = frac
    this.bossBarFill.setFillStyle(frac > 0.5 ? 0xf43f5e : frac > 0.25 ? 0xfb923c : 0xfbbf24, 1)
  }

  private destroyBossBar() {
    this.bossBar.forEach((o) => o.destroy())
    this.bossBar = []
    this.bossBarFill = undefined
  }

  private showBanner(title: string, subtitle: string) {
    const t = this.add.text(256, 150, title + '\n' + subtitle, {
      fontFamily: 'monospace', fontSize: '18px', color: '#22d3ee', align: 'center',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(200).setAlpha(0)
    this.tweens.add({ targets: t, alpha: 1, duration: 300, yoyo: true, hold: 700, onComplete: () => t.destroy() })
  }

  private showTitle() {
    this.physics.pause()
    let best = 0
    try { best = parseInt(localStorage.getItem('apex_best') || '0', 10) || 0 } catch { best = 0 }
    const els: Phaser.GameObjects.GameObject[] = []
    els.push(this.add.rectangle(256, 192, 512, 384, 0x05040a, 0.68).setScrollFactor(0).setDepth(240))
    if (this.textures.exists('logo')) {
      const logo = this.add.image(256, 132, 'logo').setScrollFactor(0).setDepth(241)
      const src = this.textures.get('logo').getSourceImage() as { width: number; height: number }
      const sc = Math.min(320 / (src.width || 320), 168 / (src.height || 168))
      logo.setScale(sc)
      els.push(logo)
    }
    els.push(this.add.text(256, 214, 'APEX  STRIKE', { fontFamily: 'monospace', fontSize: '22px', color: '#e879f9', fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(241))
    els.push(this.add.text(256, 236, 'a Cluck Norris production', { fontFamily: 'monospace', fontSize: '8px', color: '#7c6f9c' }).setOrigin(0.5).setScrollFactor(0).setDepth(241))
    if (best > 0) els.push(this.add.text(256, 256, 'BEST  ' + best, { fontFamily: 'monospace', fontSize: '10px', color: '#67e8f9' }).setOrigin(0.5).setScrollFactor(0).setDepth(241))
    const prompt = this.add.text(256, 292, this.sys.game.device.input.touch ? '▶  TAP TO START' : '▶  PRESS ANY KEY TO START', { fontFamily: 'monospace', fontSize: '12px', color: '#f5f3ff' }).setOrigin(0.5).setScrollFactor(0).setDepth(241)
    this.tweens.add({ targets: prompt, alpha: 0.32, duration: 620, yoyo: true, repeat: -1 })
    els.push(prompt)
    els.push(this.add.text(256, 322, 'move · double-jump · 8-way aim · hold to fire', { fontFamily: 'monospace', fontSize: '8px', color: '#71717a' }).setOrigin(0.5).setScrollFactor(0).setDepth(241))
    this.titleUI = els
    this.input.keyboard!.once('keydown', () => this.beginPlay())
    this.input.once('pointerdown', () => this.beginPlay())
  }

  private beginPlay() {
    if (this.started) return
    this.started = true
    this.sfx?.resume()
    this.sfx?.startMusic()
    this.titleUI.forEach((o) => o.destroy())
    this.titleUI = []
    this.physics.resume()
    const d = this.levels()[this.level - 1]
    this.showBanner('LEVEL 1', d?.name || '')
  }

  private popup(x: number, y: number, text: string, color = '#e879f9') {
    const t = this.add.text(x, y, text, { fontFamily: 'monospace', fontSize: '11px', color }).setOrigin(0.5).setDepth(50)
    this.tweens.add({ targets: t, y: y - 36, alpha: 0, duration: 600, onComplete: () => t.destroy() })
  }

  update(time: number, delta: number) {
    this.routeCameras()  // route any newly-spawned objects to the right camera
    if (this.gameOver) return
    if (!this.started) {
      const gp = this.input.gamepad?.getPad(0)
      if (gp && (gp.A || gp.buttons[0]?.pressed || gp.buttons[9]?.pressed)) this.beginPlay()
      return
    }
    // Gamepad Start / Select toggles pause (edge-detected) — polled even while paused.
    const spad = this.input.gamepad?.getPad(0)
    const startNow = !!(spad && (spad.buttons[9]?.pressed || spad.buttons[8]?.pressed))
    if (startNow && !this.prevStart) this.togglePause()
    this.prevStart = startNow
    if (this.userPaused) return
    if (this.levelTransition || !this.player?.active) return
    if (this.bossRef) this.updateBossBar()
    this.updateCompass()

    const body = this.player.body as Phaser.Physics.Arcade.Body
    const landed = !this.prevOnGround && body.blocked.down
    this.onGround = body.blocked.down
    if (this.onGround) {
      this.lastGroundAt = time
      this.jumpsLeft = MAX_JUMPS
      if (this.player.y < this.levelH) { this.lastGroundX = this.player.x; this.lastGroundY = this.player.y }
    }
    if (landed && this.fallSpeed > 380) this.landingDust(this.fallSpeed)
    if (landed && this.airborneT > 170) this.landRecoverUntil = time + 100   // brief crouch after a real jump/fall
    this.prevOnGround = this.onGround
    if (!this.onGround) { this.fallSpeed = body.velocity.y; this.airborneT += delta } else this.airborneT = 0
    this.drawShadows()

    // Fell into a pit (below the content floor)
    if (this.player.y > this.levelH + 150) { this.pitFall(); return }

    // Parallax — both axes for the 2D world
    const cx = this.cameras.main.scrollX, cy = this.cameras.main.scrollY
    this.bgStars.tilePositionX = cx * 0.1; this.bgStars.tilePositionY = cy * 0.05
    this.bgFar.tilePositionX = cx * 0.22; this.bgFar.tilePositionY = cy * 0.1
    this.bgMid.tilePositionX = cx * 0.45; this.bgMid.tilePositionY = cy * 0.2

    if (this.combo > 0) {
      this.comboTimer -= delta
      if (this.comboTimer <= 0) { this.combo = 0; this.comboText.setText('') }
    }

    // Pose: land-recover → jump (airborne) → crouch (down) → run (2-frame bound) → ready.
    if (this.textures.exists('huntress')) {
      const moving = Math.abs(body.velocity.x) > 24
      let key = 'huntress'
      if (time < this.landRecoverUntil && this.textures.exists('huntress_crouch')) key = 'huntress_crouch'
      else if (!this.onGround && this.textures.exists('huntress_jump')) key = 'huntress_jump'
      else if (this.prone && this.textures.exists('huntress_crouch')) key = 'huntress_crouch'
      else if (moving && this.textures.exists('huntress_run')) {
        // Bounding run: alternate the extended lunge and the gathered frame (the
        // height difference between them reads as a natural running bob).
        this.runFrameT += delta
        if (this.runFrameT > 115) { this.runFrameT = 0; this.runFrame ^= 1 }
        key = (this.runFrame === 1 && this.textures.exists('huntress_run2')) ? 'huntress_run2' : 'huntress_run'
      } else { this.runFrame = 0; this.runFrameT = 0 }
      if (this.player.texture.key !== key) { this.player.setTexture(key); this.sizePlayer() }
    }

    // Reached the extraction point? (boss levels clear by kill-all instead)
    if (!this.isBossLevel()) {
      const dx = this.player.x - this.goalX, dy = this.player.y - this.goalY
      if (dx * dx + dy * dy < 70 * 70) { this.onLevelClear(); return }
    }

    this.handleInput(time)
    this.updateMovers(delta)
    this.updateEnemies(delta)
    this.maybeSpawnReinforcements(delta)
  }

  // Sine-driven moving platforms. Static bodies don't impart motion, so we
  // reposition each one and manually carry the player. "Riding" is detected by
  // foot proximity + not-jumping (NOT blocked.down, which flickers when a
  // descending platform opens a gap under the feet). Each riding frame we snap
  // the feet to the new surface and kill downward velocity → locked-in lifts,
  // no jitter, no fall-through, and stepping off never launches you.
  private updateMovers(delta: number) {
    if (this.movers.getLength() === 0) return
    const pb = this.player?.body as Phaser.Physics.Arcade.Body | undefined
    this.movers.getChildren().forEach((c) => {
      const m = c as Phaser.Physics.Arcade.Sprite
      const mb = m.body as Phaser.Physics.Arcade.StaticBody
      const axis = m.getData('axis') as string
      const home = m.getData('home') as number
      const dist = m.getData('dist') as number
      const spd = m.getData('spd') as number
      const t = (m.getData('t') as number) + delta * 0.001 * spd
      m.setData('t', t)
      const prevX = m.x, prevY = m.y
      // Riding = feet near this platform's (pre-move) top, over it in x, and not
      // launching upward. Wider than a blocked.down check so descents stay glued.
      const feetGap = pb ? pb.bottom - mb.top : 999
      const riding = !!pb && pb.velocity.y > -30 &&
        feetGap > -12 && feetGap < 10 &&
        pb.right > mb.left + 3 && pb.left < mb.right - 3
      const off = Math.sin(t) * dist
      if (axis === 'v') m.y = home + off; else m.x = home + off
      const dx = m.x - prevX, dy = m.y - prevY
      mb.updateFromGameObject()
      const riders = m.getData('rider') as Array<{ x: number; y: number }> | undefined
      if (riders) for (const r of riders) { r.x += dx; r.y += dy }
      if (riding && pb) {
        if (dx) this.player.x += dx
        // Snap feet exactly onto the new surface (handles up + down identically).
        this.player.y += mb.top - pb.bottom
        if (pb.velocity.y > 0) pb.setVelocityY(0)
      }
    })
  }

  // Launch pad: land on top → spring high and refresh air-jumps. Guarded so a
  // side-brush doesn't fire, and rate-limited so one contact pops just once.
  private bounce(pad: Phaser.Physics.Arcade.Sprite) {
    const pb = this.player.body as Phaser.Physics.Arcade.Body
    if (pb.velocity.y < -20) return                       // already rising — not a landing
    const padTop = (pad.body as Phaser.Physics.Arcade.StaticBody).top
    if (pb.bottom > padTop + 18) return                   // must contact near the top face
    const now = this.time.now
    if (now - (pad.getData('lastPop') as number) < 250) return
    pad.setData('lastPop', now)
    pb.setVelocityY(-820)                                 // double-jump apex is ~ -560; this clears higher
    this.jumpsLeft = MAX_JUMPS                            // give the air-jumps back after a launch
    this.sfx?.jump()
    const sy = (pad.getData('sy') as number) || pad.scaleY
    this.tweens.killTweensOf(pad)
    pad.scaleY = sy * 0.55                                // squash, then spring back
    this.tweens.add({ targets: pad, scaleY: sy, duration: 200, ease: 'Back.out' })
    this.particles?.emitParticleAt(this.player.x, padTop, 8)
  }

  private pitFall() {
    if (this.gameOver || this.levelTransition) return
    this.player.setVelocity(0, 0)
    this.player.setPosition(this.lastGroundX, this.lastGroundY - 48)
    this.cameras.main.shake(180, 0.02)
    this.cameras.main.flash(120, 120, 40, 200, false)
    this.sfx?.hurt()
    this.health -= 2
    this.combo = 0; this.comboText.setText('')
    this.updateHealth()
    this.invulnerable = true
    this.player.setTint(0xff3060)
    this.time.delayedCall(700, () => { this.invulnerable = false; if (this.player.active) this.player.clearTint() })
    if (this.health <= 0) {
      this.lives -= 1; this.livesText.setText('LIVES  ' + this.lives)
      if (this.lives <= 0) this.triggerGameOver()
      else {
        this.health = 5; this.updateHealth(); this.jumpsLeft = MAX_JUMPS; this.invulnerable = true
        this.time.delayedCall(1300, () => { this.invulnerable = false; if (this.player.active) this.player.clearTint() })
      }
    }
  }

  private maybeSpawnReinforcements(delta: number) {
    if (this.isBossLevel()) return
    this.spawnTimer += delta
    const interval = 3400 - this.level * 280
    if (this.spawnTimer > interval && this.enemies.countActive(true) < 12 + this.level) {
      this.spawnTimer = 0
      const camX = this.cameras.main.scrollX
      const side = Phaser.Math.Clamp(Math.random() > 0.5 ? camX + 540 : camX - 20, 40, this.levelW - 40)
      const camTop = this.cameras.main.scrollY
      if (Math.random() > 0.42) {
        this.spawnEnemy('flyer', side, Phaser.Math.Clamp(camTop + Phaser.Math.Between(60, 260), 40, this.levelH), 2 + Math.floor(this.level / 2), 48 + this.level * 6)
      } else {
        this.spawnEnemy('soldier', side, camTop + 40, 2 + Math.floor(this.level / 2), 55 + this.level * 8, 'walker')
      }
    }
  }

  private handleInput(time: number) {
    const body = this.player.body as Phaser.Physics.Arcade.Body

    let left = this.cursors.left.isDown || this.wasd.left.isDown || this.touch.left
    let right = this.cursors.right.isDown || this.wasd.right.isDown || this.touch.right
    let shoot = this.spaceKey.isDown || this.touch.shoot
    let jump = this.cursors.up.isDown || this.wasd.up.isDown || this.touch.jump
    this.aimUp = this.touch.up || this.cursors.up.isDown || this.wasd.up.isDown
    this.aimDown = this.wasd.down.isDown || this.cursors.down.isDown || this.touch.down

    const pad = this.input.gamepad?.getPad(0)
    if (pad) {
      if (pad.left || (pad.axes[0] && pad.axes[0].getValue() < -0.3)) left = true
      if (pad.right || (pad.axes[0] && pad.axes[0].getValue() > 0.3)) right = true
      if (pad.X || pad.buttons[2]?.pressed || pad.buttons[7]?.pressed) shoot = true
      if (pad.A || pad.buttons[0]?.pressed) jump = true
      if (pad.up || (pad.axes[1] && pad.axes[1].getValue() < -0.3)) this.aimUp = true
      if (pad.down || (pad.axes[1] && pad.axes[1].getValue() > 0.3)) this.aimDown = true
      // Y (button 3) swaps weapons, edge-triggered so a held button fires once.
      const yNow = !!(pad.Y || pad.buttons[3]?.pressed)
      if (yNow && !this.padSwapPrev) this.swapWeapon()
      this.padSwapPrev = yNow
    }

    this.movingH = left || right
    this.prone = this.onGround && this.aimDown && !this.movingH

    // --- Horizontal: acceleration + drag, with snappy reverse ---
    const accel = this.onGround ? ACCEL : AIR_ACCEL
    if (this.movingH && !this.prone) {
      if (left) {
        this.player.setAccelerationX(body.velocity.x > 0 ? -accel * 2 : -accel)
        this.facingRight = false; this.player.setFlipX(true)
      } else {
        this.player.setAccelerationX(body.velocity.x < 0 ? accel * 2 : accel)
        this.facingRight = true; this.player.setFlipX(false)
      }
    } else {
      this.player.setAccelerationX(0)
      this.player.setDragX(DRAG)
    }

    // --- Jump: coyote time + input buffering + variable height + double jump ---
    if (!this.onGround && time - this.lastGroundAt > COYOTE && this.jumpsLeft > 1) this.jumpsLeft = 1
    if (jump && !this.prevJump) this.jumpBufferAt = time
    if (time - this.jumpBufferAt < BUFFER && this.jumpsLeft > 0) {
      this.player.setVelocityY(JUMP_V)
      this.jumpsLeft--; this.isJumping = true; this.jumpBufferAt = -9999
      this.sfx?.jump()
    }
    if (this.isJumping && !jump && body.velocity.y < SHORT_HOP) this.player.setVelocityY(SHORT_HOP)
    if (body.velocity.y >= 0) this.isJumping = false
    this.prevJump = jump

    // Asymmetric gravity: fall faster than you rise (snap)
    body.setGravityY(body.velocity.y > 0 ? FALL_BOOST : 0)

    if (shoot && time > this.lastFired) {
      this.fire()
      let rate = this.fireRate
      if (this.weapon === 'rapid') rate = 40
      else if (this.weapon === 'laser') rate = 70
      else if (this.weapon === 'spread') rate = 90
      else if (this.weapon === 'fire') rate = 85
      this.lastFired = time + rate
    }
  }

  private fire() {
    const dir = this.facingRight ? 1 : -1
    let angle = 0
    if (this.aimUp && !this.aimDown) angle = this.movingH ? -45 : -90
    else if (this.aimDown && !this.onGround) angle = this.movingH ? 45 : 90

    // Muzzle tracks the aim: reach the barrel out from the huntress's hands along
    // the aim angle, so the flash + bullets emanate from where you're shooting.
    const aimRad = Phaser.Math.DegToRad(angle)
    const pivotX = this.player.x + dir * 6
    const pivotY = this.prone ? this.player.y + 14 : this.player.y - 6
    const barrel = this.prone ? 30 : 34
    const baseX = pivotX + Math.cos(aimRad) * dir * barrel
    const baseY = pivotY + Math.sin(aimRad) * barrel

    const spawn = (ang: number, tex = 'bullet', spd = 800, scale = 0.6) => {
      const b = this.bullets.get(baseX, baseY, tex) as Phaser.Physics.Arcade.Image
      if (!b) return
      b.setActive(true).setVisible(true); b.setScale(scale); b.setDepth(20)
      b.body?.reset(baseX, baseY)
      ;(b.body as Phaser.Physics.Arcade.Body).setAllowGravity(false)   // pooled bodies: keep them flat
      const rad = Phaser.Math.DegToRad(ang)
      const isVert = ang === -90 || ang === 90
      const vx = isVert ? 0 : Math.cos(rad) * dir * spd
      const vy = Math.sin(rad) * spd
      b.setVelocity(vx, vy)
      b.setRotation(Math.atan2(vy, vx))   // bolt points where it flies
      this.time.delayedCall(1400, () => { if (b.active) b.setActive(false).setVisible(false) })   // longer reach
    }

    this.particles.emitParticleAt(baseX, baseY, 3)
    if (this.time.now - this.lastSfxShot > 55) { this.sfx?.shoot(); this.lastSfxShot = this.time.now }
    this.muzzleFlash(baseX, baseY, dir, angle)

    if (this.weapon === 'spread') {
      spawn(angle - 20, 'bullet', 780, 0.55); spawn(angle, 'bullet', 820, 0.64); spawn(angle + 20, 'bullet', 780, 0.55)
    } else if (this.weapon === 'laser') {
      spawn(angle, 'laser', 1120, 0.9); spawn(angle, 'laser', 1060, 0.7)
    } else if (this.weapon === 'fire') {
      spawn(angle, 'fireball', 640, 0.78); spawn(angle - 14, 'fireball', 600, 0.62); spawn(angle + 14, 'fireball', 600, 0.62)
    } else if (this.weapon === 'rapid') {
      spawn(angle, 'bullet', 840, 0.5)
    } else {
      spawn(angle, 'bullet', 800, 0.62)
    }
  }

  // Soft elliptical drop shadows, redrawn each frame — grounds the player and
  // ground enemies against the busy backdrops. One Graphics object, no per-entity
  // lifecycle to leak. Player shadow rides the last ground height and fades on jumps.
  private drawShadows() {
    const g = this.shadowGfx
    if (!g) return
    g.clear()
    // Feet offset derived from the body so it tracks any display-size change.
    const feetOff = (this.player.body as Phaser.Physics.Arcade.Body).bottom - this.player.y
    const groundY = this.lastGroundY + feetOff
    const pFeet = this.player.y + feetOff
    const lift = Phaser.Math.Clamp((groundY - pFeet) / 140, 0, 1)  // 0 grounded → 1 high
    g.fillStyle(0x000000, 0.34 * (1 - lift * 0.75))
    g.fillEllipse(this.player.x, Math.max(groundY, pFeet), 52 * (1 - lift * 0.4), 13 * (1 - lift * 0.4))
    const grounded = GROUND_ENEMIES
    this.enemies.getChildren().forEach((c) => {
      const e = c as Phaser.Physics.Arcade.Sprite
      if (!e.active || !grounded.has(e.getData('type') as string)) return
      g.fillStyle(0x000000, 0.3)
      g.fillEllipse(e.x, e.y + e.displayHeight * 0.44, e.displayWidth * 0.55, e.displayHeight * 0.13)
    })
  }

  private updateEnemies(delta: number) {
    this.enemies.getChildren().forEach((child) => {
      const enemy = child as Phaser.Physics.Arcade.Sprite
      if (!enemy.active) return
      const type = enemy.getData('type') as string

      if (type !== 'turret' && enemy.y > this.levelH + 220) { enemy.destroy(); return }

      const speed = enemy.getData('speed') as number
      const body = enemy.body as Phaser.Physics.Arcade.Body

      if (type === 'walker' || type === 'tank') {
        if (body.blocked.left || body.blocked.right) {
          const d = -(enemy.getData('dir') as number)
          enemy.setData('dir', d); enemy.setVelocityX(d * speed); enemy.setFlipX(d < 0)
        }
      }
      if (type === 'flyer') {
        const dx = this.player.x - enemy.x, dy = this.player.y - enemy.y - 40
        enemy.setVelocityX(Phaser.Math.Clamp(dx * 0.55, -speed, speed))
        enemy.setVelocityY(Phaser.Math.Clamp(dy * 0.35, -speed * 0.6, speed * 0.6))
        enemy.setFlipX(dx < 0)
      }
      if (type === 'turret') enemy.setFlipX(this.player.x < enemy.x)
      if (type === 'boss') {
        const hp = enemy.getData('hp') as number, maxHp = enemy.getData('maxHp') as number
        if (hp / maxHp < 0.5 && this.bossPhase === 1) {
          this.bossPhase = 2
          this.popup(enemy.x, enemy.y - 60, 'PHASE 2', '#f43f5e')
          this.cameras.main.shake(250, 0.025)
        }
        const spd = this.bossPhase === 2 ? speed * 1.45 : speed
        const dx = this.player.x - enemy.x
        enemy.setVelocityX(Phaser.Math.Clamp(dx * 0.5, -spd, spd))
        enemy.setVelocityY(Math.sin(this.time.now / (this.bossPhase === 2 ? 180 : 280)) * (this.bossPhase === 2 ? 70 : 45))
        enemy.setFlipX(dx < 0)
      }
      if (type === 'charger') {
        const st = (enemy.getData('cstate') as string) || 'patrol'
        const ct = ((enemy.getData('ctimer') as number) || 0) - delta
        const dx = this.player.x - enemy.x
        const adx = Math.abs(dx), ady = Math.abs(this.player.y - enemy.y)
        if (st === 'patrol') {
          if (body.blocked.left || body.blocked.right) enemy.setData('dir', -(enemy.getData('dir') as number))
          const d = enemy.getData('dir') as number
          enemy.setVelocityX(speed * d); enemy.setFlipX(d < 0)
          if (adx < 400 && ady < 74 && ct <= 0) {
            // Lock on: face the player, freeze, and wind up (telegraph flash).
            enemy.setData('cstate', 'wind'); enemy.setData('ctimer', 340)
            enemy.setData('dir', dx < 0 ? -1 : 1); enemy.setFlipX(dx < 0)
            enemy.setVelocityX(0); enemy.setTintFill(0xffe08a)
          } else enemy.setData('ctimer', ct)
        } else if (st === 'wind') {
          enemy.setVelocityX(0)
          if (ct <= 0) {
            enemy.setData('cstate', 'dash'); enemy.setData('ctimer', 560)
            this.restoreTint(enemy)
            const d = enemy.getData('dir') as number
            enemy.setVelocityX(360 * d); enemy.setFlipX(d < 0)
            this.sfx?.dash()
          } else enemy.setData('ctimer', ct)
        } else if (st === 'dash') {
          if (ct <= 0 || body.blocked.left || body.blocked.right) {
            enemy.setData('cstate', 'cool'); enemy.setData('ctimer', 950); enemy.setVelocityX(0)
          } else enemy.setData('ctimer', ct)
        } else {
          enemy.setVelocityX(0)
          if (ct <= 0) { enemy.setData('cstate', 'patrol'); enemy.setData('ctimer', 0) } else enemy.setData('ctimer', ct)
        }
      }
      if (type === 'diver') {
        const st = (enemy.getData('dstate') as string) || 'hover'
        const dt = ((enemy.getData('dtimer') as number) || 0) - delta
        const dx = this.player.x - enemy.x
        if (st === 'hover') {
          // Stalk from above: home horizontally, hold a band ~170px over the player.
          const dy = (this.player.y - 170) - enemy.y
          enemy.setVelocityX(Phaser.Math.Clamp(dx * 0.8, -speed * 1.4, speed * 1.4))
          enemy.setVelocityY(Phaser.Math.Clamp(dy * 0.6, -speed * 1.2, speed * 1.2))
          enemy.setFlipX(dx < 0)
          if (Math.abs(dx) < 240 && enemy.y < this.player.y - 80 && dt <= 0) {
            enemy.setData('dstate', 'wind'); enemy.setData('dtimer', 300)
            enemy.setVelocity(0, 0); enemy.setTintFill(0xffe08a)
          } else enemy.setData('dtimer', dt)
        } else if (st === 'wind') {
          enemy.setVelocity(0, -12)
          if (dt <= 0) {
            enemy.setData('dstate', 'dive'); enemy.setData('dtimer', 700)
            this.restoreTint(enemy)
            enemy.setVelocity(Phaser.Math.Clamp(dx, -140, 140), 380); enemy.setFlipX(dx < 0)
            this.sfx?.dash()
          } else enemy.setData('dtimer', dt)
        } else if (st === 'dive') {
          if (dt <= 0 || body.blocked.down || enemy.y > this.levelH - 40) {
            enemy.setData('dstate', 'recover'); enemy.setData('dtimer', 800)
          } else enemy.setData('dtimer', dt)
        } else {
          enemy.setVelocityX(Phaser.Math.Clamp(dx * 0.3, -speed * 0.5, speed * 0.5))
          enemy.setVelocityY(-150)
          if (dt <= 0) { enemy.setData('dstate', 'hover'); enemy.setData('dtimer', 0) } else enemy.setData('dtimer', dt)
        }
      }

      if (type === 'tank' || type === 'flyer' || type === 'boss' || type === 'turret') {
        let timer = enemy.getData('shootTimer') as number
        timer -= delta
        // Don't let off-screen enemies snipe you — only fire when roughly on-screen (the boss always fires).
        const near = type === 'boss' || (Math.abs(enemy.x - this.player.x) < 600 && Math.abs(enemy.y - this.player.y) < 380)
        const alive = (enemy.getData('hp') as number) > 0
        // Telegraph: a brief wind-up flash before boss/turret volleys so they read as fair.
        if (alive && near && (type === 'boss' || type === 'turret') && timer <= 260 && timer > 40 && !enemy.getData('tele')) {
          enemy.setData('tele', true)
          enemy.setTintFill(0xffe08a)
          this.time.delayedCall(170, () => this.restoreTint(enemy))
          if (type === 'boss') this.shockwave(enemy.x, enemy.y, 0xfbbf24, 38)
        }
        if (timer <= 0 && near && alive) {
          enemy.setData('tele', false)
          let count = 1
          if (type === 'boss') count = this.bossPhase === 2 ? 9 : 6
          else if (type === 'turret') count = this.level >= 3 ? 2 : 1
          this.enemyFire(enemy, count)
          let base = 900
          if (type === 'boss') base = this.bossPhase === 2 ? 480 : 680
          else if (type === 'tank') base = 1100
          else if (type === 'turret') base = Math.max(650, 1250 - this.level * 90)
          enemy.setData('shootTimer', base)
        } else enemy.setData('shootTimer', timer <= 0 ? 140 : timer)
      }
    })
  }

  private enemyFire(enemy: Phaser.Physics.Arcade.Sprite, count: number) {
    for (let i = 0; i < count; i++) {
      const b = this.enemyBullets.get(enemy.x, enemy.y, 'enemyBullet') as Phaser.Physics.Arcade.Image
      if (!b) continue
      b.setActive(true).setVisible(true); b.setScale(0.75); b.setDepth(19)
      b.body?.reset(enemy.x, enemy.y)
      ;(b.body as Phaser.Physics.Arcade.Body).setAllowGravity(false)
      const spread = (i - (count - 1) / 2) * 0.16
      const ang = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y) + spread
      const spd = count > 1 ? 220 : 270
      b.setVelocity(Math.cos(ang) * spd, Math.sin(ang) * spd)
      b.setRotation(ang)   // bolt points toward the player
      this.time.delayedCall(2200, () => { if (b.active) b.setActive(false).setVisible(false) })
    }
  }

  // Clear a hit/telegraph flash but keep any persistent base tint (e.g. the charger's).
  private restoreTint(e: Phaser.Physics.Arcade.Sprite) {
    if (!e.active) return
    e.clearTint()
    const bt = e.getData('baseTint') as number | undefined
    if (bt) e.setTint(bt)
  }

  private hitEnemy(
    bulletObj: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    enemyObj: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile
  ) {
    const bullet = bulletObj as Phaser.Physics.Arcade.Image
    const enemy = enemyObj as Phaser.Physics.Arcade.Sprite
    bullet.setActive(false).setVisible(false)

    const dmg = this.weapon === 'laser' ? 3 : this.weapon === 'fire' ? 2 : 1
    const hp = (enemy.getData('hp') as number) - dmg
    enemy.setData('hp', hp)
    enemy.setTintFill(0xffffff)
    this.time.delayedCall(60, () => this.restoreTint(enemy))
    this.particles.emitParticleAt(enemy.x, enemy.y, 5)

    if (hp > 0) {
      // Alive — flinch with a quick squash punch so non-lethal hits still read.
      const bsx = enemy.getData('bsx') as number, bsy = enemy.getData('bsy') as number
      this.tweens.killTweensOf(enemy)
      this.tweens.add({ targets: enemy, scaleX: bsx * 1.18, scaleY: bsy * 0.84, duration: 55, yoyo: true, onComplete: () => { if (enemy.active) enemy.setScale(bsx, bsy) } })
      this.sfx?.hit()
      return
    }

    // ---- Kill ----
    const type = enemy.getData('type') as string
    const dcol = type === 'tank' ? 0xfb923c : type === 'flyer' ? 0xa855f7 : type === 'charger' ? 0xff7a3c : type === 'diver' ? 0xff4d6d : 0xf43f5e
    let pts = type === 'boss' ? 4000 : type === 'tank' ? 500 : type === 'turret' ? 350 : type === 'flyer' ? 250 : type === 'charger' ? 200 : type === 'diver' ? 260 : 120
    this.combo++
    this.comboTimer = 2400
    this.maxCombo = Math.max(this.maxCombo, this.combo)
    if (this.combo > 1) {
      pts = Math.floor(pts * (1 + Math.min(this.combo, 15) * 0.12))
      this.comboText.setText('COMBO x' + this.combo)
    }
    this.kills++
    this.score += pts
    this.scoreText.setText('SCORE  ' + this.score)
    this.popup(enemy.x, enemy.y - 20, '+' + pts)

    if (type === 'boss') { this.bossDeath(enemy); return }

    this.deathParticles.setParticleTint(dcol)
    this.deathParticles.emitParticleAt(enemy.x, enemy.y, 16)
    this.particles.emitParticleAt(enemy.x, enemy.y, 26)
    this.shockwave(enemy.x, enemy.y, dcol, 26)
    this.hitstop(type === 'tank' || type === 'turret' ? 70 : 45)
    this.cameras.main.shake(type === 'tank' || type === 'turret' ? 120 : 70, 0.014)
    this.sfx?.explode()
    if (type === 'tank' || type === 'turret') this.cameras.main.flash(90, 200, 120, 255, false)
    if (Math.random() < 0.3) {
      const kinds = ['health', 'spread', 'rapid', 'laser', 'fire']
      this.spawnPowerup(enemy.x, enemy.y, kinds[Math.floor(Math.random() * kinds.length)])
    }
    enemy.destroy()
    if (this.isBossLevel() && this.enemies.countActive(true) === 0) this.onLevelClear()
  }

  // Multi-stage boss detonation — a run of blasts across the body, then a screen-filling finisher.
  private bossDeath(boss: Phaser.Physics.Arcade.Sprite) {
    boss.setData('hp', 0)
    boss.setVelocity(0, 0)
    ;(boss.body as Phaser.Physics.Arcade.Body).enable = false
    this.hitstop(150)
    let n = 0
    const ev = this.time.addEvent({
      delay: 135, repeat: 7, callback: () => {
        n++
        const ex = boss.x + Phaser.Math.Between(-72, 72), ey = boss.y + Phaser.Math.Between(-72, 72)
        this.particles.emitParticleAt(ex, ey, 20)
        this.deathParticles.setParticleTint(0xfb923c)
        this.deathParticles.emitParticleAt(ex, ey, 10)
        this.shockwave(ex, ey, 0xfbbf24, 22)
        this.cameras.main.shake(120, 0.02)
        this.sfx?.explode()
        if (boss.active) boss.setTintFill(n % 2 ? 0xffffff : 0xff6030)
        if (ev.repeatCount === 0) {
          this.cameras.main.flash(320, 255, 210, 130, false)
          this.shockwave(boss.x, boss.y, 0xffffff, 64)
          this.deathParticles.setParticleTint(0xfbbf24)
          this.deathParticles.emitParticleAt(boss.x, boss.y, 44)
          this.particles.emitParticleAt(boss.x, boss.y, 60)
          this.sfx?.clear()
          boss.destroy()
          if (this.enemies.countActive(true) === 0) this.onLevelClear()
        }
      },
    })
  }

  private hitPlayer(
    _p: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    eObj: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile
  ) {
    const enemy = eObj as Phaser.Physics.Arcade.Sprite
    const type = enemy.getData('type') as string
    const pb = this.player.body as Phaser.Physics.Arcade.Body
    const eb = enemy.body as Phaser.Physics.Arcade.Body
    // Mario stomp: falling onto a SOFT enemy from above kills it and bounces you.
    const soft = type === 'walker' || type === 'flyer' || type === 'charger' || type === 'diver'
    if (soft && pb.velocity.y > 60 && pb.bottom <= eb.top + 22) {
      this.player.setVelocityY(-360)
      this.isJumping = true
      this.stompEnemy(enemy)
      return
    }
    // Armored / turret / boss punish the stomp — you take the hit.
    this.damagePlayer()
  }

  private stompEnemy(enemy: Phaser.Physics.Arcade.Sprite) {
    const type = enemy.getData('type') as string
    let pts = type === 'flyer' ? 250 : 120
    this.combo++
    this.comboTimer = 2400
    this.maxCombo = Math.max(this.maxCombo, this.combo)
    if (this.combo > 1) { pts = Math.floor(pts * (1 + Math.min(this.combo, 15) * 0.12)); this.comboText.setText('COMBO x' + this.combo) }
    this.kills++
    this.score += pts
    this.scoreText.setText('SCORE  ' + this.score)
    this.popup(enemy.x, enemy.y - 20, 'STOMP +' + pts, '#fbbf24')
    this.particles.emitParticleAt(enemy.x, enemy.y, 22)
    this.deathParticles.setParticleTint(type === 'flyer' ? 0xa855f7 : 0xf43f5e)
    this.deathParticles.emitParticleAt(enemy.x, enemy.y, 14)
    this.shockwave(enemy.x, enemy.y, 0xfbbf24, 24)
    this.hitstop(28)
    this.cameras.main.shake(60, 0.012)
    this.sfx?.stomp()
    if (Math.random() < 0.3) {
      const kinds = ['health', 'spread', 'rapid', 'laser', 'fire']
      this.spawnPowerup(enemy.x, enemy.y, kinds[Math.floor(Math.random() * kinds.length)])
    }
    enemy.destroy()
    if (this.isBossLevel() && this.enemies.countActive(true) === 0) this.onLevelClear()
  }

  private hitByEnemyBullet(
    _p: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    bulletObj: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile
  ) {
    const b = bulletObj as Phaser.Physics.Arcade.Image
    b.setActive(false).setVisible(false)
    this.damagePlayer()
  }

  private damagePlayer() {
    if (this.invulnerable || this.gameOver || this.levelTransition) return
    this.health -= 1
    this.combo = 0; this.comboText.setText('')
    this.updateHealth()
    this.invulnerable = true
    this.player.setTint(0xff0030)
    this.hitstop(70)
    this.cameras.main.shake(140, 0.018)
    this.cameras.main.flash(100, 255, 30, 40, false)
    this.sfx?.hurt()
    this.player.setVelocityY(-260)
    this.time.delayedCall(800, () => { this.invulnerable = false; if (this.player.active) this.player.clearTint() })

    if (this.health <= 0) {
      this.lives -= 1; this.livesText.setText('LIVES  ' + this.lives)
      if (this.lives <= 0) this.triggerGameOver()
      else {
        this.health = 5; this.updateHealth()
        this.player.setPosition(this.lastGroundX, this.lastGroundY - 48)
        this.player.setVelocity(0, 0); this.jumpsLeft = MAX_JUMPS; this.invulnerable = true
        this.time.delayedCall(1500, () => { this.invulnerable = false; this.player.clearTint() })
      }
    }
  }

  private collectPowerup(
    _p: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    powObj: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile
  ) {
    const pow = powObj as Phaser.Physics.Arcade.Sprite
    const kind = pow.getData('kind') as string
    pow.destroy()
    this.particles.emitParticleAt(pow.x, pow.y, 18)
    this.popup(pow.x, pow.y, kind.toUpperCase(), '#4ade80')
    this.cameras.main.flash(60, 100, 255, 150, false)
    this.sfx?.pickup()
    if (kind === 'health') { this.health = Math.min(this.maxHealth, this.health + 1); this.updateHealth() }
    else {
      // Two-weapon carry: the new gun becomes active; the previous one drops to the backup slot.
      if (kind !== this.weapon) { this.altWeapon = this.weapon; this.weapon = kind as typeof this.weapon }
      this.updateWeaponHUD()
    }
  }

  private wlabel(w: string) {
    return ({ spread: 'SPREAD', rapid: 'RAPID', laser: 'LASER', fire: 'FIRE' } as Record<string, string>)[w] || 'NORMAL'
  }

  private updateWeaponHUD() {
    // One backup weapon shown dim after the active one; a ▶ marks what's firing.
    if (this.altWeapon === this.weapon) this.weaponText.setText('GUN  ' + this.wlabel(this.weapon))
    else this.weaponText.setText('GUN ▶' + this.wlabel(this.weapon) + '  ·' + this.wlabel(this.altWeapon))
  }

  private swapWeapon() {
    if (this.gameOver || !this.started || this.altWeapon === this.weapon) return
    const t = this.weapon; this.weapon = this.altWeapon; this.altWeapon = t
    this.updateWeaponHUD()
    this.sfx?.swap()
    this.popup(this.player.x, this.player.y - 44, '▶ ' + this.wlabel(this.weapon), '#22d3ee')
  }

  private updateHealth() {
    const h = '♥'.repeat(Math.max(0, this.health)) + '♡'.repeat(Math.max(0, this.maxHealth - this.health))
    this.healthText.setText('HP  ' + h)
  }

  private onLevelClear() {
    if (this.levelTransition) return
    this.levelTransition = true
    this.sfx?.clear()
    if (this.level < this.levels().length) {
      const next = this.level + 1
      const msg = this.add.text(256, 150, `LEVEL ${next}\n${this.levels()[next - 1].name}`, {
        fontFamily: 'monospace', fontSize: '16px', color: '#22d3ee', align: 'center',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(200)
      this.time.delayedCall(1300, () => {
        msg.destroy()
        this.level = next
        this.levelText.setText('LEVEL  ' + next)
        const d = this.levels()[next - 1]
        this.buildLevel(next)
        this.player.setPosition(d.spawn[0], d.spawn[1])
        this.player.setVelocity(0, 0); this.jumpsLeft = MAX_JUMPS
        this.lastGroundX = d.spawn[0]; this.lastGroundY = d.spawn[1]
        this.health = Math.min(this.maxHealth, this.health + 1); this.updateHealth()
        this.levelTransition = false
        this.showBanner('LEVEL ' + next, d.name)
      })
    } else this.showVictory()
  }

  // Persist the best score across sessions; report whether this run beat it.
  private saveBest(): { best: number; record: boolean } {
    let best = 0
    try { best = parseInt(localStorage.getItem('apex_best') || '0', 10) || 0 } catch { best = 0 }
    const record = this.score > best
    if (record) { try { localStorage.setItem('apex_best', String(this.score)) } catch { /* ignore */ } best = this.score }
    return { best, record }
  }

  // Shared results block: score, run stats, and a NEW RECORD flourish.
  private resultsCard(record: boolean) {
    this.add.text(256, 140, 'SCORE  ' + this.score, { fontFamily: 'monospace', fontSize: '15px', color: '#e879f9' }).setOrigin(0.5).setScrollFactor(0).setDepth(201)
    this.add.text(256, 166, 'Kills ' + this.kills + '     Best Combo x' + this.maxCombo, { fontFamily: 'monospace', fontSize: '10px', color: '#22d3ee' }).setOrigin(0.5).setScrollFactor(0).setDepth(201)
    if (record) {
      const rec = this.add.text(256, 187, '★  NEW RECORD  ★', { fontFamily: 'monospace', fontSize: '12px', color: '#fbbf24' }).setOrigin(0.5).setScrollFactor(0).setDepth(202)
      this.tweens.add({ targets: rec, alpha: 0.35, duration: 420, yoyo: true, repeat: -1 })
    }
  }

  private triggerGameOver() {
    this.gameOver = true
    this.sfx?.stopMusic()
    this.player.setTint(0x333333); this.player.setVelocity(0, 0)
    const { best, record } = this.saveBest()
    this.add.rectangle(256, 192, 512, 384, 0x0a0612, 0.9).setScrollFactor(0).setDepth(200)
    this.add.text(256, 96, 'MISSION FAILED', { fontFamily: 'monospace', fontSize: '21px', color: '#f43f5e' }).setOrigin(0.5).setScrollFactor(0).setDepth(201)
    this.resultsCard(record)
    this.add.text(256, 212, 'Reached Level ' + this.level, { fontFamily: 'monospace', fontSize: '10px', color: '#a1a1aa' }).setOrigin(0.5).setScrollFactor(0).setDepth(201)
    this.add.text(256, 230, 'Best  ' + best, { fontFamily: 'monospace', fontSize: '10px', color: '#71717a' }).setOrigin(0.5).setScrollFactor(0).setDepth(201)
    const btn = this.add.text(256, 268, '[ CLICK / TAP TO RESTART ]', { fontFamily: 'monospace', fontSize: '11px', color: '#c4b5fd' })
      .setOrigin(0.5).setScrollFactor(0).setDepth(201).setInteractive({ useHandCursor: true })
    btn.on('pointerdown', () => this.scene.restart())
  }

  private showVictory() {
    this.gameOver = true
    this.sfx?.stopMusic()
    this.player.setVelocity(0, 0)
    const { best, record } = this.saveBest()
    this.add.rectangle(256, 192, 512, 384, 0x0a0612, 0.9).setScrollFactor(0).setDepth(200)
    this.add.text(256, 92, 'SECTOR DOMINATED', { fontFamily: 'monospace', fontSize: '19px', color: '#22d3ee' }).setOrigin(0.5).setScrollFactor(0).setDepth(201)
    this.resultsCard(record)
    this.add.text(256, 212, 'The Huntress claims the Apex.', { fontFamily: 'monospace', fontSize: '10px', color: '#a1a1aa' }).setOrigin(0.5).setScrollFactor(0).setDepth(201)
    this.add.text(256, 230, 'Best  ' + best, { fontFamily: 'monospace', fontSize: '10px', color: '#71717a' }).setOrigin(0.5).setScrollFactor(0).setDepth(201)
    const btn = this.add.text(256, 268, '[ CLICK / TAP TO PLAY AGAIN ]', { fontFamily: 'monospace', fontSize: '11px', color: '#c4b5fd' })
      .setOrigin(0.5).setScrollFactor(0).setDepth(201).setInteractive({ useHandCursor: true })
    btn.on('pointerdown', () => this.scene.restart())
  }
}
