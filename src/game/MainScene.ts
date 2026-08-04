import Phaser from 'phaser'

// Touch control state (shared flags)
interface TouchState {
  left: boolean
  right: boolean
  jump: boolean
  shoot: boolean
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
  private fireRate = 180
  private health = 3
  private score = 0
  private level = 1
  private healthText!: Phaser.GameObjects.Text
  private scoreText!: Phaser.GameObjects.Text
  private levelText!: Phaser.GameObjects.Text
  private weaponText!: Phaser.GameObjects.Text
  private gameOver = false
  private invulnerable = false
  private facingRight = true
  private touch: TouchState = { left: false, right: false, jump: false, shoot: false }
  private weapon: 'normal' | 'spread' | 'rapid' = 'normal'
  private weaponTimer = 0
  private particles!: Phaser.GameObjects.Particles.ParticleEmitter

  constructor() {
    super({ key: 'MainScene' })
  }

  create() {
    this.gameOver = false
    this.health = 3
    this.score = 0
    this.level = 1
    this.invulnerable = false
    this.facingRight = true
    this.weapon = 'normal'
    this.fireRate = 180
    this.touch = { left: false, right: false, jump: false, shoot: false }

    this.cameras.main.setBackgroundColor('#07070f')
    this.createTextures()

    this.physics.world.setBounds(0, 0, 800, 600)

    this.platforms = this.physics.add.staticGroup()
    this.bullets = this.physics.add.group({ classType: Phaser.Physics.Arcade.Image, maxSize: 50 })
    this.enemyBullets = this.physics.add.group({ classType: Phaser.Physics.Arcade.Image, maxSize: 30 })
    this.enemies = this.physics.add.group()
    this.powerups = this.physics.add.group()

    this.buildLevel(1)

    this.player = this.physics.add.sprite(80, 480, 'player')
    this.player.setCollideWorldBounds(true)
    this.player.setBounce(0.05)
    this.player.setDepth(10)
    this.player.setDragX(1200)

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
      speed: { min: 40, max: 140 },
      scale: { start: 0.6, end: 0 },
      lifespan: 320,
      blendMode: 'ADD',
      emitting: false,
    })

    this.createHUD()
    this.createTouchControls()
  }

  private createTextures() {
    const p = this.make.graphics({ x: 0, y: 0 })
    p.fillStyle(0x22d3ee, 1)
    p.fillRoundedRect(6, 2, 20, 36, 4)
    p.fillStyle(0x06b6d4, 1)
    p.fillCircle(16, 12, 7)
    p.fillStyle(0xf0abfc, 1)
    p.fillRect(0, 18, 8, 6)
    p.fillRect(24, 18, 8, 6)
    p.fillStyle(0xa5f3fc, 1)
    p.fillRect(10, 38, 5, 8)
    p.fillRect(17, 38, 5, 8)
    p.generateTexture('player', 32, 48)
    p.destroy()

    const plat = this.make.graphics({ x: 0, y: 0 })
    plat.fillStyle(0x1e1b4b, 1)
    plat.fillRect(0, 0, 32, 14)
    plat.fillStyle(0x7c3aed, 1)
    plat.fillRect(0, 0, 32, 3)
    plat.fillStyle(0x4c1d95, 0.6)
    plat.fillRect(0, 11, 32, 3)
    plat.generateTexture('platform', 32, 14)
    plat.destroy()

    const b = this.make.graphics({ x: 0, y: 0 })
    b.fillStyle(0xf0abfc, 1)
    b.fillRect(0, 0, 14, 4)
    b.fillStyle(0xffffff, 0.9)
    b.fillRect(2, 1, 10, 2)
    b.generateTexture('bullet', 14, 4)
    b.destroy()

    const eb = this.make.graphics({ x: 0, y: 0 })
    eb.fillStyle(0xf87171, 1)
    eb.fillRect(0, 0, 10, 4)
    eb.generateTexture('enemyBullet', 10, 4)
    eb.destroy()

    const e = this.make.graphics({ x: 0, y: 0 })
    e.fillStyle(0xf43f5e, 1)
    e.fillRoundedRect(2, 4, 28, 28, 3)
    e.fillStyle(0xbe123c, 1)
    e.fillRect(8, 10, 16, 12)
    e.fillStyle(0xfbbf24, 1)
    e.fillCircle(12, 15, 3)
    e.fillCircle(20, 15, 3)
    e.generateTexture('enemy', 32, 36)
    e.destroy()

    const f = this.make.graphics({ x: 0, y: 0 })
    f.fillStyle(0xa855f7, 1)
    f.fillCircle(16, 16, 12)
    f.fillStyle(0xe879f9, 1)
    f.fillTriangle(4, 16, 16, 4, 16, 28)
    f.fillTriangle(28, 16, 16, 4, 16, 28)
    f.fillStyle(0xffffff, 1)
    f.fillCircle(16, 16, 4)
    f.generateTexture('flyer', 32, 32)
    f.destroy()

    const t = this.make.graphics({ x: 0, y: 0 })
    t.fillStyle(0xfb923c, 1)
    t.fillRoundedRect(0, 8, 40, 28, 4)
    t.fillStyle(0xea580c, 1)
    t.fillRect(8, 0, 24, 12)
    t.fillStyle(0xfef08a, 1)
    t.fillRect(14, 4, 12, 6)
    t.generateTexture('tank', 40, 40)
    t.destroy()

    const colors = [
      { key: 'pow_health', c: 0x4ade80 },
      { key: 'pow_spread', c: 0x22d3ee },
      { key: 'pow_rapid', c: 0xfbbf24 },
    ]
    colors.forEach(({ key, c }) => {
      const g = this.make.graphics({ x: 0, y: 0 })
      g.fillStyle(c, 1)
      g.fillCircle(12, 12, 11)
      g.fillStyle(0xffffff, 0.85)
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

    this.platforms.create(400, 585, 'platform').setScale(26, 1.4).refreshBody()

    if (lvl === 1) {
      this.platforms.create(180, 460, 'platform').setScale(4.5, 0.8).refreshBody()
      this.platforms.create(520, 390, 'platform').setScale(5.5, 0.8).refreshBody()
      this.platforms.create(140, 290, 'platform').setScale(3.8, 0.8).refreshBody()
      this.platforms.create(620, 260, 'platform').setScale(4.2, 0.8).refreshBody()
      this.platforms.create(380, 170, 'platform').setScale(3.5, 0.8).refreshBody()
      this.platforms.create(700, 460, 'platform').setScale(3, 0.8).refreshBody()

      this.spawnEnemy('enemy', 260, 410, { hp: 2, speed: 55, type: 'walker' })
      this.spawnEnemy('enemy', 480, 340, { hp: 2, speed: 70, type: 'walker' })
      this.spawnEnemy('enemy', 160, 240, { hp: 2, speed: 50, type: 'walker' })
      this.spawnEnemy('flyer', 400, 100, { hp: 2, speed: 40, type: 'flyer' })
      this.spawnEnemy('flyer', 650, 180, { hp: 2, speed: 50, type: 'flyer' })
      this.spawnEnemy('enemy', 680, 510, { hp: 3, speed: 40, type: 'walker' })
      this.spawnEnemy('tank', 350, 510, { hp: 5, speed: 25, type: 'tank' })

      this.spawnPowerup(500, 350, 'health')
      this.spawnPowerup(200, 250, 'spread')
    } else {
      this.platforms.create(120, 480, 'platform').setScale(3.5, 0.8).refreshBody()
      this.platforms.create(320, 420, 'platform').setScale(3, 0.8).refreshBody()
      this.platforms.create(520, 360, 'platform').setScale(3.5, 0.8).refreshBody()
      this.platforms.create(700, 300, 'platform').setScale(3, 0.8).refreshBody()
      this.platforms.create(200, 300, 'platform').setScale(2.8, 0.8).refreshBody()
      this.platforms.create(420, 230, 'platform').setScale(4, 0.8).refreshBody()
      this.platforms.create(100, 180, 'platform').setScale(3, 0.8).refreshBody()
      this.platforms.create(650, 150, 'platform').setScale(3.5, 0.8).refreshBody()
      this.platforms.create(400, 90, 'platform').setScale(2.5, 0.8).refreshBody()

      this.spawnEnemy('tank', 300, 370, { hp: 6, speed: 30, type: 'tank' })
      this.spawnEnemy('tank', 600, 250, { hp: 6, speed: 28, type: 'tank' })
      this.spawnEnemy('flyer', 250, 120, { hp: 3, speed: 60, type: 'flyer' })
      this.spawnEnemy('flyer', 500, 80, { hp: 3, speed: 55, type: 'flyer' })
      this.spawnEnemy('flyer', 700, 200, { hp: 3, speed: 70, type: 'flyer' })
      this.spawnEnemy('enemy', 150, 430, { hp: 3, speed: 80, type: 'walker' })
      this.spawnEnemy('enemy', 450, 310, { hp: 3, speed: 75, type: 'walker' })
      this.spawnEnemy('enemy', 680, 510, { hp: 3, speed: 65, type: 'walker' })
      this.spawnEnemy('enemy', 100, 510, { hp: 3, speed: 60, type: 'walker' })

      this.spawnPowerup(320, 380, 'rapid')
      this.spawnPowerup(420, 190, 'health')
      this.spawnPowerup(650, 110, 'spread')
    }
  }

  private spawnEnemy(key: string, x: number, y: number, data: { hp: number; speed: number; type: string }) {
    const enemy = this.enemies.create(x, y, key) as Phaser.Physics.Arcade.Sprite
    enemy.setBounce(0.05)
    enemy.setCollideWorldBounds(true)
    enemy.setData('hp', data.hp)
    enemy.setData('maxHp', data.hp)
    enemy.setData('speed', data.speed)
    enemy.setData('type', data.type)
    enemy.setData('dir', Math.random() > 0.5 ? 1 : -1)
    enemy.setData('shootTimer', 0)
    if (data.type === 'flyer') {
      enemy.setVelocity(data.speed * (Math.random() > 0.5 ? 1 : -1), data.speed * 0.4)
      ;(enemy.body as Phaser.Physics.Arcade.Body).setAllowGravity(false)
    } else {
      enemy.setVelocityX(data.speed * (enemy.getData('dir') as number))
    }
  }

  private spawnPowerup(x: number, y: number, kind: 'health' | 'spread' | 'rapid') {
    const key = kind === 'health' ? 'pow_health' : kind === 'spread' ? 'pow_spread' : 'pow_rapid'
    const p = this.powerups.create(x, y, key) as Phaser.Physics.Arcade.Sprite
    p.setData('kind', kind)
    p.setBounce(0.4)
    p.setVelocityY(-80)
  }

  private createHUD() {
    this.scoreText = this.add.text(16, 10, 'SCORE  0', { fontFamily: 'monospace', fontSize: '16px', color: '#e879f9' }).setScrollFactor(0).setDepth(100)
    this.healthText = this.add.text(16, 32, 'HEALTH  \u2665\u2665\u2665', { fontFamily: 'monospace', fontSize: '15px', color: '#f472b6' }).setScrollFactor(0).setDepth(100)
    this.levelText = this.add.text(16, 54, 'LEVEL  1', { fontFamily: 'monospace', fontSize: '13px', color: '#a1a1aa' }).setScrollFactor(0).setDepth(100)
    this.weaponText = this.add.text(16, 74, 'WEAPON  NORMAL', { fontFamily: 'monospace', fontSize: '12px', color: '#67e8f9' }).setScrollFactor(0).setDepth(100)

    this.add.text(784, 10, 'APEX STRIKE', { fontFamily: 'monospace', fontSize: '13px', color: '#71717a' }).setOrigin(1, 0).setScrollFactor(0).setDepth(100)
  }

  private createTouchControls() {
    const makeBtn = (x: number, y: number, w: number, h: number, label: string, key: keyof TouchState) => {
      const bg = this.add.rectangle(x, y, w, h, 0x000000, 0.35).setScrollFactor(0).setDepth(150).setInteractive()
      this.add.text(x, y, label, { fontFamily: 'monospace', fontSize: '14px', color: '#ffffff' }).setOrigin(0.5).setScrollFactor(0).setDepth(151)

      bg.on('pointerdown', () => { this.touch[key] = true; bg.setFillStyle(0xf0abfc, 0.45) })
      bg.on('pointerup', () => { this.touch[key] = false; bg.setFillStyle(0x000000, 0.35) })
      bg.on('pointerout', () => { this.touch[key] = false; bg.setFillStyle(0x000000, 0.35) })

      this.input.addPointer(3)
    }

    makeBtn(60, 520, 70, 55, '\u25C0', 'left')
    makeBtn(140, 520, 70, 55, '\u25B6', 'right')
    makeBtn(100, 450, 90, 50, 'JUMP', 'jump')
    makeBtn(720, 500, 90, 70, 'FIRE', 'shoot')
  }

  update(time: number, delta: number) {
    if (this.gameOver || !this.player?.active) return

    if (this.weapon !== 'normal' && time > this.weaponTimer) {
      this.weapon = 'normal'
      this.fireRate = 180
      this.weaponText.setText('WEAPON  NORMAL')
    }

    this.handlePlayerInput(time)
    this.updateEnemies(time, delta)
  }

  private handlePlayerInput(time: number) {
    const speed = 250
    const body = this.player.body as Phaser.Physics.Arcade.Body

    let left = this.cursors.left.isDown || this.wasd.left.isDown || this.touch.left
    let right = this.cursors.right.isDown || this.wasd.right.isDown || this.touch.right
    let jump = this.cursors.up.isDown || this.wasd.up.isDown || this.touch.jump
    let shoot = this.spaceKey.isDown || this.touch.shoot

    const pad = this.input.gamepad?.getPad(0)
    if (pad) {
      if (pad.left || (pad.axes.length > 0 && pad.axes[0].getValue() < -0.3)) left = true
      if (pad.right || (pad.axes.length > 0 && pad.axes[0].getValue() > 0.3)) right = true
      if (pad.A || pad.B || (pad.buttons[0] && pad.buttons[0].pressed)) jump = true
      if (pad.X || pad.Y || (pad.buttons[2] && pad.buttons[2].pressed) || (pad.buttons[7] && pad.buttons[7].pressed)) shoot = true
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
      this.player.setVelocityY(-480)
    }

    if (shoot && time > this.lastFired) {
      this.fireBullet()
      this.lastFired = time + this.fireRate
    }
  }

  private fireBullet() {
    const dir = this.facingRight ? 1 : -1
    const baseX = this.player.x + dir * 18
    const baseY = this.player.y - 4

    const spawn = (angleOffset = 0) => {
      const bullet = this.bullets.get(baseX, baseY, 'bullet') as Phaser.Physics.Arcade.Image
      if (!bullet) return
      bullet.setActive(true).setVisible(true)
      bullet.body?.reset(baseX, baseY)
      const rad = Phaser.Math.DegToRad(angleOffset)
      bullet.setVelocity(Math.cos(rad) * dir * 600, Math.sin(rad) * 600)
      this.time.delayedCall(1100, () => {
        if (bullet.active) {
          bullet.setActive(false).setVisible(false)
        }
      })
    }

    if (this.weapon === 'spread') {
      spawn(-12)
      spawn(0)
      spawn(12)
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
        if (type === 'walker' && body.blocked.down && Math.random() < 0.002) {
          enemy.setVelocityY(-320)
        }
      }

      if (type === 'flyer') {
        const dx = this.player.x - enemy.x
        const dy = this.player.y - enemy.y - 40
        enemy.setVelocityX(Phaser.Math.Clamp(dx * 0.4, -speed, speed))
        enemy.setVelocityY(Phaser.Math.Clamp(dy * 0.3, -speed * 0.6, speed * 0.6))
      }

      if (type === 'tank' || type === 'flyer') {
        let timer = enemy.getData('shootTimer') as number
        timer -= delta
        if (timer <= 0) {
          this.enemyShoot(enemy)
          enemy.setData('shootTimer', type === 'tank' ? 1800 : 1400)
        } else {
          enemy.setData('shootTimer', timer)
        }
      }
    })
  }

  private enemyShoot(enemy: Phaser.Physics.Arcade.Sprite) {
    const bullet = this.enemyBullets.get(enemy.x, enemy.y, 'enemyBullet') as Phaser.Physics.Arcade.Image
    if (!bullet) return
    bullet.setActive(true).setVisible(true)
    bullet.body?.reset(enemy.x, enemy.y)

    const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y)
    const speed = 220
    bullet.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed)

    this.time.delayedCall(2500, () => {
      if (bullet.active) bullet.setActive(false).setVisible(false)
    })
  }

  private hitEnemy(
    bulletObj: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    enemyObj: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile
  ) {
    const bullet = bulletObj as Phaser.Physics.Arcade.Image
    const enemy = enemyObj as Phaser.Physics.Arcade.Sprite

    bullet.setActive(false).setVisible(false)

    let hp = (enemy.getData('hp') as number) - 1
    enemy.setData('hp', hp)

    enemy.setTint(0xffffff)
    this.time.delayedCall(60, () => { if (enemy.active) enemy.clearTint() })
    this.cameras.main.shake(40, 0.006)
    this.particles.emitParticleAt(enemy.x, enemy.y, 6)

    if (hp <= 0) {
      const type = enemy.getData('type') as string
      const points = type === 'tank' ? 250 : type === 'flyer' ? 150 : 100
      this.score += points
      this.scoreText.setText('SCORE  ' + this.score)
      this.particles.emitParticleAt(enemy.x, enemy.y, 14)
      enemy.destroy()

      if (this.enemies.countActive(true) === 0) {
        this.onLevelClear()
      }
    }
  }

  private hitPlayer(
    _player: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    _enemy: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile
  ) {
    this.damagePlayer(1)
  }

  private hitByEnemyBullet(
    _player: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    bulletObj: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile
  ) {
    const bullet = bulletObj as Phaser.Physics.Arcade.Image
    bullet.setActive(false).setVisible(false)
    this.damagePlayer(1)
  }

  private damagePlayer(amount: number) {
    if (this.invulnerable || this.gameOver) return

    this.health -= amount
    this.updateHealthDisplay()
    this.invulnerable = true
    this.player.setTint(0xff0000)
    this.cameras.main.shake(120, 0.012)
    this.cameras.main.flash(150, 255, 50, 50, false)

    this.player.setVelocityY(-220)

    this.time.delayedCall(900, () => {
      this.invulnerable = false
      if (this.player.active) this.player.clearTint()
    })

    if (this.health <= 0) this.triggerGameOver()
  }

  private collectPowerup(
    _player: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    powObj: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile
  ) {
    const pow = powObj as Phaser.Physics.Arcade.Sprite
    const kind = pow.getData('kind') as string
    pow.destroy()
    this.particles.emitParticleAt(pow.x, pow.y, 10)

    if (kind === 'health') {
      this.health = Math.min(5, this.health + 1)
      this.updateHealthDisplay()
    } else if (kind === 'spread') {
      this.weapon = 'spread'
      this.weaponTimer = this.time.now + 10000
      this.weaponText.setText('WEAPON  SPREAD')
      this.fireRate = 200
    } else if (kind === 'rapid') {
      this.weapon = 'rapid'
      this.weaponTimer = this.time.now + 10000
      this.weaponText.setText('WEAPON  RAPID')
      this.fireRate = 90
    }
  }

  private updateHealthDisplay() {
    const hearts = '\u2665'.repeat(Math.max(0, this.health)) + '\u2661'.repeat(Math.max(0, 5 - this.health))
    this.healthText.setText('HEALTH  ' + hearts)
  }

  private onLevelClear() {
    if (this.level === 1) {
      this.level = 2
      this.levelText.setText('LEVEL  2')
      this.player.setPosition(80, 480)
      this.player.setVelocity(0, 0)
      this.buildLevel(2)

      const msg = this.add.text(400, 280, 'LEVEL 2 \u2014 APEX CITADEL', {
        fontFamily: 'monospace', fontSize: '22px', color: '#22d3ee'
      }).setOrigin(0.5).setDepth(200)
      this.time.delayedCall(1800, () => msg.destroy())
    } else {
      this.showVictory()
    }
  }

  private triggerGameOver() {
    this.gameOver = true
    this.player.setTint(0x555555)
    this.player.setVelocity(0, 0)

    this.add.rectangle(400, 300, 800, 600, 0x000000, 0.72).setDepth(200)
    this.add.text(400, 230, 'MISSION FAILED', { fontFamily: 'monospace', fontSize: '34px', color: '#f43f5e' }).setOrigin(0.5).setDepth(201)
    this.add.text(400, 290, 'Score: ' + this.score, { fontFamily: 'monospace', fontSize: '20px', color: '#e879f9' }).setOrigin(0.5).setDepth(201)

    const btn = this.add.text(400, 360, '[ TAP / CLICK TO RESTART ]', {
      fontFamily: 'monospace', fontSize: '15px', color: '#a1a1aa'
    }).setOrigin(0.5).setDepth(201).setInteractive({ useHandCursor: true })

    btn.on('pointerdown', () => this.scene.restart())
  }

  private showVictory() {
    this.gameOver = true
    this.player.setVelocity(0, 0)

    this.add.rectangle(400, 300, 800, 600, 0x000000, 0.68).setDepth(200)
    this.add.text(400, 210, 'SECTOR CLEARED', { fontFamily: 'monospace', fontSize: '32px', color: '#22d3ee' }).setOrigin(0.5).setDepth(201)
    this.add.text(400, 270, 'Final Score: ' + this.score, { fontFamily: 'monospace', fontSize: '22px', color: '#e879f9' }).setOrigin(0.5).setDepth(201)
    this.add.text(400, 320, 'All hostiles eliminated. The Huntress prevails.', {
      fontFamily: 'monospace', fontSize: '13px', color: '#a1a1aa'
    }).setOrigin(0.5).setDepth(201)

    const btn = this.add.text(400, 390, '[ TAP / CLICK TO PLAY AGAIN ]', {
      fontFamily: 'monospace', fontSize: '15px', color: '#a1a1aa'
    }).setOrigin(0.5).setDepth(201).setInteractive({ useHandCursor: true })

    btn.on('pointerdown', () => this.scene.restart())
  }
}