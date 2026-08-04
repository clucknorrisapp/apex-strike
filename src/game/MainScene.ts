import Phaser from 'phaser'

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
  private enemies!: Phaser.Physics.Arcade.Group
  private platforms!: Phaser.Physics.Arcade.StaticGroup
  private lastFired = 0
  private fireRate = 180
  private health = 3
  private score = 0
  private healthText!: Phaser.GameObjects.Text
  private scoreText!: Phaser.GameObjects.Text
  private gameOver = false
  private invulnerable = false
  private facingRight = true

  constructor() {
    super({ key: 'MainScene' })
  }

  preload() {
    // We generate all textures in create() so no external assets needed
  }

  create() {
    this.gameOver = false
    this.health = 3
    this.score = 0
    this.invulnerable = false
    this.facingRight = true

    // Background
    this.cameras.main.setBackgroundColor('#07070f')

    // Generate simple textures
    this.createTextures()

    // Platforms
    this.platforms = this.physics.add.staticGroup()

    // Ground
    this.platforms.create(400, 580, 'platform').setScale(25, 1.2).refreshBody()

    // Floating platforms
    this.platforms.create(200, 450, 'platform').setScale(4, 0.7).refreshBody()
    this.platforms.create(550, 380, 'platform').setScale(5, 0.7).refreshBody()
    this.platforms.create(150, 280, 'platform').setScale(3.5, 0.7).refreshBody()
    this.platforms.create(650, 250, 'platform').setScale(4, 0.7).refreshBody()
    this.platforms.create(400, 160, 'platform').setScale(3, 0.7).refreshBody()

    // Player
    this.player = this.physics.add.sprite(100, 500, 'player')
    this.player.setCollideWorldBounds(true)
    this.player.setBounce(0.05)
    this.player.setDepth(10)

    // Physics
    this.physics.add.collider(this.player, this.platforms)

    // Controls
    this.cursors = this.input.keyboard!.createCursorKeys()
    this.wasd = {
      up: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    }
    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)

    // Bullets
    this.bullets = this.physics.add.group({
      classType: Phaser.Physics.Arcade.Image,
      maxSize: 40,
      runChildUpdate: true,
    })

    // Enemies
    this.enemies = this.physics.add.group()
    this.spawnEnemies()

    // Collisions
    this.physics.add.collider(this.enemies, this.platforms)
    this.physics.add.overlap(this.bullets, this.enemies, this.hitEnemy as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this)
    this.physics.add.overlap(this.player, this.enemies, this.hitPlayer as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this)

    // HUD
    this.scoreText = this.add
      .text(16, 12, 'SCORE  0', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#e879f9',
      })
      .setScrollFactor(0)
      .setDepth(100)

    this.healthText = this.add
      .text(16, 38, 'HEALTH  ♥♥♥', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#f472b6',
      })
      .setScrollFactor(0)
      .setDepth(100)

    this.add
      .text(16, 64, 'A/D Move  |  W Jump  |  SPACE Shoot', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#71717a',
      })
      .setScrollFactor(0)
      .setDepth(100)

    // Title
    this.add
      .text(790, 12, 'APEX STRIKE', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#a1a1aa',
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(100)
  }

  private createTextures() {
    // Player texture (cyan cyber hunter)
    const playerGfx = this.make.graphics({ x: 0, y: 0 })
    playerGfx.fillStyle(0x22d3ee, 1)
    playerGfx.fillRect(4, 0, 24, 40) // body
    playerGfx.fillStyle(0x06b6d4, 1)
    playerGfx.fillRect(8, 8, 16, 10) // head accent
    playerGfx.fillStyle(0xf0abfc, 1)
    playerGfx.fillRect(0, 16, 6, 8) // left arm/gun
    playerGfx.fillRect(26, 16, 6, 8) // right
    playerGfx.generateTexture('player', 32, 48)
    playerGfx.destroy()

    // Platform
    const platGfx = this.make.graphics({ x: 0, y: 0 })
    platGfx.fillStyle(0x1e1b4b, 1)
    platGfx.fillRect(0, 0, 32, 16)
    platGfx.fillStyle(0x4c1d95, 1)
    platGfx.fillRect(0, 0, 32, 3)
    platGfx.generateTexture('platform', 32, 16)
    platGfx.destroy()

    // Bullet
    const bulletGfx = this.make.graphics({ x: 0, y: 0 })
    bulletGfx.fillStyle(0xf0abfc, 1)
    bulletGfx.fillRect(0, 0, 12, 4)
    bulletGfx.fillStyle(0xffffff, 0.8)
    bulletGfx.fillRect(2, 1, 8, 2)
    bulletGfx.generateTexture('bullet', 12, 4)
    bulletGfx.destroy()

    // Enemy (hostile unit)
    const enemyGfx = this.make.graphics({ x: 0, y: 0 })
    enemyGfx.fillStyle(0xf43f5e, 1)
    enemyGfx.fillRect(2, 4, 28, 28)
    enemyGfx.fillStyle(0xbe123c, 1)
    enemyGfx.fillRect(8, 10, 16, 10)
    enemyGfx.fillStyle(0xfbbf24, 1)
    enemyGfx.fillRect(10, 12, 4, 4)
    enemyGfx.fillRect(18, 12, 4, 4)
    enemyGfx.generateTexture('enemy', 32, 36)
    enemyGfx.destroy()
  }

  private spawnEnemies() {
    const positions = [
      { x: 280, y: 400 },
      { x: 500, y: 330 },
      { x: 180, y: 230 },
      { x: 620, y: 200 },
      { x: 380, y: 110 },
      { x: 700, y: 500 },
      { x: 320, y: 500 },
    ]

    positions.forEach((pos, i) => {
      const enemy = this.enemies.create(pos.x, pos.y, 'enemy') as Phaser.Physics.Arcade.Sprite
      enemy.setBounce(0.1)
      enemy.setCollideWorldBounds(true)
      enemy.setVelocityX(i % 2 === 0 ? 60 : -60)
      enemy.setData('hp', 2)
      enemy.setData('dir', i % 2 === 0 ? 1 : -1)
    })
  }

  update(time: number) {
    if (this.gameOver || !this.player || !this.player.active) return

    const speed = 240
    const body = this.player.body as Phaser.Physics.Arcade.Body

    // Movement
    if (this.cursors.left.isDown || this.wasd.left.isDown) {
      this.player.setVelocityX(-speed)
      this.facingRight = false
      this.player.setFlipX(true)
    } else if (this.cursors.right.isDown || this.wasd.right.isDown) {
      this.player.setVelocityX(speed)
      this.facingRight = true
      this.player.setFlipX(false)
    } else {
      this.player.setVelocityX(0)
    }

    // Jump
    if ((this.cursors.up.isDown || this.wasd.up.isDown) && body.blocked.down) {
      this.player.setVelocityY(-460)
    }

    // Shoot
    if (this.spaceKey.isDown && time > this.lastFired) {
      this.fireBullet()
      this.lastFired = time + this.fireRate
    }

    // Simple enemy AI - reverse direction at edges or randomly
    this.enemies.getChildren().forEach((child) => {
      const enemy = child as Phaser.Physics.Arcade.Sprite
      if (!enemy.active) return

      const eBody = enemy.body as Phaser.Physics.Arcade.Body
      if (eBody.blocked.left || eBody.blocked.right) {
        const dir = enemy.getData('dir') as number
        enemy.setData('dir', -dir)
        enemy.setVelocityX(-dir * 70)
      }
    })
  }

  private fireBullet() {
    const offsetX = this.facingRight ? 18 : -18
    const bullet = this.bullets.get(this.player.x + offsetX, this.player.y - 4, 'bullet') as Phaser.Physics.Arcade.Image

    if (bullet) {
      bullet.setActive(true)
      bullet.setVisible(true)
      bullet.body?.reset(this.player.x + offsetX, this.player.y - 4)

      const direction = this.facingRight ? 1 : -1
      bullet.setVelocityX(direction * 580)
      bullet.setVelocityY(0)

      this.time.delayedCall(1200, () => {
        if (bullet.active) {
          bullet.setActive(false)
          bullet.setVisible(false)
        }
      })
    }
  }

  private hitEnemy(
    _bullet: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    enemyObj: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile
  ) {
    const bullet = _bullet as Phaser.Physics.Arcade.Image
    const enemy = enemyObj as Phaser.Physics.Arcade.Sprite

    bullet.setActive(false)
    bullet.setVisible(false)

    let hp = (enemy.getData('hp') as number) - 1
    enemy.setData('hp', hp)

    // Flash
    enemy.setTint(0xffffff)
    this.time.delayedCall(80, () => {
      if (enemy.active) enemy.clearTint()
    })

    if (hp <= 0) {
      enemy.destroy()
      this.score += 100
      this.scoreText.setText('SCORE  ' + this.score)

      // Check win condition
      if (this.enemies.countActive(true) === 0) {
        this.showVictory()
      }
    }
  }

  private hitPlayer(
    _player: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    _enemy: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile
  ) {
    if (this.invulnerable || this.gameOver) return

    this.health -= 1
    this.updateHealthDisplay()

    this.invulnerable = true
    this.player.setTint(0xff0000)

    // Knockback
    const enemy = _enemy as Phaser.Physics.Arcade.Sprite
    const dir = this.player.x < enemy.x ? -1 : 1
    this.player.setVelocityX(dir * 200)
    this.player.setVelocityY(-200)

    this.time.delayedCall(1000, () => {
      this.invulnerable = false
      if (this.player.active) this.player.clearTint()
    })

    if (this.health <= 0) {
      this.triggerGameOver()
    }
  }

  private updateHealthDisplay() {
    const hearts = '\u2665'.repeat(Math.max(0, this.health)) + '\u2661'.repeat(Math.max(0, 3 - this.health))
    this.healthText.setText('HEALTH  ' + hearts)
  }

  private triggerGameOver() {
    this.gameOver = true
    this.player.setTint(0x666666)
    this.player.setVelocity(0, 0)

    const overlay = this.add
      .rectangle(400, 300, 800, 600, 0x000000, 0.7)
      .setDepth(200)

    this.add
      .text(400, 240, 'MISSION FAILED', {
        fontFamily: 'monospace',
        fontSize: '36px',
        color: '#f43f5e',
      })
      .setOrigin(0.5)
      .setDepth(201)

    this.add
      .text(400, 300, 'Score: ' + this.score, {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#e879f9',
      })
      .setOrigin(0.5)
      .setDepth(201)

    const restartBtn = this.add
      .text(400, 370, '[ CLICK TO RESTART ]', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#a1a1aa',
      })
      .setOrigin(0.5)
      .setDepth(201)
      .setInteractive({ useHandCursor: true })

    restartBtn.on('pointerdown', () => {
      this.scene.restart()
    })
  }

  private showVictory() {
    this.gameOver = true
    this.player.setVelocity(0, 0)

    this.add
      .rectangle(400, 300, 800, 600, 0x000000, 0.65)
      .setDepth(200)

    this.add
      .text(400, 230, 'AREA CLEARED', {
        fontFamily: 'monospace',
        fontSize: '36px',
        color: '#22d3ee',
      })
      .setOrigin(0.5)
      .setDepth(201)

    this.add
      .text(400, 290, 'Score: ' + this.score, {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: '#e879f9',
      })
      .setOrigin(0.5)
      .setDepth(201)

    this.add
      .text(400, 340, 'You eliminated all hostiles.', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#a1a1aa',
      })
      .setOrigin(0.5)
      .setDepth(201)

    const restartBtn = this.add
      .text(400, 400, '[ CLICK TO PLAY AGAIN ]', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#a1a1aa',
      })
      .setOrigin(0.5)
      .setDepth(201)
      .setInteractive({ useHandCursor: true })

    restartBtn.on('pointerdown', () => {
      this.scene.restart()
    })
  }
}