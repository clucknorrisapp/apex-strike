import Phaser from 'phaser'

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
  private fireRate = 140
  private health = 4
  private maxHealth = 5
  private score = 0
  private level = 1
  private lives = 3
  private healthText!: Phaser.GameObjects.Text
  private scoreText!: Phaser.GameObjects.Text
  private levelText!: Phaser.GameObjects.Text
  private weaponText!: Phaser.GameObjects.Text
  private livesText!: Phaser.GameObjects.Text
  private gameOver = false
  private levelTransition = false
  private invulnerable = false
  private facingRight = true
  private aimUp = false
  private aimDown = false
  private touch: TouchState = { left: false, right: false, jump: false, shoot: false, up: false, down: false }
  private weapon: 'normal' | 'spread' | 'rapid' | 'laser' | 'fire' = 'normal'
  private weaponTimer = 0
  private particles!: Phaser.GameObjects.Particles.ParticleEmitter

  constructor() {
    super({ key: 'MainScene' })
  }

  create() {
    this.gameOver = false
    this.levelTransition = false
    this.health = 4
    this.lives = 3
    this.score = 0
    this.level = 1
    this.invulnerable = false
    this.facingRight = true
    this.weapon = 'normal'
    this.fireRate = 140
    this.touch = { left: false, right: false, jump: false, shoot: false, up: false, down: false }

    this.cameras.main.setBackgroundColor('#04040a')
    this.createTextures()
    this.drawBackdrop()

    this.physics.world.setBounds(0, 0, 800, 600)

    this.platforms = this.physics.add.staticGroup()
    this.bullets = this.physics.add.group({ classType: Phaser.Physics.Arcade.Image, maxSize: 80 })
    this.enemyBullets = this.physics.add.group({ classType: Phaser.Physics.Arcade.Image, maxSize: 50 })
    this.enemies = this.physics.add.group()
    this.powerups = this.physics.add.group()

    this.buildLevel(1)

    this.player = this.physics.add.sprite(60, 480, 'player')
    this.player.setCollideWorldBounds(true)
    this.player.setBounce(0.02)
    this.player.setDepth(25)
    this.player.setDragX(1600)
    this.player.setMaxVelocity(340, 950)

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
      speed: { min: 60, max: 220 },
      scale: { start: 0.8, end: 0 },
      lifespan: 420,
      blendMode: 'ADD',
      emitting: false,
    })

    this.createHUD()
    this.createTouchControls()
    this.showBanner('LEVEL 1', 'NEON STREETS')
  }

  private drawBackdrop() {
    for (let i = 0; i < 6; i++) {
      this.add.rectangle(400, 50 + i * 100, 800, 100, 0x0a0a1a, 0.25 + i * 0.04).setDepth(0)
    }
    for (let x = 0; x < 820; x += 48) {
      this.add.rectangle(x, 300, 1, 600, 0x6d28d9, 0.035).setDepth(1)
    }
  }

  private createTextures() {
    // Player - sharper cyber huntress
    const p = this.make.graphics({ x: 0, y: 0 })
    p.fillStyle(0x0e7490, 1)
    p.fillRect(8, 40, 7, 8)
    p.fillRect(17, 40, 7, 8)
    p.fillStyle(0x22d3ee, 1)
    p.fillRect(9, 26, 6, 16)
    p.fillRect(17, 26, 6, 16)
    p.fillStyle(0x06b6d4, 1)
    p.fillRoundedRect(5, 10, 22, 18, 3)
    p.fillStyle(0xf0abfc, 1)
    p.fillRect(11, 14, 10, 5)
    p.fillStyle(0x22d3ee, 1)
    p.fillCircle(16, 7, 8)
    p.fillStyle(0xa5f3fc, 1)
    p.fillRect(9, 4, 14, 4)
    p.fillStyle(0xf0abfc, 1)
    p.fillRect(10, 6, 12, 3)
    p.fillStyle(0x67e8f9, 1)
    p.fillRect(0, 14, 6, 8)
    p.fillRect(26, 14, 6, 8)
    p.generateTexture('player', 32, 48)
    p.destroy()

    // Platform
    const plat = this.make.graphics({ x: 0, y: 0 })
    plat.fillStyle(0x1e1b4b, 1)
    plat.fillRect(0, 2, 32, 12)
    plat.fillStyle(0x7c3aed, 1)
    plat.fillRect(0, 0, 32, 3)
    plat.fillStyle(0xc4b5fd, 0.45)
    plat.fillRect(0, 0, 32, 1)
    plat.generateTexture('platform', 32, 14)
    plat.destroy()

    // Bullets
    const mkBullet = (key: string, color: number, w: number, h: number) => {
      const g = this.make.graphics({ x: 0, y: 0 })
      g.fillStyle(color, 1)
      g.fillRect(0, 0, w, h)
      g.fillStyle(0xffffff, 0.85)
      g.fillRect(1, 1, w - 2, Math.max(1, h - 2))
      g.generateTexture(key, w, h)
      g.destroy()
    }
    mkBullet('bullet', 0xf0abfc, 14, 5)
    mkBullet('laser', 0x22d3ee, 24, 3)
    mkBullet('fireball', 0xfb923c, 12, 12)
    mkBullet('enemyBullet', 0xf87171, 10, 5)

    // Walker
    const e = this.make.graphics({ x: 0, y: 0 })
    e.fillStyle(0xe11d48, 1)
    e.fillRoundedRect(2, 4, 28, 28, 3)
    e.fillStyle(0x9f1239, 1)
    e.fillRect(7, 10, 18, 14)
    e.fillStyle(0xfbbf24, 1)
    e.fillCircle(11, 15, 3)
    e.fillCircle(21, 15, 3)
    e.fillStyle(0xfb7185, 1)
    e.fillRect(0, 12, 4, 10)
    e.fillRect(28, 12, 4, 10)
    e.generateTexture('enemy', 32, 36)
    e.destroy()

    // Flyer
    const f = this.make.graphics({ x: 0, y: 0 })
    f.fillStyle(0xa855f7, 1)
    f.fillCircle(16, 16, 12)
    f.fillStyle(0xe879f9, 1)
    f.fillTriangle(0, 16, 16, 0, 16, 32)
    f.fillTriangle(32, 16, 16, 0, 16, 32)
    f.fillStyle(0xfae8ff, 1)
    f.fillCircle(16, 16, 5)
    f.generateTexture('flyer', 32, 32)
    f.destroy()

    // Tank
    const t = this.make.graphics({ x: 0, y: 0 })
    t.fillStyle(0xea580c, 1)
    t.fillRoundedRect(0, 10, 44, 28, 4)
    t.fillStyle(0xc2410c, 1)
    t.fillRect(8, 0, 28, 16)
    t.fillStyle(0xfef08a, 1)
    t.fillRect(14, 4, 16, 8)
    t.generateTexture('tank', 44, 40)
    t.destroy()

    // Boss
    const boss = this.make.graphics({ x: 0, y: 0 })
    boss.fillStyle(0x7f1d1d, 1)
    boss.fillRoundedRect(2, 12, 60, 44, 6)
    boss.fillStyle(0xdc2626, 1)
    boss.fillRect(10, 0, 44, 20)
    boss.fillStyle(0xfef08a, 1)
    boss.fillCircle(22, 10, 6)
    boss.fillCircle(42, 10, 6)
    boss.fillStyle(0xf43f5e, 1)
    boss.fillRect(0, 22, 10, 16)
    boss.fillRect(54, 22, 10, 16)
    boss.generateTexture('boss', 64, 58)
    boss.destroy()

    // Powerups
    ;[
      ['pow_health', 0x4ade80],
      ['pow_spread', 0x22d3ee],
      ['pow_rapid', 0xfbbf24],
      ['pow_laser', 0xe879f9],
      ['pow_fire', 0xfb923c],
    ].forEach(([key, c]) => {
      const g = this.make.graphics({ x: 0, y: 0 })
      g.fillStyle(c as number, 1)
      g.fillCircle(12, 12, 11)
      g.fillStyle(0xffffff, 0.9)
      g.fillCircle(12, 12, 5)
      g.generateTexture(key as string, 24, 24)
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

    this.platforms.create(400, 590, 'platform').setScale(28, 1.6).refreshBody()

    const plat = (x: number, y: number, sx: number) => {
      this.platforms.create(x, y, 'platform').setScale(sx, 0.85).refreshBody()
    }

    if (lvl === 1) {
      plat(150, 470, 4); plat(420, 400, 5); plat(100, 300, 3.5); plat(580, 270, 4.2)
      plat(350, 180, 3.2); plat(700, 460, 3); plat(250, 350, 2.5)
      this.waveWalkers([[220, 420, 2, 55], [400, 350, 2, 65], [120, 250, 2, 50], [650, 520, 2, 45], [500, 520, 2, 50]])
      this.spawnEnemy('flyer', 400, 80, 2, 40)
      this.spawnEnemy('flyer', 650, 140, 2, 45)
      this.spawnPowerup(480, 360, 'spread')
      this.spawnPowerup(180, 260, 'health')
    } else if (lvl === 2) {
      plat(90, 500, 3); plat(260, 440, 3); plat(450, 380, 3.5); plat(660, 320, 3)
      plat(160, 300, 2.8); plat(380, 240, 3.5); plat(600, 180, 3); plat(280, 130, 2.5)
      this.waveWalkers([[110, 450, 3, 70], [440, 330, 3, 75], [640, 270, 3, 65], [200, 520, 3, 60]])
      this.spawnEnemy('tank', 350, 520, 6, 28)
      this.spawnEnemy('flyer', 300, 70, 3, 50)
      this.spawnEnemy('flyer', 550, 90, 3, 55)
      this.spawnEnemy('flyer', 700, 50, 3, 45)
      this.spawnPowerup(260, 400, 'rapid')
      this.spawnPowerup(380, 200, 'health')
    } else if (lvl === 3) {
      plat(70, 510, 2.8); plat(210, 450, 2.6); plat(370, 390, 3); plat(540, 330, 2.8)
      plat(690, 270, 2.5); plat(140, 290, 2.5); plat(400, 210, 3.2); plat(620, 150, 2.8); plat(300, 100, 2.5)
      this.waveWalkers([[90, 460, 3, 80], [360, 340, 3, 75], [520, 280, 3, 70], [680, 520, 3, 65]])
      this.spawnEnemy('tank', 400, 520, 7, 30)
      this.spawnEnemy('flyer', 180, 60, 3, 60)
      this.spawnEnemy('flyer', 420, 40, 3, 65)
      this.spawnEnemy('flyer', 650, 80, 3, 55)
      this.spawnEnemy('flyer', 500, 120, 3, 50)
      this.spawnPowerup(370, 350, 'laser')
      this.spawnPowerup(140, 250, 'health')
      this.spawnPowerup(620, 110, 'fire')
    } else if (lvl === 4) {
      plat(100, 520, 3); plat(300, 460, 3); plat(500, 400, 3.2); plat(700, 340, 2.8)
      plat(180, 340, 2.5); plat(400, 280, 3); plat(600, 220, 2.8); plat(100, 220, 2.5)
      plat(300, 160, 2.8); plat(520, 110, 3)
      this.waveWalkers([[120, 470, 4, 85], [480, 350, 4, 80], [680, 290, 4, 75], [220, 520, 4, 70], [400, 520, 4, 70]])
      this.spawnEnemy('tank', 250, 520, 8, 32)
      this.spawnEnemy('tank', 600, 520, 8, 30)
      this.spawnEnemy('flyer', 200, 50, 4, 70)
      this.spawnEnemy('flyer', 450, 40, 4, 75)
      this.spawnEnemy('flyer', 700, 70, 4, 65)
      this.spawnPowerup(300, 420, 'rapid')
      this.spawnPowerup(400, 240, 'health')
      this.spawnPowerup(520, 70, 'laser')
    } else {
      // Boss arena
      plat(140, 490, 3.5); plat(400, 410, 4.5); plat(660, 490, 3.5)
      plat(240, 310, 3); plat(560, 310, 3); plat(400, 210, 3.5)
      this.spawnEnemy('boss', 400, 100, 32, 45)
      this.spawnEnemy('flyer', 120, 70, 3, 55)
      this.spawnEnemy('flyer', 680, 70, 3, 55)
      this.spawnEnemy('tank', 200, 520, 6, 25)
      this.spawnEnemy('tank', 600, 520, 6, 25)
      this.spawnPowerup(240, 270, 'health')
      this.spawnPowerup(560, 270, 'laser')
      this.spawnPowerup(400, 370, 'fire')
    }
  }

  private waveWalkers(list: number[][]) {
    list.forEach(([x, y, hp, spd]) => this.spawnEnemy('enemy', x, y, hp, spd, 'walker'))
  }

  private spawnEnemy(key: string, x: number, y: number, hp: number, speed: number, type?: string) {
    const enemy = this.enemies.create(x, y, key) as Phaser.Physics.Arcade.Sprite
    const t = type || (key === 'flyer' ? 'flyer' : key === 'tank' ? 'tank' : key === 'boss' ? 'boss' : 'walker')
    enemy.setBounce(0.02)
    enemy.setCollideWorldBounds(true)
    enemy.setData('hp', hp)
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
    const map: Record<string, string> = {
      health: 'pow_health', spread: 'pow_spread', rapid: 'pow_rapid',
      laser: 'pow_laser', fire: 'pow_fire'
    }
    const p = this.powerups.create(x, y, map[kind]) as Phaser.Physics.Arcade.Sprite
    p.setData('kind', kind)
    p.setBounce(0.55)
    p.setVelocityY(-110)
    p.setDepth(14)
  }

  private createHUD() {
    this.scoreText = this.add.text(12, 6, 'SCORE  0', { fontFamily: 'monospace', fontSize: '14px', color: '#e879f9' }).setScrollFactor(0).setDepth(100)
    this.healthText = this.add.text(12, 24, 'HP  \u2665\u2665\u2665\u2665', { fontFamily: 'monospace', fontSize: '13px', color: '#f472b6' }).setScrollFactor(0).setDepth(100)
    this.livesText = this.add.text(12, 42, 'LIVES  3', { fontFamily: 'monospace', fontSize: '12px', color: '#a1a1aa' }).setScrollFactor(0).setDepth(100)
    this.levelText = this.add.text(12, 58, 'LEVEL  1', { fontFamily: 'monospace', fontSize: '12px', color: '#71717a' }).setScrollFactor(0).setDepth(100)
    this.weaponText = this.add.text(12, 74, 'GUN  NORMAL', { fontFamily: 'monospace', fontSize: '12px', color: '#67e8f9' }).setScrollFactor(0).setDepth(100)
    this.add.text(788, 6, 'APEX STRIKE', { fontFamily: 'monospace', fontSize: '11px', color: '#3f3f46' }).setOrigin(1, 0).setScrollFactor(0).setDepth(100)
  }

  private createTouchControls() {
    const btn = (x: number, y: number, w: number, h: number, label: string, key: keyof TouchState) => {
      const bg = this.add.rectangle(x, y, w, h, 0x000000, 0.42).setScrollFactor(0).setDepth(150).setInteractive()
      this.add.text(x, y, label, { fontFamily: 'monospace', fontSize: '12px', color: '#e4e4e7' }).setOrigin(0.5).setScrollFactor(0).setDepth(151)
      bg.on('pointerdown', () => { this.touch[key] = true; bg.setFillStyle(0xd946ef, 0.55) })
      bg.on('pointerup', () => { this.touch[key] = false; bg.setFillStyle(0x000000, 0.42) })
      bg.on('pointerout', () => { this.touch[key] = false; bg.setFillStyle(0x000000, 0.42) })
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
    }).setOrigin(0.5).setDepth(200).setAlpha(0)
    this.tweens.add({ targets: t, alpha: 1, duration: 350, yoyo: true, hold: 800, onComplete: () => t.destroy() })
  }

  update(time: number, delta: number) {
    if (this.gameOver || this.levelTransition || !this.player?.active) return

    if (this.weapon !== 'normal' && time > this.weaponTimer) {
      this.weapon = 'normal'
      this.fireRate = 140
      this.weaponText.setText('GUN  NORMAL')
    }

    this.handleInput(time)
    this.updateEnemies(delta)
  }

  private handleInput(time: number) {
    const body = this.player.body as Phaser.Physics.Arcade.Body
    const speed = 270

    let left = this.cursors.left.isDown || this.wasd.left.isDown || this.touch.left
    let right = this.cursors.right.isDown || this.wasd.right.isDown || this.touch.right
    let jump = this.cursors.up.isDown || this.wasd.up.isDown || this.touch.jump
    let shoot = this.spaceKey.isDown || this.touch.shoot
    this.aimUp = this.wasd.up.isDown || this.touch.up
    this.aimDown = this.wasd.down.isDown || this.cursors.down.isDown || this.touch.down

    // When aiming up while grounded and not jumping intent from touch jump separately
    // Use W both for jump when grounded and aim when held with shoot - simplified: S = aim down, hold W while shooting aims up-diagonal

    const pad = this.input.gamepad?.getPad(0)
    if (pad) {
      if (pad.left || (pad.axes[0] && pad.axes[0].getValue() < -0.3)) left = true
      if (pad.right || (pad.axes[0] && pad.axes[0].getValue() > 0.3)) right = true
      if (pad.A || pad.buttons[0]?.pressed) jump = true
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

    if (jump && body.blocked.down) {
      this.player.setVelocityY(-510)
    }

    if (shoot && time > this.lastFired) {
      this.fire()
      this.lastFired = time + this.fireRate
    }
  }

  private fire() {
    const dir = this.facingRight ? 1 : -1
    let angle = 0 // degrees from horizontal

    if (this.aimUp && !this.aimDown) {
      angle = this.facingRight || this.touch.left || this.touch.right ? -40 : -90
      if (!this.touch.left && !this.touch.right && !this.cursors.left.isDown && !this.cursors.right.isDown && !this.wasd.left.isDown && !this.wasd.right.isDown) {
        angle = -90
      } else {
        angle = -35
      }
    } else if (this.aimDown) {
      angle = 35
    }

    const baseX = this.player.x + dir * 16
    const baseY = this.player.y - 4

    const spawn = (ang: number, tex = 'bullet', spd = 640) => {
      const b = this.bullets.get(baseX, baseY, tex) as Phaser.Physics.Arcade.Image
      if (!b) return
      b.setActive(true).setVisible(true)
      b.body?.reset(baseX, baseY)
      const rad = Phaser.Math.DegToRad(ang)
      // When shooting purely up, ignore facing for x
      const vx = ang === -90 ? 0 : Math.cos(rad) * dir * spd
      const vy = Math.sin(rad) * spd
      b.setVelocity(vx, vy)
      this.time.delayedCall(900, () => { if (b.active) b.setActive(false).setVisible(false) })
    }

    if (this.weapon === 'spread') {
      spawn(angle - 18); spawn(angle); spawn(angle + 18)
    } else if (this.weapon === 'laser') {
      spawn(angle, 'laser', 820)
    } else if (this.weapon === 'fire') {
      spawn(angle, 'fireball', 480)
      spawn(angle - 12, 'fireball', 460)
      spawn(angle + 12, 'fireball', 460)
    } else if (this.weapon === 'rapid') {
      spawn(angle)
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
        }
      }

      if (type === 'flyer') {
        const dx = this.player.x - enemy.x
        const dy = this.player.y - enemy.y - 45
        enemy.setVelocityX(Phaser.Math.Clamp(dx * 0.5, -speed, speed))
        enemy.setVelocityY(Phaser.Math.Clamp(dy * 0.3, -speed * 0.5, speed * 0.5))
      }

      if (type === 'boss') {
        const dx = this.player.x - enemy.x
        enemy.setVelocityX(Phaser.Math.Clamp(dx * 0.4, -speed, speed))
        enemy.setVelocityY(Math.sin(this.time.now / 350) * 40)
      }

      if (type === 'tank' || type === 'flyer' || type === 'boss') {
        let timer = enemy.getData('shootTimer') as number
        timer -= delta
        if (timer <= 0) {
          const count = type === 'boss' ? 5 : 1
          this.enemyFire(enemy, count)
          enemy.setData('shootTimer', type === 'boss' ? 800 : type === 'tank' ? 1400 : 1100)
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
      const spread = (i - (count - 1) / 2) * 0.22
      const ang = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y) + spread
      const spd = count > 1 ? 190 : 230
      b.setVelocity(Math.cos(ang) * spd, Math.sin(ang) * spd)
      this.time.delayedCall(2000, () => { if (b.active) b.setActive(false).setVisible(false) })
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
    this.time.delayedCall(40, () => { if (enemy.active) enemy.clearTint() })
    this.cameras.main.shake(25, 0.004)
    this.particles.emitParticleAt(enemy.x, enemy.y, 4)

    if (hp <= 0) {
      const type = enemy.getData('type') as string
      const pts = type === 'boss' ? 2000 : type === 'tank' ? 350 : type === 'flyer' ? 200 : 100
      this.score += pts
      this.scoreText.setText('SCORE  ' + this.score)
      this.particles.emitParticleAt(enemy.x, enemy.y, 20)
      this.cameras.main.shake(70, 0.012)

      // Chance to drop powerup
      if (Math.random() < 0.22 && type !== 'boss') {
        const kinds = ['health', 'spread', 'rapid', 'laser', 'fire']
        this.spawnPowerup(enemy.x, enemy.y, kinds[Math.floor(Math.random() * kinds.length)])
      }

      enemy.destroy()
      if (this.enemies.countActive(true) === 0) this.onLevelClear()
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
    this.updateHealth()
    this.invulnerable = true
    this.player.setTint(0xff0030)
    this.cameras.main.shake(130, 0.015)
    this.cameras.main.flash(100, 255, 20, 40, false)
    this.player.setVelocityY(-260)

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
        this.health = 4
        this.updateHealth()
        this.player.setPosition(60, 480)
        this.player.setVelocity(0, 0)
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
    this.particles.emitParticleAt(pow.x, pow.y, 14)

    if (kind === 'health') {
      this.health = Math.min(this.maxHealth, this.health + 1)
      this.updateHealth()
    } else {
      this.weapon = kind as typeof this.weapon
      this.weaponTimer = this.time.now + 14000
      const labels: Record<string, string> = {
        spread: 'SPREAD', rapid: 'RAPID', laser: 'LASER', fire: 'FIRE'
      }
      this.weaponText.setText('GUN  ' + (labels[kind] || 'NORMAL'))
      this.fireRate = kind === 'rapid' ? 65 : kind === 'laser' ? 120 : 150
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
      }).setOrigin(0.5).setDepth(200)

      this.time.delayedCall(1500, () => {
        msg.destroy()
        this.level = next
        this.levelText.setText('LEVEL  ' + next)
        this.player.setPosition(60, 480)
        this.player.setVelocity(0, 0)
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
    this.add.rectangle(400, 300, 800, 600, 0x000000, 0.78).setDepth(200)
    this.add.text(400, 210, 'MISSION FAILED', { fontFamily: 'monospace', fontSize: '30px', color: '#f43f5e' }).setOrigin(0.5).setDepth(201)
    this.add.text(400, 270, 'Score: ' + this.score, { fontFamily: 'monospace', fontSize: '18px', color: '#e879f9' }).setOrigin(0.5).setDepth(201)
    this.add.text(400, 310, 'Reached Level ' + this.level, { fontFamily: 'monospace', fontSize: '13px', color: '#a1a1aa' }).setOrigin(0.5).setDepth(201)
    const btn = this.add.text(400, 370, '[ CLICK / TAP TO RESTART ]', {
      fontFamily: 'monospace', fontSize: '14px', color: '#d4d4d8'
    }).setOrigin(0.5).setDepth(201).setInteractive({ useHandCursor: true })
    btn.on('pointerdown', () => this.scene.restart())
  }

  private showVictory() {
    this.gameOver = true
    this.player.setVelocity(0, 0)
    this.add.rectangle(400, 300, 800, 600, 0x000000, 0.75).setDepth(200)
    this.add.text(400, 180, 'SECTOR DOMINATED', { fontFamily: 'monospace', fontSize: '28px', color: '#22d3ee' }).setOrigin(0.5).setDepth(201)
    this.add.text(400, 240, 'Final Score: ' + this.score, { fontFamily: 'monospace', fontSize: '20px', color: '#e879f9' }).setOrigin(0.5).setDepth(201)
    this.add.text(400, 290, 'The Huntress has claimed the Apex.', {
      fontFamily: 'monospace', fontSize: '13px', color: '#a1a1aa'
    }).setOrigin(0.5).setDepth(201)
    const btn = this.add.text(400, 360, '[ CLICK / TAP TO PLAY AGAIN ]', {
      fontFamily: 'monospace', fontSize: '14px', color: '#d4d4d8'
    }).setOrigin(0.5).setDepth(201).setInteractive({ useHandCursor: true })
    btn.on('pointerdown', () => this.scene.restart())
  }
}