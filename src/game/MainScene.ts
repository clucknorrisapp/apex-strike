import Phaser from 'phaser'

const ASSETS = {
  huntress: '/assets/huntress.png',
  huntress_run: '/assets/huntress_run.png',
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
}

// Multi-directional stages: you climb UP, drop DOWN, and push FORWARD.
export const LEVELS: LevelDef[] = [
  {
    name: 'NEON STREETS', theme: 'streets', w: 2600, h: 1200, spawn: [80, 1060], goal: [2470, 620],
    ground: [[0, 700, 1140], [820, 1500, 1140], [1620, 2600, 1140]],
    plats: [
      [250, 1050, 120], [440, 950, 120], [300, 850, 120], [520, 770, 130], [720, 690, 140],
      [960, 660, 150], [1200, 700, 150], [1450, 830, 140], [1300, 970, 130],
      [1780, 1030, 130], [1980, 930, 130], [2180, 820, 140], [2380, 700, 150],
    ],
    walls: [[1050, 1010, 90, 130]],
    turrets: [[720, 690], [1200, 700], [2180, 820]],
    enemies: [
      { kind: 'soldier', x: 300, y: 1090, hp: 2, speed: 60 }, { kind: 'soldier', x: 900, y: 1090, hp: 2, speed: 65 },
      { kind: 'soldier', x: 520, y: 720, hp: 2, speed: 55 }, { kind: 'soldier', x: 960, y: 610, hp: 2, speed: 60 },
      { kind: 'soldier', x: 1900, y: 880, hp: 3, speed: 60 }, { kind: 'soldier', x: 2250, y: 1090, hp: 3, speed: 60 },
      { kind: 'charger', x: 640, y: 1090, hp: 3, speed: 55 }, { kind: 'charger', x: 1650, y: 1090, hp: 4, speed: 58 },
      { kind: 'flyer', x: 600, y: 320, hp: 2, speed: 45 }, { kind: 'flyer', x: 1300, y: 260, hp: 2, speed: 50 },
      { kind: 'flyer', x: 2050, y: 420, hp: 3, speed: 50 },
    ],
    pods: [[440, 910, 'spread'], [1200, 660, 'health'], [1980, 890, 'rapid']],
  },
  {
    name: 'INDUSTRIAL RISE', theme: 'industrial', w: 2600, h: 1320, spawn: [80, 1180], goal: [2460, 360],
    ground: [[0, 600, 1260], [740, 1360, 1260], [1500, 2600, 1260]],
    plats: [
      [230, 1160, 120], [430, 1050, 120], [620, 950, 120], [430, 840, 120], [640, 740, 130],
      [900, 700, 140], [1160, 640, 130], [1380, 760, 130], [1250, 920, 130],
      [1620, 1080, 130], [1850, 960, 130], [2060, 840, 130], [2260, 700, 140], [2420, 540, 140], [2260, 400, 150],
    ],
    walls: [[860, 1160, 90, 180], [1720, 1160, 90, 150]],
    turrets: [[900, 700], [1160, 640], [2260, 700], [2260, 400]],
    enemies: [
      { kind: 'soldier', x: 300, y: 1210, hp: 3, speed: 65 }, { kind: 'tank', x: 1000, y: 1210, hp: 6, speed: 28 },
      { kind: 'charger', x: 700, y: 1210, hp: 4, speed: 60 }, { kind: 'charger', x: 1750, y: 1210, hp: 4, speed: 62 },
      { kind: 'soldier', x: 640, y: 700, hp: 3, speed: 70 }, { kind: 'soldier', x: 1160, y: 600, hp: 3, speed: 70 },
      { kind: 'tank', x: 1900, y: 1210, hp: 7, speed: 30 }, { kind: 'soldier', x: 2100, y: 800, hp: 3, speed: 70 },
      { kind: 'flyer', x: 500, y: 260, hp: 3, speed: 55 }, { kind: 'flyer', x: 1200, y: 220, hp: 3, speed: 60 },
      { kind: 'flyer', x: 1900, y: 300, hp: 3, speed: 55 }, { kind: 'flyer', x: 2400, y: 250, hp: 3, speed: 55 },
    ],
    pods: [[430, 800, 'rapid'], [1160, 600, 'health'], [2060, 800, 'laser']],
  },
  {
    name: 'SKY RAIL', theme: 'sky', w: 2700, h: 1400, spawn: [80, 1260], goal: [2500, 300],
    ground: [[0, 520, 1340], [660, 1180, 1340], [1320, 1820, 1340], [1960, 2700, 1340]],
    plats: [
      [220, 1230, 110], [420, 1120, 110], [300, 1000, 110], [520, 900, 120], [760, 820, 130],
      [1000, 740, 130], [860, 600, 120], [1180, 640, 130], [1420, 560, 130], [1240, 420, 120],
      [1560, 900, 130], [1780, 780, 130], [2020, 660, 130], [2260, 520, 140], [2460, 380, 150], [2260, 260, 140],
    ],
    walls: [],
    turrets: [[1000, 740], [1420, 560], [2020, 660], [2260, 260]],
    enemies: [
      { kind: 'soldier', x: 260, y: 1290, hp: 3, speed: 70 }, { kind: 'tank', x: 900, y: 1290, hp: 7, speed: 30 },
      { kind: 'charger', x: 560, y: 1290, hp: 5, speed: 64 }, { kind: 'charger', x: 1600, y: 1290, hp: 5, speed: 66 },
      { kind: 'soldier', x: 760, y: 780, hp: 3, speed: 75 }, { kind: 'soldier', x: 1180, y: 600, hp: 3, speed: 75 },
      { kind: 'soldier', x: 1780, y: 740, hp: 4, speed: 70 }, { kind: 'tank', x: 2100, y: 1290, hp: 8, speed: 32 },
      { kind: 'flyer', x: 450, y: 300, hp: 3, speed: 65 }, { kind: 'flyer', x: 1000, y: 240, hp: 3, speed: 70 },
      { kind: 'flyer', x: 1600, y: 280, hp: 4, speed: 65 }, { kind: 'flyer', x: 2200, y: 200, hp: 4, speed: 70 },
    ],
    pods: [[520, 860, 'laser'], [1180, 600, 'health'], [2020, 620, 'fire']],
  },
  {
    name: 'CORE ACCESS', theme: 'core', w: 2700, h: 1360, spawn: [80, 1220], goal: [2500, 640],
    ground: [[0, 620, 1300], [760, 1300, 1300], [1440, 2000, 1300], [2140, 2700, 1300]],
    plats: [
      [250, 1200, 120], [470, 1090, 120], [680, 980, 120], [470, 870, 120], [700, 780, 130],
      [960, 720, 130], [1220, 660, 130], [1460, 780, 130], [1320, 940, 130],
      [1700, 1060, 130], [1920, 940, 130], [1740, 800, 120], [2020, 720, 130], [2280, 660, 140], [2480, 720, 150],
    ],
    walls: [[900, 1200, 90, 180], [1600, 1200, 90, 160], [2260, 1200, 90, 140]],
    turrets: [[960, 720], [1220, 660], [1920, 940], [2280, 660]],
    enemies: [
      { kind: 'soldier', x: 300, y: 1250, hp: 4, speed: 70 }, { kind: 'tank', x: 560, y: 1250, hp: 8, speed: 30 },
      { kind: 'soldier', x: 700, y: 740, hp: 4, speed: 75 }, { kind: 'tank', x: 1500, y: 1250, hp: 8, speed: 32 },
      { kind: 'soldier', x: 1920, y: 900, hp: 4, speed: 75 }, { kind: 'tank', x: 2300, y: 1250, hp: 9, speed: 32 },
      { kind: 'flyer', x: 420, y: 260, hp: 4, speed: 75 }, { kind: 'flyer', x: 1000, y: 220, hp: 4, speed: 80 },
      { kind: 'flyer', x: 1700, y: 280, hp: 4, speed: 75 }, { kind: 'flyer', x: 2300, y: 240, hp: 4, speed: 80 },
    ],
    pods: [[470, 830, 'rapid'], [1220, 620, 'health'], [1740, 760, 'laser'], [2280, 620, 'fire']],
  },
  {
    name: 'APEX THRONE', theme: 'throne', w: 1600, h: 1000, spawn: [80, 860], goal: [0, 0],
    ground: [[0, 1600, 940]],
    plats: [[250, 820, 130], [560, 700, 140], [900, 700, 140], [1200, 820, 130], [720, 540, 150], [400, 560, 120], [1050, 540, 130]],
    walls: [[120, 900, 80, 80], [1400, 900, 80, 80]],
    turrets: [[120, 860], [1400, 860]],
    enemies: [
      { kind: 'boss', x: 780, y: 200, hp: 64, speed: 55 },
      { kind: 'flyer', x: 220, y: 180, hp: 3, speed: 55 }, { kind: 'flyer', x: 1320, y: 180, hp: 3, speed: 55 },
      { kind: 'tank', x: 320, y: 900, hp: 8, speed: 28 }, { kind: 'tank', x: 1220, y: 900, hp: 8, speed: 28 },
    ],
    pods: [[300, 780, 'health'], [780, 500, 'laser'], [1200, 780, 'fire']],
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
  private powerups!: Phaser.Physics.Arcade.Group
  private bgFar!: Phaser.GameObjects.TileSprite
  private bgMid!: Phaser.GameObjects.TileSprite
  private bgStars!: Phaser.GameObjects.TileSprite
  private bgImage!: Phaser.GameObjects.Image
  private bgScrim!: Phaser.GameObjects.Rectangle
  private decor: Phaser.GameObjects.GameObject[] = []
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
  private weapon: 'normal' | 'spread' | 'rapid' | 'laser' | 'fire' = 'normal'
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
    const ox = (isVert ? 0 : Math.cos(rad) * dir) * 13
    const oy = Math.sin(rad) * 13
    const flash = this.add.star(x + ox, y + oy, 4, 3, 12, color, 1).setDepth(21).setBlendMode(Phaser.BlendModes.ADD)
    const core = this.add.circle(x + ox, y + oy, 5, 0xffffff, 0.9).setDepth(21).setBlendMode(Phaser.BlendModes.ADD)
    this.tweens.add({ targets: [flash, core], scaleX: 0.2, scaleY: 0.2, alpha: 0, duration: 85, onComplete: () => { flash.destroy(); core.destroy() } })
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
    this.load.image('huntress', ASSETS.huntress)
    this.load.image('huntress_run', ASSETS.huntress_run)
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
    this.bullets = this.physics.add.group({ classType: Phaser.Physics.Arcade.Image, maxSize: 120 })
    this.enemyBullets = this.physics.add.group({ classType: Phaser.Physics.Arcade.Image, maxSize: 80 })
    this.enemies = this.physics.add.group()
    this.powerups = this.physics.add.group()
    this.shards = this.physics.add.group({ allowGravity: false, immovable: true })

    // Persist mute across restarts within a session.
    this.sfx.setMuted(this.muted)

    // Painted backdrop (used when its art loaded) sits behind everything, pinned to the camera.
    this.bgImage = this.add.image(256, 192, 'stars').setScrollFactor(0).setDepth(-10).setVisible(false)
    this.bgScrim = this.add.rectangle(256, 192, 512, 384, 0x05040a, 0.26).setScrollFactor(0).setDepth(-9).setVisible(false)
    // Procedural parallax fallback (both axes for the 2D world)
    this.bgStars = this.add.tileSprite(256, 192, 512, 384, 'stars').setScrollFactor(0).setDepth(0)
    this.bgFar = this.add.tileSprite(256, 192, 512, 384, 'far_streets').setScrollFactor(0).setDepth(1)
    this.bgMid = this.add.tileSprite(256, 192, 512, 384, 'mid_streets').setScrollFactor(0).setDepth(2)

    this.buildLevel(1)

    const def = this.levels()[0]
    const pKey = this.textures.exists('huntress') ? 'huntress' : 'player'
    this.player = this.physics.add.sprite(def.spawn[0], def.spawn[1], pKey)
    this.sizePlayer()
    this.player.setCollideWorldBounds(true)
    this.player.setBounce(0)
    this.player.setDepth(25)
    this.player.setMaxVelocity(RUN, 1250)

    this.cameras.main.startFollow(this.player, true, 0.11, 0.11)
    this.cameras.main.setDeadzone(90, 72)

    this.physics.add.collider(this.player, this.platforms)
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

    // Controller: confirm the pad the instant it wakes up (browsers only surface
    // gamepads after the first input) — and if one is already active.
    this.input.gamepad?.on('connected', () => this.controllerToast())
    if ((this.input.gamepad?.total ?? 0) > 0) this.controllerToast()

    this.particles = this.add.particles(0, 0, 'spark', {
      speed: { min: 120, max: 380 },
      scale: { start: 1.4, end: 0 },
      lifespan: 500,
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
  }

  private sizePlayer() {
    if (this.player.texture.key === 'huntress' || this.player.texture.key === 'huntress_run') {
      // Aspect-correct (3:4 art), big and bold on the tight frame.
      this.player.setDisplaySize(66, 90)
      // Fair Contra-ish hitbox: narrower than the sprite, feet-aligned.
      const tw = this.player.width, th = this.player.height
      this.player.body!.setSize(tw * 0.36, th * 0.82)
      ;(this.player.body as Phaser.Physics.Arcade.Body).setOffset(tw * 0.32, th * 0.15)
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
    if (!this.textures.exists('bullet')) {
      const g = this.make.graphics({ x: 0, y: 0 })
      g.fillStyle(0x22d3ee, 1); g.fillRoundedRect(0, 2, 22, 10, 3)
      g.fillStyle(0xffffff, 1); g.fillRoundedRect(2, 4, 14, 6, 2)
      g.generateTexture('bullet', 22, 14); g.destroy()
    }
    if (!this.textures.exists('laser')) {
      const g = this.make.graphics({ x: 0, y: 0 })
      g.fillStyle(0xe879f9, 1); g.fillRect(0, 0, 40, 8)
      g.fillStyle(0xffffff, 1); g.fillRect(0, 2, 40, 4)
      g.generateTexture('laser', 40, 8); g.destroy()
    }
    if (!this.textures.exists('fireball')) {
      const g = this.make.graphics({ x: 0, y: 0 })
      g.fillStyle(0xfb923c, 1); g.fillCircle(12, 12, 12)
      g.fillStyle(0xfef08a, 1); g.fillCircle(12, 12, 6)
      g.generateTexture('fireball', 24, 24); g.destroy()
    }
    if (!this.textures.exists('enemyBullet')) {
      const g = this.make.graphics({ x: 0, y: 0 })
      g.fillStyle(0xf43f5e, 1); g.fillRoundedRect(0, 1, 16, 8, 2)
      g.fillStyle(0xfecdd3, 1); g.fillRoundedRect(2, 3, 10, 4, 1)
      g.generateTexture('enemyBullet', 16, 10); g.destroy()
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
      const s = this.make.graphics({ x: 0, y: 0 })
      s.fillStyle(0xffffff, 1); s.fillCircle(6, 6, 6)
      s.generateTexture('spark', 12, 12); s.destroy()
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
    this.shards?.getChildren().forEach((s) => this.tweens.killTweensOf(s))
    this.shards?.clear(true, true)
    this.destroyBossBar()
    this.bossRef = undefined
    this.shardsGot = 0
    this.shardsTotal = 0
    this.decor.forEach((d) => d.destroy())
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
      this.bgImage.setTexture(bgKey).setDisplaySize(512, 384).setVisible(true)
      this.bgScrim.setVisible(true)
      this.bgStars.setVisible(false); this.bgFar.setVisible(false); this.bgMid.setVisible(false)
    } else {
      this.bgImage.setVisible(false); this.bgScrim.setVisible(false)
      this.bgStars.setVisible(true).setTexture('stars')
      this.bgFar.setVisible(true).setTexture('far_' + def.theme)
      this.bgMid.setVisible(true).setTexture('mid_' + def.theme)
    }

    const solid = (cx: number, top: number, w: number, h: number, tint: number, rim: number) => {
      const s = this.platforms.create(cx, top + h / 2, 'terrain') as Phaser.Physics.Arcade.Sprite
      s.setDisplaySize(w, h); s.setTint(tint); s.setDepth(5); s.refreshBody()
      // neon edge glow (soft, wide), a crisp lit rim, and a lit top face → depth, not a flat block
      this.decor.push(this.add.rectangle(cx, top + 5, w + 6, 14, rim, 0.12).setDepth(5).setBlendMode(Phaser.BlendModes.ADD))
      this.decor.push(this.add.rectangle(cx, top + 6, w - 4, 7, 0xffffff, 0.07).setDepth(6))
      this.decor.push(this.add.rectangle(cx, top + 1, w, 3, rim, 1).setDepth(7))
    }

    def.ground.forEach(([x1, x2, top]) => solid((x1 + x2) / 2, top, x2 - x1, def.h + 400 - top, theme.fill, theme.rim))
    def.plats.forEach(([cx, top, w]) => solid(cx, top, w, 20, theme.ledge, theme.rim))
    def.walls.forEach(([cx, top, w, h]) => solid(cx, top, w, h, theme.ledge, theme.accent))

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
    } else if (kind === 'boss') {
      tex = this.textures.exists('boss_art') ? 'boss_art' : 'boss'
      t = 'boss'; displayW = 230; displayH = 230
    }

    const enemy = this.enemies.create(x, y, tex) as Phaser.Physics.Arcade.Sprite
    enemy.setDisplaySize(displayW, displayH)
    if (t === 'charger') { enemy.setData('baseTint', 0xff7a3c); enemy.setTint(0xff7a3c) }
    enemy.setData('bsx', enemy.scaleX); enemy.setData('bsy', enemy.scaleY)
    enemy.setBounce(0.02)
    enemy.setCollideWorldBounds(false)
    enemy.setData('hp', hp); enemy.setData('maxHp', hp); enemy.setData('speed', speed)
    enemy.setData('type', t)
    enemy.setData('dir', Math.random() > 0.5 ? 1 : -1)
    enemy.setData('shootTimer', Phaser.Math.Between(200, 900))
    enemy.setDepth(18)

    if (t === 'boss') { this.bossRef = enemy; this.createBossBar(hp) }

    if (t === 'flyer' || t === 'boss') {
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
      this.add.text(256, 373, 'P / Start  pause      M  mute', { fontFamily: 'monospace', fontSize: '8px', color: '#52525b' }).setOrigin(0.5).setScrollFactor(0).setDepth(100)
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
    // Enough simultaneous touches for move + aim + jump + fire at once.
    this.input.addPointer(4)
    const btn = (
      x: number, y: number, w: number, h: number, label: string, key: keyof TouchState,
      tint = 0x1e1b4b, rim = 0xa855f7, fs = '11px'
    ) => {
      const bg = this.add.rectangle(x, y, w, h, tint, 0.42).setScrollFactor(0).setDepth(150).setInteractive()
      bg.setStrokeStyle(2, rim, 0.75)
      this.add.text(x, y, label, { fontFamily: 'monospace', fontSize: fs, color: '#f5f3ff', fontStyle: 'bold' })
        .setOrigin(0.5).setScrollFactor(0).setDepth(151)
      const press = () => { this.touch[key] = true; bg.setFillStyle(rim, 0.55) }
      const release = () => { this.touch[key] = false; bg.setFillStyle(tint, 0.42) }
      bg.on('pointerdown', press)
      bg.on('pointerup', release)
      bg.on('pointerout', release)
    }
    // Left thumb — move (violet) + 8-way aim (cyan). Cross layout, bottom-left.
    btn(78, 268, 56, 38, '▲', 'up', 0x134e4a, 0x22d3ee)
    btn(44, 322, 56, 46, '◀', 'left')
    btn(112, 322, 56, 46, '▶', 'right')
    btn(78, 362, 56, 30, '▼', 'down', 0x134e4a, 0x22d3ee)
    // Right thumb — jump (green) + fire (red). Big targets, bottom-right.
    btn(452, 266, 96, 46, 'JUMP', 'jump', 0x14532d, 0x4ade80, '12px')
    btn(452, 338, 96, 66, 'FIRE', 'shoot', 0x4c0519, 0xf43f5e, '13px')
    // Pause + mute, tucked in the gap between the thumb clusters.
    const tapBtn = (x: number, label: string, cb: () => void) => {
      const bg = this.add.rectangle(x, 361, 42, 26, 0x1e1b4b, 0.4).setScrollFactor(0).setDepth(150).setInteractive()
      bg.setStrokeStyle(1, 0xa855f7, 0.6)
      this.add.text(x, 361, label, { fontFamily: 'monospace', fontSize: '11px', color: '#e9d5ff' }).setOrigin(0.5).setScrollFactor(0).setDepth(151)
      bg.on('pointerdown', cb)
    }
    tapBtn(228, 'II', () => this.togglePause())
    tapBtn(284, '♪', () => this.toggleMute())
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

  // Reward exploration — a shard hovers over most ledges + wide ground spans.
  private placeShards(def: LevelDef) {
    const spots: [number, number][] = []
    def.plats.forEach(([cx, top]) => spots.push([cx, top - 26]))
    def.ground.forEach(([x1, x2, top]) => { if (x2 - x1 > 320) spots.push([(x1 + x2) / 2, top - 30]) })
    Phaser.Utils.Array.Shuffle(spots)
    const chosen = spots.filter(([x]) => Math.abs(x - def.spawn[0]) > 130).slice(0, 12)
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
    this.prevOnGround = this.onGround
    if (!this.onGround) this.fallSpeed = body.velocity.y

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

    // Pose
    if (this.textures.exists('huntress')) {
      const moving = Math.abs(body.velocity.x) > 24
      const key = (!this.prone && moving && this.textures.exists('huntress_run')) ? 'huntress_run' : 'huntress'
      if (this.player.texture.key !== key) { this.player.setTexture(key); this.sizePlayer() }
    }

    // Reached the extraction point? (boss levels clear by kill-all instead)
    if (!this.isBossLevel()) {
      const dx = this.player.x - this.goalX, dy = this.player.y - this.goalY
      if (dx * dx + dy * dy < 70 * 70) { this.onLevelClear(); return }
    }

    this.handleInput(time)
    this.updateEnemies(delta)
    this.maybeSpawnReinforcements(delta)
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

    const vertical = angle === -90 || angle === 90
    const baseX = this.player.x + dir * (vertical ? 4 : 30)
    const baseY = (this.prone ? this.player.y + 16 : this.player.y - 2) + (angle === 90 ? 12 : 0)

    const spawn = (ang: number, tex = 'bullet', spd = 800, scale = 1.3) => {
      const b = this.bullets.get(baseX, baseY, tex) as Phaser.Physics.Arcade.Image
      if (!b) return
      b.setActive(true).setVisible(true); b.setScale(scale); b.setDepth(20)
      b.body?.reset(baseX, baseY)
      const rad = Phaser.Math.DegToRad(ang)
      const isVert = ang === -90 || ang === 90
      b.setVelocity(isVert ? 0 : Math.cos(rad) * dir * spd, Math.sin(rad) * spd)
      this.time.delayedCall(1100, () => { if (b.active) b.setActive(false).setVisible(false) })
    }

    this.particles.emitParticleAt(baseX, baseY, 3)
    if (this.time.now - this.lastSfxShot > 55) { this.sfx?.shoot(); this.lastSfxShot = this.time.now }
    this.muzzleFlash(baseX, baseY, dir, angle)

    if (this.weapon === 'spread') {
      spawn(angle - 20, 'bullet', 780, 1.2); spawn(angle, 'bullet', 820, 1.4); spawn(angle + 20, 'bullet', 780, 1.2)
    } else if (this.weapon === 'laser') {
      spawn(angle, 'laser', 1120, 1.6); spawn(angle, 'laser', 1060, 1.2)
    } else if (this.weapon === 'fire') {
      spawn(angle, 'fireball', 640, 1.5); spawn(angle - 14, 'fireball', 600, 1.2); spawn(angle + 14, 'fireball', 600, 1.2)
    } else if (this.weapon === 'rapid') {
      spawn(angle, 'bullet', 840, 1.15)
    } else {
      spawn(angle, 'bullet', 800, 1.35)
    }
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
      b.setActive(true).setVisible(true); b.setScale(1.3); b.setDepth(19)
      b.body?.reset(enemy.x, enemy.y)
      const spread = (i - (count - 1) / 2) * 0.16
      const ang = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y) + spread
      const spd = count > 1 ? 220 : 270
      b.setVelocity(Math.cos(ang) * spd, Math.sin(ang) * spd)
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
    const dcol = type === 'tank' ? 0xfb923c : type === 'flyer' ? 0xa855f7 : type === 'charger' ? 0xff7a3c : 0xf43f5e
    let pts = type === 'boss' ? 4000 : type === 'tank' ? 500 : type === 'turret' ? 350 : type === 'flyer' ? 250 : type === 'charger' ? 200 : 120
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
    const soft = type === 'walker' || type === 'flyer' || type === 'charger'
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
      this.weapon = kind as typeof this.weapon
      const labels: Record<string, string> = { spread: 'SPREAD', rapid: 'RAPID', laser: 'LASER', fire: 'FIRE' }
      this.weaponText.setText('GUN  ' + (labels[kind] || 'NORMAL'))
    }
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
