import Phaser from 'phaser'

interface TouchState {
  left: boolean
  right: boolean
  jump: boolean
  shoot: boolean
}

interface EnemyData {
  hp: number
  speed: number
  type: 'walker' | 'flyer' | 'tank' | 'boss'
}

export class MainScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd!: { up: Phaser.Input.Keyboard.Key; down: Phaser.Input.Keyboard.Key; left: Phaser.Input.Keyboard.Key; right: Phaser.Input.Keyboard.Key }
  private spaceKey!: Phaser.Input.Keyboard.Key
  private bullets!: Phaser.Physics.Arcade.Group
  private enemyBullets!: Phaser.Physics.Arcade.Group
  private enemies!: Phaser.Physics.Arcade.Group
  private platforms!: Phaser.Physics.Arcade.StaticGroup
  private powerups!: Phaser.Physics.Arcade.Group
  private lastFired = 0
  private fireRate = 160
  private health = 4
  private maxHealth = 5
  private score = 0
  private level = 1
  private healthText!: Phaser.GameObjects.Text
  private scoreText!: Phaser.GameObjects.Text
  private levelText!: Phaser.GameObjects.Text
  private weaponText!: Phaser.GameObjects.Text
  private gameOver = false
  private levelTransition = false
  private invulnerable = false
  private facingRight = true
  private touch: TouchState = { left: false, right: false, jump: false, shoot: false }
  private weapon: 'normal' | 'spread' | 'rapid' | 'laser' = 'normal'
  private weaponTimer = 0
  private particles!: Phaser.GameObjects.Particles.ParticleEmitter
  private bgLayers: Phaser.GameObjects.Rectangle[] = []

  constructor() {
    super({ key: 'MainScene' })
  }

  create() {
    this.gameOver = false
    this.levelTransition = false
    this.health = 4
    this.score = 0
    this.level = 1
    this.invulnerable = false
    this.facingRight = true
    this.weapon = 'normal'
    this.fireRate = 160
    this.touch = { left: false, right: false, jump: false, shoot: false }

    this.cameras.main.setBackgroundColor('#05050c')
    this.createTextures()
    this.createBackground()

    this.physics.world.setBounds(0, 0, 800, 600)

    this.platforms = this.physics.add.staticGroup()
    this.bullets = this.physics.add.group({ classType: Phaser.Physics.Arcade.Image, maxSize: 60 })
    this.enemyBullets = this.physics.add.group({ classType: Phaser.Physics.Arcade.Image, maxSize: 40 })
    this.enemies = this.physics.add.group()
    this.powerups = this.physics.add.group()

    this.buildLevel(1)

    this.player = this.physics.add.sprite(70, 480, 'player')
    this.player.setCollideWorldBounds(true)
    this.player.setBounce(0.04)
    this.player.setDepth(20)
    this.player.setDragX(1400)
    this.player.setMaxVelocity(320, 900)

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

    this.particles = this.add.particles(0, 0, 'spark', {
      speed: { min: 50, max: 180 },
      scale: { start: 0.7, end: 0 },
      lifespan: 380,
      blendMode: 'ADD',
      emitting: false,
    })

    this.createHUD()
    this.createTouchControls()
    this.showLevelBanner(1, 'NEON STREETS')
  }

  private createBackground() {
    this.bgLayers = []
    // Deep background gradient bars for cyber feel
    const colors = [0x0a0a18, 0x0d0d22, 0x12122e, 0x0f0f28]
    for (let i = 0; i < 4; i++) {
      const r = this.add.rectangle(400, 80 + i * 140, 800, 160, colors[i], 0.35).setDepth(0)
      this.bgLayers.push(r)
    }
    // Subtle grid lines
    for (let x = 0; x < 800; x += 40) {
      this.add.rectangle(x, 300, 1, 600, 0x7c3aed, 0.04).setDepth(1)
    }
  }

  private createTextures() {
    // === PLAYER - Cyber Huntress ===
    const p = this.make.graphics({ x: 0, y: 0 })
    // boots
    p.fillStyle(0x0891b2, 1)
    p.fillRect(8, 40, 7, 8)
    p.fillRect(17, 40, 7, 8)
    // legs
    p.fillStyle(0x22d3ee, 1)
    p.fillRect(9, 28, 6, 14)
    p.fillRect(17, 28, 6, 14)
    // body armor
    p.fillStyle(0x06b6d4, 1)
    p.fillRoundedRect(6, 12, 20, 18, 3)
    // chest glow
    p.fillStyle(0xf0abfc, 0.9)
    p.fillRect(12, 16, 8, 6)
    // head / helmet
    p.fillStyle(0x22d3ee, 1)
    p.fillCircle(16, 8, 8)
    p.fillStyle(0xa5f3fc, 1)
    p.fillRect(10, 5, 12, 4)
    // visor
    p.fillStyle(0xf0abfc, 1)
    p.fillRect(11, 7, 10, 3)
    // arms / weapon mounts
    p.fillStyle(0x67e8f9, 1)
    p.fillRect(0, 16, 7, 7)
    p.fillRect(25, 16, 7, 7)
    p.generateTexture('player', 32, 48)
    p.destroy()

    // === PLATFORM ===
    const plat = this.make.graphics({ x: 0, y: 0 })
    plat.fillStyle(0x1e1b4b, 1)
    plat.fillRect(0, 2, 32, 12)
    plat.fillStyle(0x7c3aed, 1)
    plat.fillRect(0, 0, 32, 3)
    plat.fillStyle(0xa78bfa, 0.5)
    plat.fillRect(0, 0, 32, 1)
    plat.fillStyle(0x4c1d95, 0.7)
    plat.fillRect(0, 12, 32, 2)
    plat.generateTexture('platform', 32, 14)
    plat.destroy()

    // === BULLETS ===
    const b = this.make.graphics({ x: 0, y: 0 })
    b.fillStyle(0xf0abfc, 1)
    b.fillRect(0, 1, 16, 4)
    b.fillStyle(0xffffff, 1)
    b.fillRect(2, 2, 12, 2)
    b.generateTexture('bullet', 16, 6)
    b.destroy()

    const laser = this.make.graphics({ x: 0, y: 0 })
    laser.fillStyle(0x22d3ee, 1)
    laser.fillRect(0, 0, 22, 3)
    laser.fillStyle(0xffffff, 0.9)
    laser.fillRect(0, 1, 22, 1)
    laser.generateTexture('laser', 22, 3)
    laser.destroy()

    const eb = this.make.graphics({ x: 0, y: 0 })
    eb.fillStyle(0xf87171, 1)
    eb.fillRect(0, 0, 11, 5)
    eb.fillStyle(0xfef2f2, 0.8)
    eb.fillRect(1, 1, 8, 3)
    eb.generateTexture('enemyBullet', 11, 5)
    eb.destroy()

    // === ENEMIES ===
    // Walker
    const e = this.make.graphics({ x: 0, y: 0 })
    e.fillStyle(0xe11d48, 1)
    e.fillRoundedRect(3, 6, 26, 26, 4)
    e.fillStyle(0x9f1239, 1)
    e.fillRect(8, 12, 16, 12)
    e.fillStyle(0xfbbf24, 1)
    e.fillCircle(12, 16, 3)
    e.fillCircle(20, 16, 3)
    e.fillStyle(0xfb7185, 1)
    e.fillRect(0, 14, 5, 8)
    e.fillRect(27, 14, 5, 8)
    e.generateTexture('enemy', 32, 36)
    e.destroy()

    // Flyer
    const f = this.make.graphics({ x: 0, y: 0 })
    f.fillStyle(0xa855f7, 1)
    f.fillCircle(16, 16, 11)
    f.fillStyle(0xd946ef, 1)
    f.fillTriangle(2, 16, 16, 2, 16, 30)
    f.fillTriangle(30, 16, 16, 2, 16, 30)
    f.fillStyle(0xf5d0fe, 1)
    f.fillCircle(16, 16, 5)
    f.fillStyle(0x4c1d95, 1)
    f.fillCircle(16, 16, 2)
    f.generateTexture('flyer', 32, 32)
    f.destroy()

    // Tank
    const t = this.make.graphics({ x: 0, y: 0 })
    t.fillStyle(0xea580c, 1)
    t.fillRoundedRect(0, 10, 44, 28, 5)
    t.fillStyle(0xc2410c, 1)
    t.fillRect(8, 2, 28, 14)
    t.fillStyle(0xfef08a, 1)
    t.fillRect(14, 5, 16, 7)
    t.fillStyle(0x9a3412, 1)
    t.fillRect(4, 32, 10, 6)
    t.fillRect(30, 32, 10, 6)
    t.generateTexture('tank', 44, 40)
    t.destroy()

    // Boss
    const boss = this.make.graphics({ x: 0, y: 0 })
    boss.fillStyle(0x7f1d1d, 1)
    boss.fillRoundedRect(4, 10, 56, 44, 6)
    boss.fillStyle(0xdc2626, 1)
    boss.fillRect(12, 0, 40, 18)
    boss.fillStyle(0xfef08a, 1)
    boss.fillCircle(24, 10, 5)
    boss.fillCircle(40, 10, 5)
    boss.fillStyle(0xf43f5e, 1)
    boss.fillRect(0, 24, 10, 14)
    boss.fillRect(54, 24, 10, 14)
    boss.fillStyle(0x450a0a, 1)
    boss.fillRect(18, 48, 12, 8)
    boss.fillRect(34, 48, 12, 8)
    boss.generateTexture('boss', 64, 58)
    boss.destroy()

    // Powerups
    const pows = [
      { key: 'pow_health', c: 0x4ade80 },
      { key: 'pow_spread', c: 0x22d3ee },
      { key: 'pow_rapid', c: 0xfbbf24 },
      { key: 'pow_laser', c: 0xe879f9 },
    ]
    pows.forEach(({ key, c }) => {
      const g = this.make.graphics({ x: 0, y: 0 })
      g.fillStyle(c, 1)
      g.fillCircle(12, 12, 11)
      g.fillStyle(0xffffff, 0.9)
      g.fillCircle(12, 12, 5)
      g.generateTexture(key, 24, 24)
      g.destroy()
    })

    const s = this.make.graphics({ x: 0, y: 0 })
    s.fillStyle(0xffffff, 1)
    s.fillCircle(4, 4, 4)
    s.generateTexture('spark', 8, 8)
    s.destroy()
  }

  private buildLevel(lvl: number) {
    this.platforms.clear(true, true)
    this.enemies.clear(true, true)
    this.powerups.clear(true, true)
    this.bullets.clear(true, true)
    this.enemyBullets.clear(true, true)

    // Ground always
    this.platforms.create(400, 588, 'platform').setScale(28, 1.5).refreshBody()

    if (lvl === 1) {
      // Neon Streets - tutorial-ish
      this.addPlatforms([
        [160, 470, 4.2], [480, 410, 5], [120, 310, 3.5], [600, 280, 4],
        [360, 190, 3.2], [700, 470, 3], [280, 360, 2.5]
      ])
      this.spawnEnemy('enemy', 240, 420, { hp: 2, speed: 50, type: 'walker' })
      this.spawnEnemy('enemy', 450, 360, { hp: 2, speed: 60, type: 'walker' })
      this.spawnEnemy('enemy', 140, 260, { hp: 2, speed: 45, type: 'walker' })
      this.spawnEnemy('flyer', 420, 90, { hp: 2, speed: 35, type: 'flyer' })
      this.spawnEnemy('enemy', 680, 520, { hp: 2, speed: 40, type: 'walker' })
      this.spawnPowerup(500, 370, 'health')
      this.spawnPowerup(200, 270, 'spread')
    } else if (lvl === 2) {
      // Industrial Rise
      this.addPlatforms([
        [100, 490, 3], [280, 430, 3.2], [480, 370, 3.5], [680, 310, 3],
        [180, 300, 2.8], [400, 240, 3.5], [620, 180, 3], [300, 140, 2.5], [100, 200, 2.5]
      ])
      this.spawnEnemy('enemy', 130, 440, { hp: 3, speed: 65, type: 'walker' })
      this.spawnEnemy('enemy', 460, 320, { hp: 3, speed: 70, type: 'walker' })
      this.spawnEnemy('tank', 300, 520, { hp: 5, speed: 28, type: 'tank' })
      this.spawnEnemy('flyer', 350, 100, { hp: 3, speed: 45, type: 'flyer' })
      this.spawnEnemy('flyer', 600, 130, { hp: 3, speed: 50, type: 'flyer' })
      this.spawnEnemy('enemy', 650, 260, { hp: 3, speed: 55, type: 'walker' })
      this.spawnPowerup(280, 390, 'rapid')
      this.spawnPowerup(400, 200, 'health')
    } else if (lvl === 3) {
      // Sky Rail
      this.addPlatforms([
        [80, 500, 2.8], [220, 440, 2.5], [380, 380, 3], [560, 320, 2.8],
        [700, 260, 2.5], [150, 280, 2.5], [400, 200, 3.2], [620, 140, 2.8],
        [300, 100, 2.5], [500, 480, 2.5]
      ])
      this.spawnEnemy('flyer', 200, 80, { hp: 3, speed: 55, type: 'flyer' })
      this.spawnEnemy('flyer', 450, 60, { hp: 3, speed: 60, type: 'flyer' })
      this.spawnEnemy('flyer', 650, 100, { hp: 3, speed: 50, type: 'flyer' })
      this.spawnEnemy('tank', 380, 520, { hp: 6, speed: 30, type: 'tank' })
      this.spawnEnemy('enemy', 100, 450, { hp: 3, speed: 75, type: 'walker' })
      this.spawnEnemy('enemy', 550, 270, { hp: 3, speed: 70, type: 'walker' })
      this.spawnEnemy('enemy', 700, 210, { hp: 3, speed: 65, type: 'walker' })
      this.spawnPowerup(380, 340, 'laser')
      this.spawnPowerup(150, 240, 'health')
      this.spawnPowerup(620, 100, 'spread')
    } else if (lvl === 4) {
      // Core Access
      this.addPlatforms([
        [120, 510, 3], [320, 450, 3], [520, 390, 3.2], [700, 330, 2.8],
        [200, 330, 2.5], [420, 270, 3], [600, 210, 2.8], [100, 210, 2.5],
        [300, 150, 2.8], [500, 100, 3], [700, 480, 2.5]
      ])
      this.spawnEnemy('tank', 200, 520, { hp: 7, speed: 32, type: 'tank' })
      this.spawnEnemy('tank', 550, 520, { hp: 7, speed: 30, type: 'tank' })
      this.spawnEnemy('flyer', 250, 70, { hp: 4, speed: 65, type: 'flyer' })
      this.spawnEnemy('flyer', 500, 50, { hp: 4, speed: 70, type: 'flyer' })
      this.spawnEnemy('flyer', 700, 90, { hp: 4, speed: 60, type: 'flyer' })
      this.spawnEnemy('enemy', 140, 460, { hp: 4, speed: 80, type: 'walker' })
      this.spawnEnemy('enemy', 420, 220, { hp: 4, speed: 75, type: 'walker' })
      this.spawnEnemy('enemy', 620, 160, { hp: 4, speed: 70, type: 'walker' })
      this.spawnPowerup(320, 410, 'rapid')
      this.spawnPowerup(420, 230, 'health')
      this.spawnPowerup(500, 60, 'laser')
    } else {
      // Level 5 - Boss Arena
      this.addPlatforms([
        [150, 480, 3.5], [400, 400, 4], [650, 480, 3.5],
        [250, 300, 3], [550, 300, 3], [400, 200, 3.5]
      ])
      this.spawnEnemy('boss', 400, 120, { hp: 28, speed: 40, type: 'boss' })
      this.spawnEnemy('flyer', 150, 80, { hp: 3, speed: 50, type: 'flyer' })
      this.spawnEnemy('flyer', 650, 80, { hp: 3, speed: 50, type: 'flyer' })
      this.spawnPowerup(250, 260, 'health')
      this.spawnPowerup(550, 260, 'laser')
      this.spawnPowerup(400, 360, 'rapid')
    }
  }

  private addPlatforms(list: number[][]) {
    list.forEach(([x, y, scaleX]) => {
      this.platforms.create(x, y, 'platform').setScale(scaleX, 0.85).refreshBody()
    })
  }

  private spawnEnemy(key: string, x: number, y: number, data: EnemyData) {
    const enemy = this.enemies.create(x, y, key) as Phaser.Physics.Arcade.Sprite
    enemy.setBounce(0.03)
    enemy.setCollideWorldBounds(true)
    enemy.setData('hp', data.hp)
    enemy.setData('maxHp', data.hp)
    enemy.setData('speed', data.speed)
    enemy.setData('type', data.type)
    enemy.setData('dir', Math.random() > 0.5 ? 1 : -1)
    enemy.setData('shootTimer', Phaser.Math.Between(400, 1200))
    enemy.setDepth(15)

    if (data.type === 'flyer' || data.type === 'boss') {
      enemy.setVelocity(data.speed * (Math.random() > 0.5 ? 1 : -1), data.type === 'boss' ? 20 : data.speed * 0.35)
      ;(enemy.body as Phaser.Physics.Arcade.Body).setAllowGravity(false)
    } else {
      enemy.setVelocityX(data.speed * (enemy.getData('dir') as number))
    }
  }

  private spawnPowerup(x: number, y: number, kind: 'health' | 'spread' | 'rapid' | 'laser') {
    const map: Record<string, string> = {
      health: 'pow_health', spread: 'pow_spread', rapid: 'pow_rapid', laser: 'pow_laser'
    }
    const p = this.powerups.create(x, y, map[kind]) as Phaser.Physics.Arcade.Sprite
    p.setData('kind', kind)
    p.setBounce(0.5)
    p.setVelocityY(-100)
    p.setDepth(12)
  }

  private createHUD() {
    this.scoreText = this.add.text(14, 8, 'SCORE  0', { fontFamily: 'monospace', fontSize: '15px', color: '#e879f9' }).setScrollFactor(0).setDepth(100)
    this.healthText = this.add.text(14, 28, 'HEALTH  \u2665\u2665\u2665\u2665', { fontFamily: 'monospace', fontSize: '14px', color: '#f472b6' }).setScrollFactor(0).setDepth(100)
    this.levelText = this.add.text(14, 48, 'LEVEL  1', { fontFamily: 'monospace', fontSize: '12px', color: '#a1a1aa' }).setScrollFactor(0).setDepth(100)
    this.weaponText = this.add.text(14, 66, 'WEAPON  NORMAL', { fontFamily: 'monospace', fontSize: '12px', color: '#67e8f9' }).setScrollFactor(0).setDepth(100)
    this.add.text(786, 8, 'APEX STRIKE', { fontFamily: 'monospace', fontSize: '12px', color: '#52525b' }).setOrigin(1, 0).setScrollFactor(0).setDepth(100)
  }

  private createTouchControls() {
    const makeBtn = (x: number, y: number, w: number, h: number, label: string, key: keyof TouchState) => {
      const bg = this.add.rectangle(x, y, w, h, 0x000000, 0.4).setScrollFactor(0).setDepth(150).setInteractive()
      this.add.text(x, y, label, { fontFamily: 'monospace', fontSize: '13px', color: '#e4e4e7' }).setOrigin(0.5).setScrollFactor(0).setDepth(151)
      bg.on('pointerdown', () => { this.touch[key] = true; bg.setFillStyle(0xd946ef, 0.5) })
      bg.on('pointerup', () => { this.touch[key] = false; bg.setFillStyle(0x000000, 0.4) })
      bg.on('pointerout', () => { this.touch[key] = false; bg.setFillStyle(0x000000, 0.4) })
      this.input.addPointer(3)
    }
    makeBtn(55, 525, 68, 52, '\u25C0', 'left')
    makeBtn(135, 525, 68, 52, '\u25B6', 'right')
    makeBtn(95, 458, 88, 48, 'JUMP', 'jump')
    makeBtn(725, 505, 88, 66, 'FIRE', 'shoot')
  }

  private showLevelBanner(num: number, name: string) {
    const banner = this.add.text(400, 260, `LEVEL ${num}\n${name}`, {
      fontFamily: 'monospace', fontSize: '26px', color: '#22d3ee', align: 'center'
    }).setOrigin(0.5).setDepth(200).setAlpha(0)

    this.tweens.add({
      targets: banner,
      alpha: 1,
      duration: 400,
      yoyo: true,
      hold: 900,
      onComplete: () => banner.destroy()
    })
  }

  update(time: number, delta: number) {
    if (this.gameOver || this.levelTransition || !this.player?.active) return

    if (this.weapon !== 'normal' && time > this.weaponTimer) {
      this.weapon = 'normal'
      this.fireRate = 160
      this.weaponText.setText('WEAPON  NORMAL')
    }

    this.handlePlayerInput(time)
    this.updateEnemies(time, delta)
  }

  private handlePlayerInput(time: number) {
    const speed = 260
    const body = this.player.body as Phaser.Physics.Arcade.Body

    let left = this.cursors.left.isDown || this.wasd.left.isDown || this.touch.left
    let right = this.cursors.right.isDown || this.wasd.right.isDown || this.touch.right
    let jump = this.cursors.up.isDown || this.wasd.up.isDown || this.touch.jump
    let shoot = this.spaceKey.isDown || this.touch.shoot

    const pad = this.input.gamepad?.getPad(0)
    if (pad) {
      if (pad.left || (pad.axes.length > 0 && pad.axes[0].getValue() < -0.3)) left = true
      if (pad.right || (pad.axes.length > 0 && pad.axes[0].getValue() > 0.3)) right = true
      if (pad.A || pad.B || (pad.buttons[0]?.pressed)) jump = true
      if (pad.X || pad.Y || pad.buttons[2]?.pressed || pad.buttons[7]?.pressed) shoot = true
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

    if (jump && body.blocked.down) {
      this.player.setVelocityY(-500)
    }

    if (shoot && time > this.lastFired) {
      this.fireBullet()
      this.lastFired = time + this.fireRate
    }
  }

  private fireBullet() {
    const dir = this.facingRight ? 1 : -1
    const baseX = this.player.x + dir * 18
    const baseY = this.player.y - 2

    const spawn = (angleOffset = 0, tex = 'bullet', spd = 620) => {
      const bullet = this.bullets.get(baseX, baseY, tex) as Phaser.Physics.Arcade.Image
      if (!bullet) return
      bullet.setActive(true).setVisible(true)
      bullet.body?.reset(baseX, baseY)
      const rad = Phaser.Math.DegToRad(angleOffset)
      bullet.setVelocity(Math.cos(rad) * dir * spd, Math.sin(rad) * spd)
      this.time.delayedCall(1000, () => { if (bullet.active) bullet.setActive(false).setVisible(false) })
    }

    if (this.weapon === 'spread') {
      spawn(-14); spawn(0); spawn(14)
    } else if (this.weapon === 'laser') {
      spawn(0, 'laser', 780)
    } else {
      spawn(0)
    }
  }

  private updateEnemies(_time: number, delta: number) {
    this.enemies.getChildren().forEach((child) => {
      const enemy = child as Phaser.Physics.Arcade.Sprite
      if (!enemy.active) return

      const type = enemy.getData('type') as string
      const speed = enemy.getData('speed') as number
      const body = enemy.body as Phaser.Physics.Arcade.Body

      if (type === 'walker' || type === 'tank') {
        if (body.blocked.left || body.blocked.right) {
          const dir = -(enemy.getData('dir') as number)
          enemy.setData('dir', dir)
          enemy.setVelocityX(dir * speed)
        }
        if (type === 'walker' && body.blocked.down && Math.random() < 0.0015) {
          enemy.setVelocityY(-340)
        }
      }

      if (type === 'flyer') {
        const dx = this.player.x - enemy.x
        const dy = this.player.y - enemy.y - 50
        enemy.setVelocityX(Phaser.Math.Clamp(dx * 0.45, -speed, speed))
        enemy.setVelocityY(Phaser.Math.Clamp(dy * 0.28, -speed * 0.55, speed * 0.55))
      }

      if (type === 'boss') {
        const dx = this.player.x - enemy.x
        enemy.setVelocityX(Phaser.Math.Clamp(dx * 0.35, -speed, speed))
        // Vertical float
        enemy.setVelocityY(Math.sin(this.time.now / 400) * 30)
      }

      if (type === 'tank' || type === 'flyer' || type === 'boss') {
        let timer = enemy.getData('shootTimer') as number
        timer -= delta
        if (timer <= 0) {
          this.enemyShoot(enemy, type === 'boss' ? 3 : 1)
          const base = type === 'boss' ? 900 : type === 'tank' ? 1600 : 1300
          enemy.setData('shootTimer', base + Math.random() * 400)
        } else {
          enemy.setData('shootTimer', timer)
        }
      }
    })
  }

  private enemyShoot(enemy: Phaser.Physics.Arcade.Sprite, count = 1) {
    for (let i = 0; i < count; i++) {
      const bullet = this.enemyBullets.get(enemy.x, enemy.y, 'enemyBullet') as Phaser.Physics.Arcade.Image
      if (!bullet) continue
      bullet.setActive(true).setVisible(true)
      bullet.body?.reset(enemy.x, enemy.y)
      const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y) + (i - (count - 1) / 2) * 0.25
      const spd = count > 1 ? 200 : 240
      bullet.setVelocity(Math.cos(angle) * spd, Math.sin(angle) * spd)
      this.time.delayedCall(2200, () => { if (bullet.active) bullet.setActive(false).setVisible(false) })
    }
  }

  private hitEnemy(
    bulletObj: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    enemyObj: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile
  ) {
    const bullet = bulletObj as Phaser.Physics.Arcade.Image
    const enemy = enemyObj as Phaser.Physics.Arcade.Sprite
    bullet.setActive(false).setVisible(false)

    let hp = (enemy.getData('hp') as number) - (this.weapon === 'laser' ? 2 : 1)
    enemy.setData('hp', hp)

    enemy.setTint(0xffffff)
    this.time.delayedCall(50, () => { if (enemy.active) enemy.clearTint() })
    this.cameras.main.shake(30, 0.005)
    this.particles.emitParticleAt(enemy.x, enemy.y, 5)

    if (hp <= 0) {
      const type = enemy.getData('type') as string
      const points = type === 'boss' ? 1000 : type === 'tank' ? 300 : type === 'flyer' ? 175 : 100
      this.score += points
      this.scoreText.setText('SCORE  ' + this.score)
      this.particles.emitParticleAt(enemy.x, enemy.y, 18)
      this.cameras.main.shake(80, 0.01)
      enemy.destroy()

      if (this.enemies.countActive(true) === 0) {
        this.onLevelClear()
      }
    }
  }

  private hitPlayer(
    _p: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    _e: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile
  ) {
    this.damagePlayer(1)
  }

  private hitByEnemyBullet(
    _p: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    bulletObj: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile
  ) {
    const bullet = bulletObj as Phaser.Physics.Arcade.Image
    bullet.setActive(false).setVisible(false)
    this.damagePlayer(1)
  }

  private damagePlayer(amount: number) {
    if (this.invulnerable || this.gameOver || this.levelTransition) return

    this.health -= amount
    this.updateHealthDisplay()
    this.invulnerable = true
    this.player.setTint(0xff0040)
    this.cameras.main.shake(140, 0.014)
    this.cameras.main.flash(120, 255, 30, 60, false)
    this.player.setVelocityY(-240)

    this.time.delayedCall(850, () => {
      this.invulnerable = false
      if (this.player.active) this.player.clearTint()
    })

    if (this.health <= 0) this.triggerGameOver()
  }

  private collectPowerup(
    _p: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    powObj: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile
  ) {
    const pow = powObj as Phaser.Physics.Arcade.Sprite
    const kind = pow.getData('kind') as string
    pow.destroy()
    this.particles.emitParticleAt(pow.x, pow.y, 12)

    if (kind === 'health') {
      this.health = Math.min(this.maxHealth, this.health + 1)
      this.updateHealthDisplay()
    } else if (kind === 'spread') {
      this.weapon = 'spread'
      this.weaponTimer = this.time.now + 12000
      this.weaponText.setText('WEAPON  SPREAD')
      this.fireRate = 180
    } else if (kind === 'rapid') {
      this.weapon = 'rapid'
      this.weaponTimer = this.time.now + 11000
      this.weaponText.setText('WEAPON  RAPID')
      this.fireRate = 75
    } else if (kind === 'laser') {
      this.weapon = 'laser'
      this.weaponTimer = this.time.now + 10000
      this.weaponText.setText('WEAPON  LASER')
      this.fireRate = 140
    }
  }

  private updateHealthDisplay() {
    const hearts = '\u2665'.repeat(Math.max(0, this.health)) + '\u2661'.repeat(Math.max(0, this.maxHealth - this.health))
    this.healthText.setText('HEALTH  ' + hearts)
  }

  private onLevelClear() {
    if (this.levelTransition) return
    this.levelTransition = true

    if (this.level < 5) {
      const next = this.level + 1
      const names = ['', 'NEON STREETS', 'INDUSTRIAL RISE', 'SKY RAIL', 'CORE ACCESS', 'APEX THRONE']

      const msg = this.add.text(400, 250, `LEVEL ${next}\n${names[next]}`, {
        fontFamily: 'monospace', fontSize: '24px', color: '#22d3ee', align: 'center'
      }).setOrigin(0.5).setDepth(200)

      this.time.delayedCall(1600, () => {
        msg.destroy()
        this.level = next
        this.levelText.setText('LEVEL  ' + next)
        this.player.setPosition(70, 480)
        this.player.setVelocity(0, 0)
        this.buildLevel(next)
        this.levelTransition = false
        this.showLevelBanner(next, names[next])
      })
    } else {
      this.showVictory()
    }
  }

  private triggerGameOver() {
    this.gameOver = true
    this.player.setTint(0x444444)
    this.player.setVelocity(0, 0)

    this.add.rectangle(400, 300, 800, 600, 0x000000, 0.75).setDepth(200)
    this.add.text(400, 220, 'MISSION FAILED', { fontFamily: 'monospace', fontSize: '32px', color: '#f43f5e' }).setOrigin(0.5).setDepth(201)
    this.add.text(400, 280, 'Score: ' + this.score, { fontFamily: 'monospace', fontSize: '20px', color: '#e879f9' }).setOrigin(0.5).setDepth(201)
    this.add.text(400, 320, 'Reached Level ' + this.level, { fontFamily: 'monospace', fontSize: '14px', color: '#a1a1aa' }).setOrigin(0.5).setDepth(201)

    const btn = this.add.text(400, 380, '[ TAP / CLICK TO RESTART ]', {
      fontFamily: 'monospace', fontSize: '15px', color: '#d4d4d8'
    }).setOrigin(0.5).setDepth(201).setInteractive({ useHandCursor: true })

    btn.on('pointerdown', () => this.scene.restart())
  }

  private showVictory() {
    this.gameOver = true
    this.player.setVelocity(0, 0)

    this.add.rectangle(400, 300, 800, 600, 0x000000, 0.72).setDepth(200)
    this.add.text(400, 190, 'SECTOR DOMINATED', { fontFamily: 'monospace', fontSize: '30px', color: '#22d3ee' }).setOrigin(0.5).setDepth(201)
    this.add.text(400, 250, 'Final Score: ' + this.score, { fontFamily: 'monospace', fontSize: '22px', color: '#e879f9' }).setOrigin(0.5).setDepth(201)
    this.add.text(400, 300, 'The Apex Huntress stands victorious.', {
      fontFamily: 'monospace', fontSize: '13px', color: '#a1a1aa'
    }).setOrigin(0.5).setDepth(201)

    const btn = this.add.text(400, 370, '[ TAP / CLICK TO PLAY AGAIN ]', {
      fontFamily: 'monospace', fontSize: '15px', color: '#d4d4d8'
    }).setOrigin(0.5).setDepth(201).setInteractive({ useHandCursor: true })

    btn.on('pointerdown', () => this.scene.restart())
  }
}