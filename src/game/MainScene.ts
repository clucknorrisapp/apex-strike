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
  private bullets!: Phaser.Physics.Arcade.Group
  private lastFired = 0
  private fireRate = 200 // ms between shots

  constructor() {
    super({ key: 'MainScene' })
  }

  preload() {
    // Temporary colored rectangles until real art is added
    // Player (cyan rectangle)
    this.load.image('player', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAFElEQVR42mNk+M9Qz0AEYBxVSF+FABJADveWkH6aAAAAAElFTkSuQmCC')
  }

  create() {
    // Background
    this.cameras.main.setBackgroundColor('#0a0a12')

    // Simple ground
    const ground = this.add.rectangle(400, 580, 800, 40, 0x1a1a2e)
    this.physics.add.existing(ground, true)

    // Player
    this.player = this.physics.add.sprite(120, 500, 'player')
    this.player.setDisplaySize(32, 48)
    this.player.setTint(0x22d3ee) // cyan
    this.player.setCollideWorldBounds(true)
    this.player.setBounce(0.1)

    // Collide with ground
    this.physics.add.collider(this.player, ground)

    // Controls
    this.cursors = this.input.keyboard!.createCursorKeys()
    this.wasd = {
      up: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    }

    // Bullets group
    this.bullets = this.physics.add.group({
      classType: Phaser.Physics.Arcade.Image,
      maxSize: 30,
      runChildUpdate: true,
    })

    // Instructions text
    this.add
      .text(16, 16, 'A/D or \u2190\u2192 Move  |  W/\u2191 Jump  |  SPACE Shoot', {
        fontSize: '14px',
        color: '#a1a1aa',
      })
      .setScrollFactor(0)

    this.add
      .text(16, 36, 'Apex Strike \u2014 Prototype Scene', {
        fontSize: '12px',
        color: '#71717a',
      })
      .setScrollFactor(0)
  }

  update(time: number) {
    if (!this.player || !this.player.body) return

    const speed = 220
    const body = this.player.body as Phaser.Physics.Arcade.Body

    // Horizontal movement
    if (this.cursors.left.isDown || this.wasd.left.isDown) {
      this.player.setVelocityX(-speed)
      this.player.setFlipX(true)
    } else if (this.cursors.right.isDown || this.wasd.right.isDown) {
      this.player.setVelocityX(speed)
      this.player.setFlipX(false)
    } else {
      this.player.setVelocityX(0)
    }

    // Jump
    if ((this.cursors.up.isDown || this.wasd.up.isDown) && body.blocked.down) {
      this.player.setVelocityY(-420)
    }

    // Shoot
    const spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)
    if (spaceKey.isDown && time > this.lastFired) {
      this.fireBullet()
      this.lastFired = time + this.fireRate
    }
  }

  private fireBullet() {
    const bullet = this.bullets.get(this.player.x, this.player.y - 8) as Phaser.Physics.Arcade.Image

    if (bullet) {
      bullet.setActive(true)
      bullet.setVisible(true)
      bullet.setDisplaySize(10, 4)
      bullet.setTint(0xf0abfc) // pink/fuchsia

      const direction = this.player.flipX ? -1 : 1
      bullet.setVelocityX(direction * 520)
      bullet.setVelocityY(0)

      // Auto destroy after leaving screen
      this.time.delayedCall(1500, () => {
        if (bullet.active) {
          bullet.setActive(false)
          bullet.setVisible(false)
        }
      })
    }
  }
}