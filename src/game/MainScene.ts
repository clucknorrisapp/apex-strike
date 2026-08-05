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

const WORLD_W = 2400
const WORLD_H = 600

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
  private lastFired = 0
  private fireRate = 130
  private health = 4
  private maxHealth = 5
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
  private touch: TouchState = { left: false, right: false, jump: false, shoot: false, up: false, down: false }
  private weapon: 'normal' | 'spread' | 'rapid' | 'laser' | 'fire' = 'normal'
  private particles!: Phaser.GameObjects.Particles.ParticleEmitter
  private jumpCount = 0
  private maxJumps = 2
  private spawnTimer = 0
  private bossPhase = 1
  private levelGoalX = 2200

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
    this.health = 4
    this.lives = 3
    this.score = 0
    this.level = 1
    this.combo = 0
    this.comboTimer = 0
    this.invulnerable = false
    this.facingRight = true
    this.weapon = 'normal'
    this.fireRate = 130
    this.jumpCount = 0
    this.spawnTimer = 0
    this.bossPhase = 1
    this.touch = { left: false, right: false, jump: false, shoot: false, up: false, down: false }

    this.cameras.main.setBackgroundColor('#0a0612')
    this.createFallbackTextures()

    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H)
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H)

    this.platforms = this.physics.add.staticGroup()
    this.bullets = this.physics.add.group({ classType: Phaser.Physics.Arcade.Image, maxSize: 100 })
    this.enemyBullets = this.physics.add.group({ classType: Phaser.Physics.Arcade.Image, maxSize: 70 })
    this.enemies = this.physics.add.group()
    this.powerups = this.physics.add.group()

    this.drawBackdrop()
    this.buildLevel(1)

    const pKey = this.textures.exists('huntress') ? 'huntress' : 'player'
    this.player = this.physics.add.sprite(80, 480, pKey)
    if (pKey === 'huntress') this.player.setDisplaySize(56, 56)
    this.player.setCollideWorldBounds(true)
    this.player.setBounce(0.02)
    this.player.setDepth(25)
    this.player.setDragX(1700)
    this.player.setMaxVelocity(360, 1100)

    this.cameras.main.startFollow(this.player, true, 0.12, 0.12)
    this.cameras.main.setDeadzone(120, 80)

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
      speed: { min: 80, max: 260 },
      scale: { start: 1, end: 0 },
      lifespan: 420,
      blendMode: 'ADD',
      emitting: false,
    })

    this.createHUD()
    this.createTouchControls()
    this.showBanner('LEVEL 1', 'NEON STREETS')
  }

  private tryJump() {
    if (this.gameOver || this.levelTransition) return
    const body = this.player.body as Phaser.Physics.Arcade.Body
    if (body.blocked.down) this.jumpCount = 0
    if (this.jumpCount < this.maxJumps) {
      this.player.setVelocityY(-560)
      this.jumpCount++
    }
  }

  private drawBackdrop() {
    // Parallax-ish layered panels across the wide world
    for (let x = 0; x < WORLD_W; x += 400) {
      this.add.rectangle(x + 200, 150, 400, 300, 0x12081c, 0.5).setDepth(0)
      this.add.rectangle(x + 200, 450, 400, 300, 0x0a0612, 0.6).setDepth(0)
    }
    for (let x = 0; x < WORLD_W; x += 40) {
      this.add.rectangle(x, 300, 1, 600, 0x22d3ee, 0.025).setDepth(1)
    }
  }

  private createFallbackTextures() {
    if (!this.textures.exists('player')) {
      const p = this.make.graphics({ x: 0, y: 0 })
      p.fillStyle(0x7c3aed, 1)
      p.fillRoundedRect(4, 8, 24, 36, 4)
      p.fillStyle(0x22d3ee, 1)
      p.fillCircle(16, 10, 6)
      p.generateTexture('player', 32, 48)
      p.destroy()
    }
    if (!this.textures.exists('platform')) {
      const plat = this.make.graphics({ x: 0, y: 0 })
      plat.fillStyle(0x1e1b4b, 1)
      plat.fillRect(0, 2, 32, 12)
      plat.fillStyle(0xa855f7, 1)
      plat.fillRect(0, 0, 32, 3)
      plat.generateTexture('platform', 32, 14)
      plat.destroy()
    }
    const mk = (key: string, color: number, w: number, h: number) => {
      if (this.textures.exists(key)) return
      const g = this.make.graphics({ x: 0, y: 0 })
      g.fillStyle(color, 1)
      g.fillRect(0, 0, w, h)
      g.fillStyle(0xffffff, 0.8)
      g.fillRect(1, 1, w - 2, Math.max(1, h - 2))
      g.generateTexture(key, w, h)
      g.destroy()
    }
    mk('bullet', 0x22d3ee, 14, 5)
    mk('laser', 0xe879f9, 26, 3)
    mk('fireball', 0xfb923c, 12, 12)
    mk('enemyBullet', 0xf43f5e, 10, 5)
    mk('enemy', 0xe11d48, 32, 36)
    mk('flyer', 0xa855f7, 32, 32)
    mk('tank', 0xea580c, 44, 40)
    mk('boss', 0xdc2626, 64, 58)
    ;['pow_health', 'pow_spread', 'pow_rapid', 'pow_laser', 'pow_fire'].forEach((k, i) => {
      const colors = [0x4ade80, 0x22d3ee, 0xfbbf24, 0xe879f9, 0xfb923c]
      if (!this.textures.exists(k)) {
        const g = this.make.graphics({ x: 0, y: 0 })
        g.fillStyle(colors[i], 1)
        g.fillCircle(12, 12, 11)
        g.fillStyle(0xffffff, 0.9)
        g.fillCircle(12, 12, 5)
        g.generateTexture(k, 24, 24)
        g.destroy()
      }
    })
    if (!this.textures.exists('spark')) {
      const s = this.make.graphics({ x: 0, y: 0 })
      s.fillStyle(0xffffff, 1)
      s.fillCircle(4, 4, 4)
      s.generateTexture('spark', 8, 8)
      s.destroy()
    }
  }

  private buildLevel(lvl: number) {
    this.platforms.clear(true, true)
    this.enemies.clear(true, true)
    this.powerups.clear(true, true)
    this.bullets.clear(true, true)
    this.enemyBullets.clear(true, true)
    this.spawnTimer = 0
    this.bossPhase = 1

    const useTile = this.textures.exists('platform_tile')
    const groundKey = useTile ? 'platform_tile' : 'platform'

    // Continuous ground
    for (let x = 100; x < WORLD_W; x += 200) {
      const g = this.platforms.create(x, 590, groundKey) as Phaser.Physics.Arcade.Sprite
      if (useTile) g.setDisplaySize(210, 28)
      else g.setScale(7, 1.6)
      g.refreshBody()
    }

    const plat = (x: number, y: number, w: number) => {
      const p = this.platforms.create(x, y, groundKey) as Phaser.Physics.Arcade.Sprite
      if (useTile) p.setDisplaySize(w, 22)
      else p.setScale(w / 32, 0.85)
      p.refreshBody()
    }

    // Goal marker end of stage
    this.levelGoalX = lvl === 5 ? 1200 : 2100
    const goalFlag = this.add.rectangle(this.levelGoalX, 520, 12, 80, 0x22d3ee, 0.9).setDepth(5)
    this.add.rectangle(this.levelGoalX + 20, 490, 40, 24, 0xa855f7, 0.85).setDepth(5)
    void goalFlag

    if (lvl === 1) {
      plat(200, 480, 140); plat(450, 420, 160); plat(700, 360, 140); plat(950, 420, 120)
      plat(1200, 360, 140); plat(1450, 300, 130); plat(1700, 380, 150); plat(1950, 320, 140)
      plat(350, 300, 100); plat(1100, 250, 110); plat(1600, 240, 100)
      this.wave([
        [250, 430, 2, 55], [500, 370, 2, 60], [750, 310, 2, 55], [1000, 370, 2, 60],
        [1250, 310, 2, 55], [1500, 250, 3, 65], [1750, 330, 3, 60], [2000, 270, 3, 55],
        [400, 520, 2, 50], [900, 520, 2, 50], [1400, 520, 2, 55], [1800, 520, 2, 50],
      ])
      this.spawnEnemy('flyer', 600, 100, 2, 45)
      this.spawnEnemy('flyer', 1100, 80, 2, 50)
      this.spawnEnemy('flyer', 1600, 120, 2, 45)
      this.spawnPowerup(500, 380, 'spread')
      this.spawnPowerup(1200, 320, 'health')
      this.spawnPowerup(1700, 340, 'rapid')
    } else if (lvl === 2) {
      plat(180, 500, 120); plat(400, 440, 130); plat(650, 380, 130); plat(900, 320, 120)
      plat(1150, 380, 130); plat(1400, 300, 140); plat(1650, 360, 130); plat(1900, 280, 140)
      plat(300, 280, 100); plat(1000, 220, 110); plat(1500, 200, 100)
      this.wave([
        [220, 450, 3, 70], [450, 390, 3, 70], [700, 330, 3, 75], [950, 270, 3, 70],
        [1200, 330, 3, 75], [1450, 250, 3, 70], [1700, 310, 3, 75], [1950, 230, 3, 70],
        [500, 520, 3, 60], [1100, 520, 3, 65], [1600, 520, 3, 60],
      ])
      this.spawnEnemy('tank', 800, 520, 6, 28)
      this.spawnEnemy('tank', 1500, 520, 7, 30)
      this.spawnEnemy('flyer', 500, 80, 3, 55)
      this.spawnEnemy('flyer', 1000, 60, 3, 60)
      this.spawnEnemy('flyer', 1500, 90, 3, 55)
      this.spawnEnemy('flyer', 1900, 70, 3, 50)
      this.spawnPowerup(400, 400, 'rapid')
      this.spawnPowerup(1150, 340, 'health')
      this.spawnPowerup(1650, 320, 'laser')
    } else if (lvl === 3) {
      plat(200, 500, 110); plat(420, 450, 110); plat(650, 400, 120); plat(880, 350, 110)
      plat(1100, 400, 120); plat(1350, 320, 130); plat(1600, 380, 120); plat(1850, 300, 130)
      plat(2100, 360, 110); plat(350, 300, 90); plat(950, 240, 100); plat(1550, 220, 100)
      this.wave([
        [250, 450, 3, 80], [480, 400, 3, 80], [700, 350, 3, 85], [950, 300, 3, 80],
        [1150, 350, 3, 85], [1400, 270, 4, 80], [1650, 330, 4, 85], [1900, 250, 4, 80],
        [600, 520, 3, 70], [1200, 520, 3, 70], [1800, 520, 3, 75],
      ])
      this.spawnEnemy('tank', 700, 520, 7, 30)
      this.spawnEnemy('tank', 1400, 520, 8, 32)
      this.spawnEnemy('flyer', 400, 70, 3, 65)
      this.spawnEnemy('flyer', 900, 50, 3, 70)
      this.spawnEnemy('flyer', 1300, 80, 3, 65)
      this.spawnEnemy('flyer', 1700, 60, 3, 70)
      this.spawnEnemy('flyer', 2000, 90, 3, 60)
      this.spawnPowerup(650, 360, 'laser')
      this.spawnPowerup(1350, 280, 'health')
      this.spawnPowerup(1850, 260, 'fire')
    } else if (lvl === 4) {
      plat(200, 510, 110); plat(430, 460, 120); plat(680, 410, 120); plat(920, 360, 110)
      plat(1160, 410, 120); plat(1400, 330, 130); plat(1650, 380, 120); plat(1900, 300, 130)
      plat(2100, 360, 110); plat(350, 310, 90); plat(1000, 250, 100); plat(1550, 210, 100)
      this.wave([
        [250, 460, 4, 85], [500, 410, 4, 85], [750, 360, 4, 90], [1000, 310, 4, 85],
        [1200, 360, 4, 90], [1450, 280, 4, 85], [1700, 330, 4, 90], [1950, 250, 4, 85],
        [550, 520, 4, 75], [1250, 520, 4, 75], [1750, 520, 4, 80],
      ])
      this.spawnEnemy('tank', 600, 520, 8, 32)
      this.spawnEnemy('tank', 1200, 520, 8, 34)
      this.spawnEnemy('tank', 1800, 520, 9, 32)
      this.spawnEnemy('flyer', 400, 60, 4, 75)
      this.spawnEnemy('flyer', 900, 50, 4, 80)
      this.spawnEnemy('flyer', 1400, 70, 4, 75)
      this.spawnEnemy('flyer', 1850, 55, 4, 80)
      this.spawnPowerup(430, 420, 'rapid')
      this.spawnPowerup(1160, 370, 'health')
      this.spawnPowerup(1650, 340, 'laser')
      this.spawnPowerup(1900, 260, 'fire')
    } else {
      // Boss arena — tighter world segment
      this.physics.world.setBounds(0, 0, 1400, WORLD_H)
      this.cameras.main.setBounds(0, 0, 1400, WORLD_H)
      plat(200, 480, 140); plat(500, 420, 150); plat(800, 360, 150); plat(1100, 420, 140)
      plat(350, 300, 120); plat(700, 250, 130); plat(1000, 300, 120)
      this.spawnEnemy('boss', 700, 120, 45, 55)
      this.spawnEnemy('flyer', 200, 80, 3, 55)
      this.spawnEnemy('flyer', 1100, 80, 3, 55)
      this.spawnEnemy('tank', 300, 520, 7, 28)
      this.spawnEnemy('tank', 1000, 520, 7, 28)
      this.spawnPowerup(350, 260, 'health')
      this.spawnPowerup(700, 210, 'laser')
      this.spawnPowerup(1000, 260, 'fire')
      this.levelGoalX = 9999
    }
  }

  private wave(list: number[][]) {
    list.forEach(([x, y, hp, spd]) => this.spawnEnemy('soldier', x, y, hp, spd, 'walker'))
  }

  private spawnEnemy(kind: string, x: number, y: number, hp: number, speed: number, type?: string) {
    let tex = 'enemy'
    let t = type || 'walker'
    let displayW = 40
    let displayH = 40

    if (kind === 'soldier' || kind === 'enemy') {
      tex = this.textures.exists('enemy_soldier') ? 'enemy_soldier' : 'enemy'
      t = 'walker'
      displayW = 44; displayH = 44
    } else if (kind === 'flyer') {
      tex = this.textures.exists('enemy_flyer') ? 'enemy_flyer' : 'flyer'
      t = 'flyer'
      displayW = 42; displayH = 42
    } else if (kind === 'tank') {
      tex = this.textures.exists('enemy_tank') ? 'enemy_tank' : 'tank'
      t = 'tank'
      displayW = 56; displayH = 48
    } else if (kind === 'boss') {
      tex = this.textures.exists('boss_art') ? 'boss_art' : 'boss'
      t = 'boss'
      displayW = 96; displayH = 88
    }

    const enemy = this.enemies.create(x, y, tex) as Phaser.Physics.Arcade.Sprite
    enemy.setDisplaySize(displayW, displayH)
    enemy.setBounce(0.02)
    enemy.setCollideWorldBounds(true)
    enemy.setData('hp', hp)
    enemy.setData('maxHp', hp)
    enemy.setData('speed', speed)
    enemy.setData('type', t)
    enemy.setData('dir', Math.random() > 0.5 ? 1 : -1)
    enemy.setData('shootTimer', Phaser.Math.Between(300, 1000))
    enemy.setDepth(18)

    if (t === 'flyer' || t === 'boss') {
      enemy.setVelocity(speed * (Math.random() > 0.5 ? 1 : -1), t === 'boss' ? 15 : speed * 0.3)
      ;(enemy.body as Phaser.Physics.Arcade.Body).setAllowGravity(false)
    } else {
      enemy.setVelocityX(speed * (enemy.getData('dir') as number))
    }
  }

  private spawnPowerup(x: number, y: number, kind: string) {
    const usePod = this.textures.exists('pickup_pod')
    const tex = usePod ? 'pickup_pod' : ({
      health: 'pow_health', spread: 'pow_spread', rapid: 'pow_rapid',
      laser: 'pow_laser', fire: 'pow_fire'
    } as Record<string, string>)[kind]

    const p = this.powerups.create(x, y, tex) as Phaser.Physics.Arcade.Sprite
    p.setData('kind', kind)
    if (usePod) p.setDisplaySize(32, 32)
    p.setBounce(0.55)
    p.setVelocityY(-110)
    p.setDepth(14)
  }

  private createHUD() {
    this.add.rectangle(95, 55, 170, 100, 0x0a0612, 0.7).setScrollFactor(0).setDepth(99).setStrokeStyle(1, 0xa855f7, 0.45)
    this.scoreText = this.add.text(16, 10, 'SCORE  0', { fontFamily: 'monospace', fontSize: '13px', color: '#e879f9' }).setScrollFactor(0).setDepth(100)
    this.healthText = this.add.text(16, 28, 'HP  \u2665\u2665\u2665\u2665', { fontFamily: 'monospace', fontSize: '12px', color: '#f472b6' }).setScrollFactor(0).setDepth(100)
    this.livesText = this.add.text(16, 44, 'LIVES  3', { fontFamily: 'monospace', fontSize: '11px', color: '#a1a1aa' }).setScrollFactor(0).setDepth(100)
    this.levelText = this.add.text(16, 58, 'LEVEL  1', { fontFamily: 'monospace', fontSize: '11px', color: '#71717a' }).setScrollFactor(0).setDepth(100)
    this.weaponText = this.add.text(16, 72, 'GUN  NORMAL', { fontFamily: 'monospace', fontSize: '11px', color: '#22d3ee' }).setScrollFactor(0).setDepth(100)
    this.comboText = this.add.text(16, 88, '', { fontFamily: 'monospace', fontSize: '11px', color: '#fbbf24' }).setScrollFactor(0).setDepth(100)
    this.add.text(788, 10, 'APEX STRIKE', { fontFamily: 'monospace', fontSize: '11px', color: '#a855f7' }).setOrigin(1, 0).setScrollFactor(0).setDepth(100)
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
    btn(50, 530, 60, 48, '\u25C0', 'left')
    btn(120, 530, 60, 48, '\u25B6', 'right')
    btn(85, 470, 80, 44, 'JUMP', 'jump')
    btn(50, 410, 60, 40, '\u25B2', 'up')
    btn(120, 410, 60, 40, '\u25BC', 'down')
    btn(730, 510, 90, 64, 'FIRE', 'shoot')
  }

  private showBanner(title: string, subtitle: string) {
    const t = this.add.text(400, 250, title + '\n' + subtitle, {
      fontFamily: 'monospace', fontSize: '24px', color: '#22d3ee', align: 'center'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(200).setAlpha(0)
    this.tweens.add({ targets: t, alpha: 1, duration: 350, yoyo: true, hold: 800, onComplete: () => t.destroy() })
  }

  private popup(x: number, y: number, text: string, color = '#e879f9') {
    const t = this.add.text(x, y, text, { fontFamily: 'monospace', fontSize: '14px', color }).setOrigin(0.5).setDepth(50)
    this.tweens.add({ targets: t, y: y - 44, alpha: 0, duration: 650, onComplete: () => t.destroy() })
  }

  update(time: number, delta: number) {
    if (this.gameOver || this.levelTransition || !this.player?.active) return

    const body = this.player.body as Phaser.Physics.Arcade.Body
    if (body.blocked.down) this.jumpCount = 0

    if (this.combo > 0) {
      this.comboTimer -= delta
      if (this.comboTimer <= 0) {
        this.combo = 0
        this.comboText.setText('')
      }
    }

    if (this.textures.exists('huntress_run') && this.textures.exists('huntress')) {
      const moving = Math.abs(body.velocity.x) > 20
      const desired = moving ? 'huntress_run' : 'huntress'
      if (this.player.texture.key !== desired) {
        this.player.setTexture(desired)
        this.player.setDisplaySize(56, 56)
      }
    }

    // Reach goal flag to clear stage (or clear all enemies on boss)
    if (this.level < 5 && this.player.x >= this.levelGoalX) {
      this.onLevelClear()
      return
    }

    this.handleInput(time)
    this.updateEnemies(delta)
    this.maybeSpawnReinforcements(delta)
  }

  private maybeSpawnReinforcements(delta: number) {
    if (this.level >= 5) return
    this.spawnTimer += delta
    const interval = 3800 - this.level * 320
    if (this.spawnTimer > interval && this.enemies.countActive(true) < 10 + this.level) {
      this.spawnTimer = 0
      const camX = this.cameras.main.scrollX
      const side = Math.random() > 0.5 ? camX + 820 : Math.max(40, camX - 20)
      const y = Phaser.Math.Between(80, 480)
      if (Math.random() > 0.45) {
        this.spawnEnemy('flyer', side, y, 2 + Math.floor(this.level / 2), 42 + this.level * 5)
      } else {
        this.spawnEnemy('soldier', side, 520, 2 + Math.floor(this.level / 2), 52 + this.level * 8, 'walker')
      }
    }
  }

  private handleInput(time: number) {
    const speed = 290
    let left = this.cursors.left.isDown || this.wasd.left.isDown || this.touch.left
    let right = this.cursors.right.isDown || this.wasd.right.isDown || this.touch.right
    let shoot = this.spaceKey.isDown || this.touch.shoot
    this.aimUp = this.touch.up
    this.aimDown = this.wasd.down.isDown || this.cursors.down.isDown || this.touch.down

    const pad = this.input.gamepad?.getPad(0)
    if (pad) {
      if (pad.left || (pad.axes[0] && pad.axes[0].getValue() < -0.3)) left = true
      if (pad.right || (pad.axes[0] && pad.axes[0].getValue() > 0.3)) right = true
      if (pad.X || pad.buttons[2]?.pressed || pad.buttons[7]?.pressed) shoot = true
      if (pad.up || (pad.axes[1] && pad.axes[1].getValue() < -0.3)) this.aimUp = true
      if (pad.down || (pad.axes[1] && pad.axes[1].getValue() > 0.3)) this.aimDown = true
    }

    if (left) {
      this.player.setVelocityX(-speed)
      this.facingRight = false
      this.player.setFlipX(true)
    } else if (right) {
      this.player.setVelocityX(speed)
      this.facingRight = true
      this.player.setFlipX(false)
    }

    if (shoot && time > this.lastFired) {
      this.fire()
      const rate = this.weapon === 'rapid' ? 50 : this.fireRate
      this.lastFired = time + rate
    }
  }

  private fire() {
    const dir = this.facingRight ? 1 : -1
    let angle = 0
    const movingH = this.touch.left || this.touch.right || this.cursors.left.isDown || this.cursors.right.isDown || this.wasd.left.isDown || this.wasd.right.isDown
    if (this.aimUp && !this.aimDown) angle = movingH ? -35 : -90
    else if (this.aimDown) angle = 35

    const baseX = this.player.x + dir * 20
    const baseY = this.player.y - 2

    const spawn = (ang: number, tex = 'bullet', spd = 680) => {
      const b = this.bullets.get(baseX, baseY, tex) as Phaser.Physics.Arcade.Image
      if (!b) return
      b.setActive(true).setVisible(true)
      b.body?.reset(baseX, baseY)
      const rad = Phaser.Math.DegToRad(ang)
      const vx = ang === -90 ? 0 : Math.cos(rad) * dir * spd
      const vy = Math.sin(rad) * spd
      b.setVelocity(vx, vy)
      this.time.delayedCall(1000, () => { if (b.active) b.setActive(false).setVisible(false) })
    }

    if (this.weapon === 'spread') {
      spawn(angle - 18); spawn(angle); spawn(angle + 18)
    } else if (this.weapon === 'laser') {
      spawn(angle, 'laser', 900)
    } else if (this.weapon === 'fire') {
      spawn(angle, 'fireball', 520)
      spawn(angle - 12, 'fireball', 500)
      spawn(angle + 12, 'fireball', 500)
    } else {
      spawn(angle)
    }
  }

  private updateEnemies(delta: number) {
    this.enemies.getChildren().forEach((child) => {
      const enemy = child as Phaser.Physics.Arcade.Sprite
      if (!enemy.active) return
      const type = enemy.getData('type') as string
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
        const dy = this.player.y - enemy.y - 45
        enemy.setVelocityX(Phaser.Math.Clamp(dx * 0.5, -speed, speed))
        enemy.setVelocityY(Phaser.Math.Clamp(dy * 0.3, -speed * 0.5, speed * 0.5))
        enemy.setFlipX(dx < 0)
      }

      if (type === 'boss') {
        const hp = enemy.getData('hp') as number
        const maxHp = enemy.getData('maxHp') as number
        if (hp / maxHp < 0.5 && this.bossPhase === 1) {
          this.bossPhase = 2
          this.popup(enemy.x, enemy.y - 50, 'PHASE 2', '#f43f5e')
          this.cameras.main.shake(200, 0.02)
        }
        const spd = this.bossPhase === 2 ? speed * 1.4 : speed
        const dx = this.player.x - enemy.x
        enemy.setVelocityX(Phaser.Math.Clamp(dx * 0.45, -spd, spd))
        enemy.setVelocityY(Math.sin(this.time.now / (this.bossPhase === 2 ? 200 : 300)) * (this.bossPhase === 2 ? 65 : 42))
        enemy.setFlipX(dx < 0)
      }

      if (type === 'tank' || type === 'flyer' || type === 'boss') {
        let timer = enemy.getData('shootTimer') as number
        timer -= delta
        if (timer <= 0) {
          const count = type === 'boss' ? (this.bossPhase === 2 ? 8 : 5) : 1
          this.enemyFire(enemy, count)
          const base = type === 'boss' ? (this.bossPhase === 2 ? 520 : 720) : type === 'tank' ? 1250 : 1000
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
      b.body?.reset(enemy.x, enemy.y)
      const spread = (i - (count - 1) / 2) * 0.18
      const ang = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y) + spread
      const spd = count > 1 ? 210 : 250
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

    const dmg = this.weapon === 'laser' || this.weapon === 'fire' ? 2 : 1
    let hp = (enemy.getData('hp') as number) - dmg
    enemy.setData('hp', hp)

    enemy.setTint(0xffffff)
    this.time.delayedCall(45, () => { if (enemy.active) enemy.clearTint() })
    this.cameras.main.shake(16, 0.003)
    this.particles.emitParticleAt(enemy.x, enemy.y, 3)

    if (hp <= 0) {
      const type = enemy.getData('type') as string
      let pts = type === 'boss' ? 3500 : type === 'tank' ? 400 : type === 'flyer' ? 200 : 100

      this.combo++
      this.comboTimer = 2200
      if (this.combo > 1) {
        pts = Math.floor(pts * (1 + Math.min(this.combo, 12) * 0.1))
        this.comboText.setText('COMBO x' + this.combo)
      }

      this.score += pts
      this.scoreText.setText('SCORE  ' + this.score)
      this.popup(enemy.x, enemy.y - 18, '+' + pts)
      this.particles.emitParticleAt(enemy.x, enemy.y, 24)
      this.cameras.main.shake(65, 0.012)

      if (type === 'tank' || type === 'boss') {
        this.cameras.main.flash(80, 180, 80, 255, false)
      }

      if (Math.random() < 0.28 && type !== 'boss') {
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
    this.cameras.main.shake(120, 0.014)
    this.cameras.main.flash(80, 255, 20, 50, false)
    this.player.setVelocityY(-250)

    this.time.delayedCall(750, () => {
      this.invulnerable = false
      if (this.player.active) this.player.clearTint()
    })

    if (this.health <= 0) {
      this.lives -= 1
      this.livesText.setText('LIVES  ' + this.lives)
      if (this.lives <= 0) {
        this.triggerGameOver()
      } else {
        this.health = 4
        this.updateHealth()
        this.player.setPosition(Math.max(80, this.cameras.main.scrollX + 80), 480)
        this.player.setVelocity(0, 0)
        this.jumpCount = 0
        this.invulnerable = true
        this.time.delayedCall(1400, () => { this.invulnerable = false; this.player.clearTint() })
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
    this.particles.emitParticleAt(pow.x, pow.y, 14)
    this.popup(pow.x, pow.y, kind.toUpperCase(), '#4ade80')

    if (kind === 'health') {
      this.health = Math.min(this.maxHealth, this.health + 1)
      this.updateHealth()
    } else {
      this.weapon = kind as typeof this.weapon
      const labels: Record<string, string> = {
        spread: 'SPREAD', rapid: 'RAPID', laser: 'LASER', fire: 'FIRE'
      }
      this.weaponText.setText('GUN  ' + (labels[kind] || 'NORMAL'))
      this.fireRate = kind === 'rapid' ? 50 : kind === 'laser' ? 100 : 130
    }
  }

  private updateHealth() {
    const h = '\u2665'.repeat(Math.max(0, this.health)) + '\u2661'.repeat(Math.max(0, this.maxHealth - this.health))
    this.healthText.setText('HP  ' + h)
  }

  private onLevelClear() {
    if (this.levelTransition) return
    this.levelTransition = true
    const names = ['', 'NEON STREETS', 'INDUSTRIAL RISE', 'SKY RAIL', 'CORE ACCESS', 'APEX THRONE']

    if (this.level < 5) {
      const next = this.level + 1
      const msg = this.add.text(400, 260, `LEVEL ${next}\n${names[next]}`, {
        fontFamily: 'monospace', fontSize: '22px', color: '#22d3ee', align: 'center'
      }).setOrigin(0.5).setScrollFactor(0).setDepth(200)

      this.time.delayedCall(1400, () => {
        msg.destroy()
        this.level = next
        this.levelText.setText('LEVEL  ' + next)
        this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H)
        this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H)
        this.player.setPosition(80, 480)
        this.player.setVelocity(0, 0)
        this.jumpCount = 0
        this.health = Math.min(this.maxHealth, this.health + 1)
        this.updateHealth()
        this.buildLevel(next)
        this.levelTransition = false
        this.showBanner('LEVEL ' + next, names[next])
      })
    } else {
      this.showVictory()
    }
  }

  private triggerGameOver() {
    this.gameOver = true
    this.player.setTint(0x333333)
    this.player.setVelocity(0, 0)
    this.add.rectangle(400, 300, 800, 600, 0x0a0612, 0.85).setScrollFactor(0).setDepth(200)
    this.add.text(400, 210, 'MISSION FAILED', { fontFamily: 'monospace', fontSize: '28px', color: '#f43f5e' }).setOrigin(0.5).setScrollFactor(0).setDepth(201)
    this.add.text(400, 270, 'Score: ' + this.score, { fontFamily: 'monospace', fontSize: '18px', color: '#e879f9' }).setOrigin(0.5).setScrollFactor(0).setDepth(201)
    this.add.text(400, 310, 'Reached Level ' + this.level, { fontFamily: 'monospace', fontSize: '13px', color: '#a1a1aa' }).setOrigin(0.5).setScrollFactor(0).setDepth(201)
    const btn = this.add.text(400, 370, '[ CLICK / TAP TO RESTART ]', {
      fontFamily: 'monospace', fontSize: '14px', color: '#c4b5fd'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(201).setInteractive({ useHandCursor: true })
    btn.on('pointerdown', () => this.scene.restart())
  }

  private showVictory() {
    this.gameOver = true
    this.player.setVelocity(0, 0)
    this.add.rectangle(400, 300, 800, 600, 0x0a0612, 0.85).setScrollFactor(0).setDepth(200)
    this.add.text(400, 180, 'SECTOR DOMINATED', { fontFamily: 'monospace', fontSize: '26px', color: '#22d3ee' }).setOrigin(0.5).setScrollFactor(0).setDepth(201)
    this.add.text(400, 240, 'Final Score: ' + this.score, { fontFamily: 'monospace', fontSize: '18px', color: '#e879f9' }).setOrigin(0.5).setScrollFactor(0).setDepth(201)
    this.add.text(400, 290, 'The Huntress claims the Apex.', {
      fontFamily: 'monospace', fontSize: '13px', color: '#a1a1aa'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(201)
    const btn = this.add.text(400, 360, '[ CLICK / TAP TO PLAY AGAIN ]', {
      fontFamily: 'monospace', fontSize: '14px', color: '#c4b5fd'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(201).setInteractive({ useHandCursor: true })
    btn.on('pointerdown', () => this.scene.restart())
  }
}
