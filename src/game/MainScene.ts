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

// Physics world extends well below the 600px view so pits are real drops.
const WORLD_FLOOR = 900
const FALL_Y = 660

type ThemeName = 'streets' | 'industrial' | 'sky' | 'core' | 'throne'

interface Theme {
  bg: number
  far: number
  mid: number
  rim: number
  fill: number
  ledge: number
  accent: number
}

const THEMES: Record<ThemeName, Theme> = {
  streets:    { bg: 0x0a0612, far: 0x1a1030, mid: 0x2a1a4d, rim: 0x22d3ee, fill: 0x2c1f4a, ledge: 0x3b2a63, accent: 0xe879f9 },
  industrial: { bg: 0x0f0a07, far: 0x2a1c10, mid: 0x3d2a15, rim: 0xfb923c, fill: 0x3a2917, ledge: 0x4a3420, accent: 0xfbbf24 },
  sky:        { bg: 0x071018, far: 0x122438, mid: 0x1d3a57, rim: 0x22d3ee, fill: 0x1f3a52, ledge: 0x2a4a63, accent: 0x67e8f9 },
  core:       { bg: 0x120406, far: 0x2e0d14, mid: 0x4a141f, rim: 0xf43f5e, fill: 0x45141d, ledge: 0x5a1a26, accent: 0xfb7185 },
  throne:     { bg: 0x0b0714, far: 0x241a3a, mid: 0x3a2a5c, rim: 0xfbbf24, fill: 0x362a52, ledge: 0x4a3a2a, accent: 0xfde68a },
}

interface EnemySpawn { kind: string; x: number; y: number; hp: number; speed: number }

interface LevelDef {
  name: string
  theme: ThemeName
  width: number
  ground: [number, number, number][]           // [x1, x2, topY]  — gaps between spans are pits
  ledges: [number, number, number][]            // [centerX, topY, width]
  blocks: [number, number, number, number][]    // [centerX, topY, width, height] climbable structures
  turrets: [number, number][]                   // [x, surfaceTopY]
  enemies: EnemySpawn[]
  powerups: [number, number, string][]
  goalX: number
}

const LEVELS: LevelDef[] = [
  {
    name: 'NEON STREETS', theme: 'streets', width: 2800, goalX: 2700,
    ground: [[0, 720, 560], [860, 1380, 560], [1380, 1600, 500], [1740, 2180, 520], [2180, 2800, 560]],
    ledges: [[790, 470, 90], [1080, 395, 110], [1670, 435, 100], [1980, 410, 100]],
    blocks: [],
    turrets: [[1490, 500]],
    enemies: [
      { kind: 'soldier', x: 240, y: 520, hp: 2, speed: 60 },
      { kind: 'soldier', x: 560, y: 520, hp: 2, speed: 65 },
      { kind: 'soldier', x: 1080, y: 520, hp: 2, speed: 60 },
      { kind: 'soldier', x: 1460, y: 460, hp: 2, speed: 60 },
      { kind: 'soldier', x: 1900, y: 480, hp: 3, speed: 65 },
      { kind: 'soldier', x: 2350, y: 520, hp: 3, speed: 60 },
      { kind: 'flyer', x: 620, y: 110, hp: 2, speed: 45 },
      { kind: 'flyer', x: 1240, y: 90, hp: 2, speed: 50 },
      { kind: 'flyer', x: 1980, y: 120, hp: 3, speed: 50 },
    ],
    powerups: [[1080, 360, 'spread'], [1780, 470, 'health'], [2250, 500, 'rapid']],
  },
  {
    name: 'INDUSTRIAL RISE', theme: 'industrial', width: 2950, goalX: 2850,
    ground: [[0, 660, 560], [780, 1080, 540], [1080, 1360, 480], [1520, 1780, 520], [1780, 2060, 560], [2200, 2950, 560]],
    ledges: [[720, 460, 80], [1230, 395, 110], [1440, 440, 90], [2130, 470, 90]],
    blocks: [[980, 460, 80, 110]],
    turrets: [[1200, 480], [1900, 560]],
    enemies: [
      { kind: 'soldier', x: 220, y: 520, hp: 3, speed: 65 },
      { kind: 'soldier', x: 520, y: 500, hp: 3, speed: 65 },
      { kind: 'tank', x: 900, y: 500, hp: 6, speed: 28 },
      { kind: 'soldier', x: 1250, y: 440, hp: 3, speed: 70 },
      { kind: 'tank', x: 1650, y: 480, hp: 7, speed: 30 },
      { kind: 'soldier', x: 1950, y: 520, hp: 3, speed: 65 },
      { kind: 'soldier', x: 2400, y: 520, hp: 3, speed: 70 },
      { kind: 'flyer', x: 520, y: 90, hp: 3, speed: 55 },
      { kind: 'flyer', x: 1100, y: 70, hp: 3, speed: 60 },
      { kind: 'flyer', x: 1700, y: 95, hp: 3, speed: 55 },
      { kind: 'flyer', x: 2300, y: 80, hp: 3, speed: 50 },
    ],
    powerups: [[1230, 350, 'rapid'], [1600, 470, 'health'], [2150, 430, 'laser']],
  },
  {
    name: 'SKY RAIL', theme: 'sky', width: 3000, goalX: 2900,
    ground: [[0, 600, 560], [720, 980, 560], [1120, 1360, 520], [1500, 1700, 480], [1840, 2100, 520], [2240, 3000, 560]],
    ledges: [[660, 460, 80], [900, 375, 100], [1050, 420, 90], [1430, 405, 90], [1770, 400, 90], [2170, 430, 90]],
    blocks: [],
    turrets: [[1250, 520], [1950, 520]],
    enemies: [
      { kind: 'soldier', x: 300, y: 520, hp: 3, speed: 70 },
      { kind: 'tank', x: 820, y: 520, hp: 7, speed: 30 },
      { kind: 'soldier', x: 1200, y: 480, hp: 3, speed: 75 },
      { kind: 'soldier', x: 1580, y: 440, hp: 3, speed: 75 },
      { kind: 'tank', x: 1950, y: 480, hp: 8, speed: 32 },
      { kind: 'soldier', x: 2400, y: 520, hp: 4, speed: 70 },
      { kind: 'soldier', x: 2650, y: 520, hp: 4, speed: 70 },
      { kind: 'flyer', x: 450, y: 80, hp: 3, speed: 65 },
      { kind: 'flyer', x: 1000, y: 60, hp: 3, speed: 70 },
      { kind: 'flyer', x: 1550, y: 85, hp: 4, speed: 65 },
      { kind: 'flyer', x: 2050, y: 70, hp: 4, speed: 70 },
      { kind: 'flyer', x: 2500, y: 90, hp: 4, speed: 65 },
    ],
    powerups: [[900, 335, 'laser'], [1500, 440, 'health'], [2170, 390, 'fire']],
  },
  {
    name: 'CORE ACCESS', theme: 'core', width: 3050, goalX: 2950,
    ground: [[0, 640, 560], [760, 1020, 560], [1020, 1320, 500], [1460, 1720, 540], [1720, 2000, 500], [2140, 2440, 560], [2580, 3050, 560]],
    ledges: [[710, 460, 80], [1180, 400, 100], [1580, 450, 90], [1870, 405, 90], [2280, 460, 90], [2500, 430, 80]],
    blocks: [[1120, 420, 90, 120], [1860, 405, 80, 105]],
    turrets: [[1150, 500], [1780, 500], [2300, 560]],
    enemies: [
      { kind: 'soldier', x: 240, y: 520, hp: 4, speed: 70 },
      { kind: 'tank', x: 560, y: 520, hp: 8, speed: 30 },
      { kind: 'soldier', x: 1080, y: 460, hp: 4, speed: 75 },
      { kind: 'tank', x: 1500, y: 500, hp: 8, speed: 32 },
      { kind: 'soldier', x: 1880, y: 460, hp: 4, speed: 75 },
      { kind: 'tank', x: 2250, y: 520, hp: 9, speed: 32 },
      { kind: 'soldier', x: 2650, y: 520, hp: 4, speed: 75 },
      { kind: 'soldier', x: 2820, y: 520, hp: 4, speed: 75 },
      { kind: 'flyer', x: 420, y: 70, hp: 4, speed: 75 },
      { kind: 'flyer', x: 980, y: 55, hp: 4, speed: 80 },
      { kind: 'flyer', x: 1600, y: 75, hp: 4, speed: 75 },
      { kind: 'flyer', x: 2150, y: 60, hp: 4, speed: 80 },
      { kind: 'flyer', x: 2700, y: 80, hp: 4, speed: 75 },
    ],
    powerups: [[1180, 360, 'rapid'], [1580, 410, 'health'], [1870, 365, 'laser'], [2500, 390, 'fire']],
  },
  {
    name: 'APEX THRONE', theme: 'throne', width: 1500, goalX: 9999,
    ground: [[0, 1500, 560]],
    ledges: [[250, 460, 120], [550, 400, 130], [850, 400, 130], [1150, 460, 120], [700, 320, 150]],
    blocks: [],
    turrets: [[120, 560], [1380, 560]],
    enemies: [
      { kind: 'boss', x: 750, y: 120, hp: 60, speed: 55 },
      { kind: 'flyer', x: 200, y: 90, hp: 3, speed: 55 },
      { kind: 'flyer', x: 1250, y: 90, hp: 3, speed: 55 },
      { kind: 'tank', x: 300, y: 520, hp: 8, speed: 28 },
      { kind: 'tank', x: 1150, y: 520, hp: 8, speed: 28 },
    ],
    powerups: [[300, 420, 'health'], [750, 280, 'laser'], [1150, 420, 'fire']],
  },
]

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
  private decor: Phaser.GameObjects.GameObject[] = []
  private lastFired = 0
  private fireRate = 100
  private health = 5
  private maxHealth = 6
  private score = 0
  private level = 1
  private lives = 3
  private combo = 0
  private comboTimer = 0
  private healthText!: Phaser.GameObjects.Text
  private scoreText!: Phaser.GameObjects.Text
  private levelText!: Phaser.GameObjects.Text
  private weaponText!: Phaser.GameObjects.Text
  private livesText!: Phaser.GameObjects.Text
  private comboText!: Phaser.GameObjects.Text
  private gameOver = false
  private levelTransition = false
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
  private jumpCount = 0
  private maxJumps = 2
  private spawnTimer = 0
  private bossPhase = 1
  private levelGoalX = 2700
  private levelWidth = 2800
  private lastGroundX = 80
  private lastGroundY = 480

  constructor() {
    super({ key: 'MainScene' })
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
    this.invulnerable = false
    this.facingRight = true
    this.weapon = 'normal'
    this.fireRate = 100
    this.jumpCount = 0
    this.spawnTimer = 0
    this.bossPhase = 1
    this.prone = false
    this.decor = []
    this.touch = { left: false, right: false, jump: false, shoot: false, up: false, down: false }

    this.createTextures()
    this.createThemeTextures()

    this.platforms = this.physics.add.staticGroup()
    this.bullets = this.physics.add.group({ classType: Phaser.Physics.Arcade.Image, maxSize: 120 })
    this.enemyBullets = this.physics.add.group({ classType: Phaser.Physics.Arcade.Image, maxSize: 80 })
    this.enemies = this.physics.add.group()
    this.powerups = this.physics.add.group()

    // Parallax layers (fixed to camera, scrolled via tilePositionX)
    this.bgFar = this.add.tileSprite(400, 300, 800, 600, 'far_streets').setScrollFactor(0).setDepth(1)
    this.bgMid = this.add.tileSprite(400, 300, 800, 600, 'mid_streets').setScrollFactor(0).setDepth(2)

    this.buildLevel(1)

    const pKey = this.textures.exists('huntress') ? 'huntress' : 'player'
    this.player = this.physics.add.sprite(80, 500, pKey)
    if (pKey === 'huntress') this.player.setDisplaySize(64, 64)
    this.player.setCollideWorldBounds(true)
    this.player.setBounce(0.02)
    this.player.setDepth(25)
    this.player.setDragX(1800)
    this.player.setMaxVelocity(380, 1200)

    this.cameras.main.startFollow(this.player, true, 0.14, 0.14)
    this.cameras.main.setDeadzone(100, 60)

    this.physics.add.collider(this.player, this.platforms)
    this.physics.add.collider(this.enemies, this.platforms)
    this.physics.add.collider(this.powerups, this.platforms)

    this.physics.add.overlap(this.bullets, this.enemies, this.hitEnemy as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this)
    this.physics.add.overlap(this.player, this.enemies, this.hitPlayer as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this)
    this.physics.add.overlap(this.player, this.powerups, this.collectPowerup as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this)
    this.physics.add.overlap(this.player, this.enemyBullets, this.hitByEnemyBullet as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this)

    this.cursors = this.input.keyboard!.createCursorKeys()
    this.wasd = {
      up: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    }
    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)

    this.wasd.up.on('down', () => this.tryJump())
    this.cursors.up.on('down', () => this.tryJump())

    this.particles = this.add.particles(0, 0, 'spark', {
      speed: { min: 120, max: 380 },
      scale: { start: 1.4, end: 0 },
      lifespan: 500,
      blendMode: 'ADD',
      emitting: false,
    })
    this.particles.setDepth(24)

    this.createHUD()
    this.createTouchControls()
    this.showBanner('LEVEL 1', LEVELS[0].name)
  }

  private tryJump() {
    if (this.gameOver || this.levelTransition) return
    const body = this.player.body as Phaser.Physics.Arcade.Body
    if (body.blocked.down) this.jumpCount = 0
    if (this.jumpCount < this.maxJumps) {
      this.player.setVelocityY(-580)
      this.jumpCount++
    }
  }

  private createTextures() {
    if (!this.textures.exists('player')) {
      const p = this.make.graphics({ x: 0, y: 0 })
      p.fillStyle(0x7c3aed, 1)
      p.fillRoundedRect(4, 8, 24, 36, 4)
      p.fillStyle(0x22d3ee, 1)
      p.fillCircle(16, 10, 6)
      p.generateTexture('player', 32, 48)
      p.destroy()
    }

    // Ground/terrain: light vertical gradient, tinted per theme at build time.
    if (!this.textures.exists('terrain')) {
      const g = this.make.graphics({ x: 0, y: 0 })
      g.fillGradientStyle(0xbfc4d6, 0xbfc4d6, 0x30323f, 0x30323f, 1)
      g.fillRect(0, 0, 32, 256)
      g.generateTexture('terrain', 32, 256)
      g.destroy()
    }

    // Fat cyan bolt
    if (!this.textures.exists('bullet')) {
      const g = this.make.graphics({ x: 0, y: 0 })
      g.fillStyle(0x22d3ee, 1)
      g.fillRoundedRect(0, 2, 22, 10, 3)
      g.fillStyle(0xffffff, 1)
      g.fillRoundedRect(2, 4, 14, 6, 2)
      g.generateTexture('bullet', 22, 14)
      g.destroy()
    }
    if (!this.textures.exists('laser')) {
      const g = this.make.graphics({ x: 0, y: 0 })
      g.fillStyle(0xe879f9, 1)
      g.fillRect(0, 0, 40, 8)
      g.fillStyle(0xffffff, 1)
      g.fillRect(0, 2, 40, 4)
      g.generateTexture('laser', 40, 8)
      g.destroy()
    }
    if (!this.textures.exists('fireball')) {
      const g = this.make.graphics({ x: 0, y: 0 })
      g.fillStyle(0xfb923c, 1)
      g.fillCircle(12, 12, 12)
      g.fillStyle(0xfef08a, 1)
      g.fillCircle(12, 12, 6)
      g.generateTexture('fireball', 24, 24)
      g.destroy()
    }
    if (!this.textures.exists('enemyBullet')) {
      const g = this.make.graphics({ x: 0, y: 0 })
      g.fillStyle(0xf43f5e, 1)
      g.fillRoundedRect(0, 1, 16, 8, 2)
      g.fillStyle(0xfecdd3, 1)
      g.fillRoundedRect(2, 3, 10, 4, 1)
      g.generateTexture('enemyBullet', 16, 10)
      g.destroy()
    }

    // Gun turret — stationary emplacement
    if (!this.textures.exists('turret')) {
      const g = this.make.graphics({ x: 0, y: 0 })
      g.fillStyle(0x2b2740, 1)
      g.fillRect(4, 22, 40, 16)          // base
      g.fillStyle(0x3f3a5c, 1)
      g.fillRoundedRect(10, 8, 28, 18, 6) // dome
      g.fillStyle(0x18151f, 1)
      g.fillRect(30, 14, 18, 7)           // barrel
      g.fillStyle(0xf43f5e, 1)
      g.fillCircle(24, 17, 4)             // eye
      g.generateTexture('turret', 48, 40)
      g.destroy()
    }

    const mk = (key: string, color: number, w: number, h: number) => {
      if (this.textures.exists(key)) return
      const g = this.make.graphics({ x: 0, y: 0 })
      g.fillStyle(color, 1)
      g.fillRect(0, 0, w, h)
      g.generateTexture(key, w, h)
      g.destroy()
    }
    mk('enemy', 0xe11d48, 32, 36)
    mk('flyer', 0xa855f7, 32, 32)
    mk('tank', 0xea580c, 44, 40)
    mk('boss', 0xdc2626, 64, 58)

    ;['pow_health', 'pow_spread', 'pow_rapid', 'pow_laser', 'pow_fire'].forEach((k, i) => {
      const colors = [0x4ade80, 0x22d3ee, 0xfbbf24, 0xe879f9, 0xfb923c]
      if (!this.textures.exists(k)) {
        const g = this.make.graphics({ x: 0, y: 0 })
        g.fillStyle(colors[i], 1)
        g.fillCircle(14, 14, 14)
        g.fillStyle(0xffffff, 0.95)
        g.fillCircle(14, 14, 6)
        g.generateTexture(k, 28, 28)
        g.destroy()
      }
    })

    if (!this.textures.exists('spark')) {
      const s = this.make.graphics({ x: 0, y: 0 })
      s.fillStyle(0xffffff, 1)
      s.fillCircle(6, 6, 6)
      s.generateTexture('spark', 12, 12)
      s.destroy()
    }
  }

  private createThemeTextures() {
    const makeSkyline = (key: string, color: number, accent: number, baseY: number, step: number) => {
      if (this.textures.exists(key)) return
      const g = this.make.graphics({ x: 0, y: 0 })
      let x = 0
      while (x < 800) {
        const w = Phaser.Math.Between(Math.floor(step * 0.6), Math.floor(step * 1.5))
        const h = Phaser.Math.Between(70, 240)
        const top = baseY - h
        g.fillStyle(color, 1)
        g.fillRect(x, top, w - 6, h)
        g.fillStyle(accent, 0.45)
        for (let wy = top + 12; wy < baseY - 10; wy += 22) {
          for (let wx = x + 6; wx < x + w - 14; wx += 16) {
            if (Math.random() > 0.62) g.fillRect(wx, wy, 6, 9)
          }
        }
        x += w
      }
      g.generateTexture(key, 800, 600)
      g.destroy()
    }

    ;(Object.keys(THEMES) as ThemeName[]).forEach((name) => {
      const t = THEMES[name]
      makeSkyline('far_' + name, t.far, t.rim, 380, 68)
      makeSkyline('mid_' + name, t.mid, t.accent, 500, 108)
    })
  }

  private buildLevel(lvl: number) {
    this.platforms.clear(true, true)
    this.enemies.clear(true, true)
    this.powerups.clear(true, true)
    this.bullets.clear(true, true)
    this.enemyBullets.clear(true, true)
    this.decor.forEach((d) => d.destroy())
    this.decor = []
    this.spawnTimer = 0
    this.bossPhase = 1

    const def = LEVELS[lvl - 1]
    const theme = THEMES[def.theme]
    this.levelWidth = def.width
    this.levelGoalX = def.goalX

    this.cameras.main.setBackgroundColor(theme.bg)
    this.physics.world.setBounds(0, 0, def.width, WORLD_FLOOR)
    this.cameras.main.setBounds(0, 0, def.width, 600)

    this.bgFar.setTexture('far_' + def.theme)
    this.bgMid.setTexture('mid_' + def.theme)
    this.bgFar.tilePositionX = 0
    this.bgMid.tilePositionX = 0

    const solid = (cx: number, top: number, w: number, h: number, tint: number, rim: number) => {
      const s = this.platforms.create(cx, top + h / 2, 'terrain') as Phaser.Physics.Arcade.Sprite
      s.setDisplaySize(w, h)
      s.setTint(tint)
      s.setDepth(5)
      s.refreshBody()
      const edge = this.add.rectangle(cx, top + 2, w, 4, rim, 0.95).setDepth(6)
      this.decor.push(edge)
    }

    // Ground spans (gaps = pits)
    def.ground.forEach(([x1, x2, top]) => solid((x1 + x2) / 2, top, x2 - x1, WORLD_FLOOR - top, theme.fill, theme.rim))
    // Floating ledges
    def.ledges.forEach(([cx, top, w]) => solid(cx, top, w, 20, theme.ledge, theme.rim))
    // Climbable structures
    def.blocks.forEach(([cx, top, w, h]) => solid(cx, top, w, h, theme.ledge, theme.accent))

    // Extraction gate at the goal
    if (def.goalX < def.width) {
      const gx = def.goalX
      this.decor.push(this.add.rectangle(gx + 14, 470, 44, 176, theme.accent, 0.16).setDepth(6))
      this.decor.push(this.add.rectangle(gx, 470, 14, 176, theme.rim, 1).setDepth(7))
      this.decor.push(this.add.rectangle(gx + 28, 470, 14, 176, theme.rim, 1).setDepth(7))
      this.decor.push(this.add.rectangle(gx + 14, 386, 58, 16, theme.accent, 1).setDepth(7))
      const chev = this.add.text(gx + 14, 300, '▼', { fontFamily: 'monospace', fontSize: '20px', color: '#' + theme.rim.toString(16).padStart(6, '0') }).setOrigin(0.5).setDepth(7)
      this.tweens.add({ targets: chev, y: 320, duration: 700, yoyo: true, repeat: -1 })
      this.decor.push(chev)
    }

    def.turrets.forEach(([x, surY]) => this.spawnEnemy('turret', x, surY - 19, 4 + lvl, 0))
    def.enemies.forEach((e) => this.spawnEnemy(e.kind, e.x, e.y, e.hp, e.speed))
    def.powerups.forEach(([x, y, kind]) => this.spawnPowerup(x, y, kind as string))
  }

  private spawnEnemy(kind: string, x: number, y: number, hp: number, speed: number, type?: string) {
    let tex = 'enemy'
    let t = type || 'walker'
    let displayW = 48
    let displayH = 48

    if (kind === 'soldier' || kind === 'enemy') {
      tex = this.textures.exists('enemy_soldier') ? 'enemy_soldier' : 'enemy'
      t = 'walker'; displayW = 52; displayH = 52
    } else if (kind === 'flyer') {
      tex = this.textures.exists('enemy_flyer') ? 'enemy_flyer' : 'flyer'
      t = 'flyer'; displayW = 50; displayH = 50
    } else if (kind === 'tank') {
      tex = this.textures.exists('enemy_tank') ? 'enemy_tank' : 'tank'
      t = 'tank'; displayW = 68; displayH = 58
    } else if (kind === 'turret') {
      tex = 'turret'
      t = 'turret'; displayW = 48; displayH = 40
    } else if (kind === 'boss') {
      tex = this.textures.exists('boss_art') ? 'boss_art' : 'boss'
      t = 'boss'; displayW = 110; displayH = 100
    }

    const enemy = this.enemies.create(x, y, tex) as Phaser.Physics.Arcade.Sprite
    enemy.setDisplaySize(displayW, displayH)
    enemy.setBounce(0.02)
    enemy.setCollideWorldBounds(false)
    enemy.setData('hp', hp)
    enemy.setData('maxHp', hp)
    enemy.setData('speed', speed)
    enemy.setData('type', t)
    enemy.setData('dir', Math.random() > 0.5 ? 1 : -1)
    enemy.setData('shootTimer', Phaser.Math.Between(200, 900))
    enemy.setDepth(18)

    if (t === 'flyer' || t === 'boss') {
      enemy.setVelocity(speed * (Math.random() > 0.5 ? 1 : -1), t === 'boss' ? 15 : speed * 0.3)
      ;(enemy.body as Phaser.Physics.Arcade.Body).setAllowGravity(false)
    } else if (t === 'turret') {
      ;(enemy.body as Phaser.Physics.Arcade.Body).setAllowGravity(false)
      enemy.setImmovable(true)
      enemy.setVelocity(0, 0)
    } else {
      enemy.setVelocityX(speed * (enemy.getData('dir') as number))
    }
  }

  private spawnPowerup(x: number, y: number, kind: string) {
    const usePod = this.textures.exists('pickup_pod')
    const tex = usePod ? 'pickup_pod' : ({
      health: 'pow_health', spread: 'pow_spread', rapid: 'pow_rapid',
      laser: 'pow_laser', fire: 'pow_fire',
    } as Record<string, string>)[kind]

    const p = this.powerups.create(x, y, tex) as Phaser.Physics.Arcade.Sprite
    p.setData('kind', kind)
    if (usePod) p.setDisplaySize(40, 40)
    p.setBounce(0.55)
    p.setCollideWorldBounds(false)
    p.setVelocityY(-130)
    p.setDepth(14)
  }

  private createHUD() {
    this.add.rectangle(100, 58, 180, 105, 0x0a0612, 0.75).setScrollFactor(0).setDepth(99).setStrokeStyle(1, 0xa855f7, 0.5)
    this.scoreText = this.add.text(16, 10, 'SCORE  0', { fontFamily: 'monospace', fontSize: '14px', color: '#e879f9' }).setScrollFactor(0).setDepth(100)
    this.healthText = this.add.text(16, 30, 'HP  ♥♥♥♥♥', { fontFamily: 'monospace', fontSize: '13px', color: '#f472b6' }).setScrollFactor(0).setDepth(100)
    this.livesText = this.add.text(16, 48, 'LIVES  3', { fontFamily: 'monospace', fontSize: '12px', color: '#a1a1aa' }).setScrollFactor(0).setDepth(100)
    this.levelText = this.add.text(16, 64, 'LEVEL  1', { fontFamily: 'monospace', fontSize: '12px', color: '#71717a' }).setScrollFactor(0).setDepth(100)
    this.weaponText = this.add.text(16, 80, 'GUN  NORMAL', { fontFamily: 'monospace', fontSize: '12px', color: '#22d3ee' }).setScrollFactor(0).setDepth(100)
    this.comboText = this.add.text(16, 96, '', { fontFamily: 'monospace', fontSize: '12px', color: '#fbbf24' }).setScrollFactor(0).setDepth(100)
    this.add.text(788, 10, 'APEX STRIKE', { fontFamily: 'monospace', fontSize: '12px', color: '#a855f7' }).setOrigin(1, 0).setScrollFactor(0).setDepth(100)
  }

  private createTouchControls() {
    const btn = (x: number, y: number, w: number, h: number, label: string, key: keyof TouchState) => {
      const bg = this.add.rectangle(x, y, w, h, 0x1e1b4b, 0.55).setScrollFactor(0).setDepth(150).setInteractive()
      bg.setStrokeStyle(1, 0xa855f7, 0.5)
      this.add.text(x, y, label, { fontFamily: 'monospace', fontSize: '12px', color: '#e9d5ff' }).setOrigin(0.5).setScrollFactor(0).setDepth(151)
      bg.on('pointerdown', () => {
        this.touch[key] = true
        bg.setFillStyle(0x7c3aed, 0.7)
        if (key === 'jump') this.tryJump()
      })
      bg.on('pointerup', () => { this.touch[key] = false; bg.setFillStyle(0x1e1b4b, 0.55) })
      bg.on('pointerout', () => { this.touch[key] = false; bg.setFillStyle(0x1e1b4b, 0.55) })
      this.input.addPointer(4)
    }
    btn(50, 530, 60, 48, '◀', 'left')
    btn(120, 530, 60, 48, '▶', 'right')
    btn(85, 470, 80, 44, 'JUMP', 'jump')
    btn(50, 410, 60, 40, '▲', 'up')
    btn(120, 410, 60, 40, '▼', 'down')
    btn(730, 510, 90, 64, 'FIRE', 'shoot')
  }

  private showBanner(title: string, subtitle: string) {
    const t = this.add.text(400, 250, title + '\n' + subtitle, {
      fontFamily: 'monospace', fontSize: '26px', color: '#22d3ee', align: 'center',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(200).setAlpha(0)
    this.tweens.add({ targets: t, alpha: 1, duration: 300, yoyo: true, hold: 700, onComplete: () => t.destroy() })
  }

  private popup(x: number, y: number, text: string, color = '#e879f9') {
    const t = this.add.text(x, y, text, { fontFamily: 'monospace', fontSize: '16px', color }).setOrigin(0.5).setDepth(50)
    this.tweens.add({ targets: t, y: y - 50, alpha: 0, duration: 600, onComplete: () => t.destroy() })
  }

  update(time: number, delta: number) {
    if (this.gameOver || this.levelTransition || !this.player?.active) return

    const body = this.player.body as Phaser.Physics.Arcade.Body
    if (body.blocked.down) {
      this.jumpCount = 0
      if (this.player.y < 640) {
        this.lastGroundX = this.player.x
        this.lastGroundY = this.player.y
      }
    }

    // Fell into a pit
    if (this.player.y > FALL_Y) {
      this.pitFall()
      return
    }

    // Parallax scroll
    this.bgFar.tilePositionX = this.cameras.main.scrollX * 0.25
    this.bgMid.tilePositionX = this.cameras.main.scrollX * 0.5

    if (this.combo > 0) {
      this.comboTimer -= delta
      if (this.comboTimer <= 0) {
        this.combo = 0
        this.comboText.setText('')
      }
    }

    // Pose / animation
    if (this.textures.exists('huntress')) {
      const moving = Math.abs(body.velocity.x) > 20
      let key = 'huntress'
      if (!this.prone && moving && this.textures.exists('huntress_run')) key = 'huntress_run'
      if (this.player.texture.key !== key) this.player.setTexture(key)
      this.player.setDisplaySize(64, this.prone ? 42 : 64)
    }

    if (this.level < 5 && this.player.x >= this.levelGoalX) {
      this.onLevelClear()
      return
    }

    this.handleInput(time)
    this.updateEnemies(delta)
    this.maybeSpawnReinforcements(delta)
  }

  private pitFall() {
    if (this.gameOver || this.levelTransition) return
    this.player.setVelocity(0, 0)
    this.player.setPosition(this.lastGroundX, this.lastGroundY - 44)
    this.cameras.main.shake(180, 0.02)
    this.cameras.main.flash(120, 120, 40, 200, false)
    this.health -= 2
    this.combo = 0
    this.comboText.setText('')
    this.updateHealth()
    this.invulnerable = true
    this.player.setTint(0xff3060)
    this.time.delayedCall(700, () => { this.invulnerable = false; if (this.player.active) this.player.clearTint() })

    if (this.health <= 0) {
      this.lives -= 1
      this.livesText.setText('LIVES  ' + this.lives)
      if (this.lives <= 0) {
        this.triggerGameOver()
      } else {
        this.health = 5
        this.updateHealth()
        this.jumpCount = 0
        this.invulnerable = true
        this.time.delayedCall(1300, () => { this.invulnerable = false; if (this.player.active) this.player.clearTint() })
      }
    }
  }

  private maybeSpawnReinforcements(delta: number) {
    if (this.level >= 5) return
    this.spawnTimer += delta
    const interval = 3200 - this.level * 280
    if (this.spawnTimer > interval && this.enemies.countActive(true) < 12 + this.level) {
      this.spawnTimer = 0
      const camX = this.cameras.main.scrollX
      const side = Phaser.Math.Clamp(Math.random() > 0.5 ? camX + 820 : camX - 20, 40, this.levelWidth - 40)
      if (Math.random() > 0.4) {
        const y = Phaser.Math.Between(80, 300)
        this.spawnEnemy('flyer', side, y, 2 + Math.floor(this.level / 2), 48 + this.level * 6)
      } else {
        // paratrooper — drops in from above onto the terrain
        this.spawnEnemy('soldier', side, 90, 2 + Math.floor(this.level / 2), 55 + this.level * 8, 'walker')
      }
    }
  }

  private handleInput(time: number) {
    const speed = 310
    const body = this.player.body as Phaser.Physics.Arcade.Body
    this.onGround = body.blocked.down

    let left = this.cursors.left.isDown || this.wasd.left.isDown || this.touch.left
    let right = this.cursors.right.isDown || this.wasd.right.isDown || this.touch.right
    let shoot = this.spaceKey.isDown || this.touch.shoot
    this.aimUp = this.touch.up || this.cursors.up.isDown || this.wasd.up.isDown
    this.aimDown = this.wasd.down.isDown || this.cursors.down.isDown || this.touch.down

    const pad = this.input.gamepad?.getPad(0)
    if (pad) {
      if (pad.left || (pad.axes[0] && pad.axes[0].getValue() < -0.3)) left = true
      if (pad.right || (pad.axes[0] && pad.axes[0].getValue() > 0.3)) right = true
      if (pad.X || pad.buttons[2]?.pressed || pad.buttons[7]?.pressed) shoot = true
      if (pad.up || (pad.axes[1] && pad.axes[1].getValue() < -0.3)) this.aimUp = true
      if (pad.down || (pad.axes[1] && pad.axes[1].getValue() > 0.3)) this.aimDown = true
    }

    this.movingH = left || right
    this.prone = this.onGround && this.aimDown && !this.movingH

    if (this.movingH) {
      if (left) {
        this.player.setVelocityX(-speed)
        this.facingRight = false
        this.player.setFlipX(true)
      } else {
        this.player.setVelocityX(speed)
        this.facingRight = true
        this.player.setFlipX(false)
      }
    }

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

    // True 8-way aim: straight up, up-diagonal, horizontal, down-diagonal, straight down.
    let angle = 0
    if (this.aimUp && !this.aimDown) angle = this.movingH ? -45 : -90
    else if (this.aimDown && !this.onGround) angle = this.movingH ? 45 : 90

    const vertical = angle === -90 || angle === 90
    const baseX = this.player.x + dir * (vertical ? 4 : 28)
    const baseY = (this.prone ? this.player.y + 14 : this.player.y - 2) + (angle === 90 ? 10 : 0)

    const spawn = (ang: number, tex = 'bullet', spd = 780, scale = 1.3) => {
      const b = this.bullets.get(baseX, baseY, tex) as Phaser.Physics.Arcade.Image
      if (!b) return
      b.setActive(true).setVisible(true)
      b.setScale(scale)
      b.setDepth(20)
      b.body?.reset(baseX, baseY)
      const rad = Phaser.Math.DegToRad(ang)
      const isVert = ang === -90 || ang === 90
      const vx = isVert ? 0 : Math.cos(rad) * dir * spd
      const vy = isVert ? Math.sin(rad) * spd : Math.sin(rad) * spd
      b.setVelocity(vx, vy)
      this.time.delayedCall(1100, () => { if (b.active) b.setActive(false).setVisible(false) })
    }

    this.particles.emitParticleAt(baseX, baseY, 3)

    if (this.weapon === 'spread') {
      spawn(angle - 20, 'bullet', 760, 1.2)
      spawn(angle, 'bullet', 800, 1.4)
      spawn(angle + 20, 'bullet', 760, 1.2)
    } else if (this.weapon === 'laser') {
      spawn(angle, 'laser', 1100, 1.6)
      spawn(angle, 'laser', 1050, 1.2)
    } else if (this.weapon === 'fire') {
      spawn(angle, 'fireball', 620, 1.5)
      spawn(angle - 14, 'fireball', 580, 1.2)
      spawn(angle + 14, 'fireball', 580, 1.2)
    } else if (this.weapon === 'rapid') {
      spawn(angle, 'bullet', 820, 1.15)
    } else {
      spawn(angle, 'bullet', 780, 1.35)
    }
  }

  private updateEnemies(delta: number) {
    this.enemies.getChildren().forEach((child) => {
      const enemy = child as Phaser.Physics.Arcade.Sprite
      if (!enemy.active) return
      const type = enemy.getData('type') as string

      // Clean up anything that walked off into a pit
      if (type !== 'turret' && enemy.y > 720) {
        enemy.destroy()
        return
      }

      const speed = enemy.getData('speed') as number
      const body = enemy.body as Phaser.Physics.Arcade.Body

      if (type === 'walker' || type === 'tank') {
        if (body.blocked.left || body.blocked.right) {
          const d = -(enemy.getData('dir') as number)
          enemy.setData('dir', d)
          enemy.setVelocityX(d * speed)
          enemy.setFlipX(d < 0)
        }
      }

      if (type === 'flyer') {
        const dx = this.player.x - enemy.x
        const dy = this.player.y - enemy.y - 40
        enemy.setVelocityX(Phaser.Math.Clamp(dx * 0.55, -speed, speed))
        enemy.setVelocityY(Phaser.Math.Clamp(dy * 0.35, -speed * 0.55, speed * 0.55))
        enemy.setFlipX(dx < 0)
      }

      if (type === 'turret') {
        enemy.setFlipX(this.player.x < enemy.x)
      }

      if (type === 'boss') {
        const hp = enemy.getData('hp') as number
        const maxHp = enemy.getData('maxHp') as number
        if (hp / maxHp < 0.5 && this.bossPhase === 1) {
          this.bossPhase = 2
          this.popup(enemy.x, enemy.y - 55, 'PHASE 2', '#f43f5e')
          this.cameras.main.shake(250, 0.025)
        }
        const spd = this.bossPhase === 2 ? speed * 1.45 : speed
        const dx = this.player.x - enemy.x
        enemy.setVelocityX(Phaser.Math.Clamp(dx * 0.5, -spd, spd))
        enemy.setVelocityY(Math.sin(this.time.now / (this.bossPhase === 2 ? 180 : 280)) * (this.bossPhase === 2 ? 70 : 45))
        enemy.setFlipX(dx < 0)
      }

      if (type === 'tank' || type === 'flyer' || type === 'boss' || type === 'turret') {
        let timer = enemy.getData('shootTimer') as number
        timer -= delta
        if (timer <= 0) {
          let count = 1
          if (type === 'boss') count = this.bossPhase === 2 ? 9 : 6
          else if (type === 'turret') count = this.level >= 3 ? 2 : 1
          this.enemyFire(enemy, count)
          let base = 900
          if (type === 'boss') base = this.bossPhase === 2 ? 480 : 680
          else if (type === 'tank') base = 1100
          else if (type === 'turret') base = Math.max(650, 1250 - this.level * 90)
          enemy.setData('shootTimer', base)
        } else {
          enemy.setData('shootTimer', timer)
        }
      }
    })
  }

  private enemyFire(enemy: Phaser.Physics.Arcade.Sprite, count: number) {
    for (let i = 0; i < count; i++) {
      const b = this.enemyBullets.get(enemy.x, enemy.y, 'enemyBullet') as Phaser.Physics.Arcade.Image
      if (!b) continue
      b.setActive(true).setVisible(true)
      b.setScale(1.3)
      b.setDepth(19)
      b.body?.reset(enemy.x, enemy.y)
      const spread = (i - (count - 1) / 2) * 0.16
      const ang = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y) + spread
      const spd = count > 1 ? 220 : 270
      b.setVelocity(Math.cos(ang) * spd, Math.sin(ang) * spd)
      this.time.delayedCall(2200, () => { if (b.active) b.setActive(false).setVisible(false) })
    }
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

    enemy.setTint(0xffffff)
    this.time.delayedCall(50, () => { if (enemy.active) enemy.clearTint() })
    this.cameras.main.shake(20, 0.005)
    this.particles.emitParticleAt(enemy.x, enemy.y, 5)

    if (hp <= 0) {
      const type = enemy.getData('type') as string
      let pts = type === 'boss' ? 4000 : type === 'tank' ? 500 : type === 'turret' ? 350 : type === 'flyer' ? 250 : 120

      this.combo++
      this.comboTimer = 2400
      if (this.combo > 1) {
        pts = Math.floor(pts * (1 + Math.min(this.combo, 15) * 0.12))
        this.comboText.setText('COMBO x' + this.combo)
      }

      this.score += pts
      this.scoreText.setText('SCORE  ' + this.score)
      this.popup(enemy.x, enemy.y - 20, '+' + pts)
      this.particles.emitParticleAt(enemy.x, enemy.y, 32)
      this.cameras.main.shake(90, 0.016)

      if (type === 'tank' || type === 'boss' || type === 'turret') {
        this.cameras.main.flash(100, 200, 100, 255, false)
      }

      if (Math.random() < 0.32 && type !== 'boss') {
        const kinds = ['health', 'spread', 'rapid', 'laser', 'fire']
        this.spawnPowerup(enemy.x, enemy.y, kinds[Math.floor(Math.random() * kinds.length)])
      }

      enemy.destroy()
      if (this.level === 5 && this.enemies.countActive(true) === 0) this.onLevelClear()
    }
  }

  private hitPlayer(
    _p: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    _e: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile
  ) {
    this.damagePlayer()
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
    this.combo = 0
    this.comboText.setText('')
    this.updateHealth()
    this.invulnerable = true
    this.player.setTint(0xff0030)
    this.cameras.main.shake(140, 0.018)
    this.cameras.main.flash(100, 255, 30, 40, false)
    this.player.setVelocityY(-280)

    this.time.delayedCall(800, () => {
      this.invulnerable = false
      if (this.player.active) this.player.clearTint()
    })

    if (this.health <= 0) {
      this.lives -= 1
      this.livesText.setText('LIVES  ' + this.lives)
      if (this.lives <= 0) {
        this.triggerGameOver()
      } else {
        this.health = 5
        this.updateHealth()
        this.player.setPosition(Math.max(80, this.cameras.main.scrollX + 80), 480)
        this.player.setVelocity(0, 0)
        this.jumpCount = 0
        this.invulnerable = true
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

    if (kind === 'health') {
      this.health = Math.min(this.maxHealth, this.health + 1)
      this.updateHealth()
    } else {
      this.weapon = kind as typeof this.weapon
      const labels: Record<string, string> = {
        spread: 'SPREAD', rapid: 'RAPID', laser: 'LASER', fire: 'FIRE',
      }
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

    if (this.level < 5) {
      const next = this.level + 1
      const msg = this.add.text(400, 260, `LEVEL ${next}\n${LEVELS[next - 1].name}`, {
        fontFamily: 'monospace', fontSize: '24px', color: '#22d3ee', align: 'center',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(200)

      this.time.delayedCall(1300, () => {
        msg.destroy()
        this.level = next
        this.levelText.setText('LEVEL  ' + next)
        this.player.setPosition(80, 500)
        this.player.setVelocity(0, 0)
        this.jumpCount = 0
        this.lastGroundX = 80
        this.lastGroundY = 480
        this.health = Math.min(this.maxHealth, this.health + 1)
        this.updateHealth()
        this.buildLevel(next)
        this.levelTransition = false
        this.showBanner('LEVEL ' + next, LEVELS[next - 1].name)
      })
    } else {
      this.showVictory()
    }
  }

  private triggerGameOver() {
    this.gameOver = true
    this.player.setTint(0x333333)
    this.player.setVelocity(0, 0)
    this.add.rectangle(400, 300, 800, 600, 0x0a0612, 0.88).setScrollFactor(0).setDepth(200)
    this.add.text(400, 210, 'MISSION FAILED', { fontFamily: 'monospace', fontSize: '30px', color: '#f43f5e' }).setOrigin(0.5).setScrollFactor(0).setDepth(201)
    this.add.text(400, 270, 'Score: ' + this.score, { fontFamily: 'monospace', fontSize: '18px', color: '#e879f9' }).setOrigin(0.5).setScrollFactor(0).setDepth(201)
    this.add.text(400, 310, 'Reached Level ' + this.level, { fontFamily: 'monospace', fontSize: '13px', color: '#a1a1aa' }).setOrigin(0.5).setScrollFactor(0).setDepth(201)
    const btn = this.add.text(400, 370, '[ CLICK / TAP TO RESTART ]', {
      fontFamily: 'monospace', fontSize: '14px', color: '#c4b5fd',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(201).setInteractive({ useHandCursor: true })
    btn.on('pointerdown', () => this.scene.restart())
  }

  private showVictory() {
    this.gameOver = true
    this.player.setVelocity(0, 0)
    this.add.rectangle(400, 300, 800, 600, 0x0a0612, 0.88).setScrollFactor(0).setDepth(200)
    this.add.text(400, 180, 'SECTOR DOMINATED', { fontFamily: 'monospace', fontSize: '28px', color: '#22d3ee' }).setOrigin(0.5).setScrollFactor(0).setDepth(201)
    this.add.text(400, 240, 'Final Score: ' + this.score, { fontFamily: 'monospace', fontSize: '18px', color: '#e879f9' }).setOrigin(0.5).setScrollFactor(0).setDepth(201)
    this.add.text(400, 290, 'The Huntress claims the Apex.', {
      fontFamily: 'monospace', fontSize: '13px', color: '#a1a1aa',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(201)
    const btn = this.add.text(400, 360, '[ CLICK / TAP TO PLAY AGAIN ]', {
      fontFamily: 'monospace', fontSize: '14px', color: '#c4b5fd',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(201).setInteractive({ useHandCursor: true })
    btn.on('pointerdown', () => this.scene.restart())
  }
}
