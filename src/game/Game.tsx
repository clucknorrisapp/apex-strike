import { useEffect, useRef } from 'react'
import Phaser from 'phaser'
import { MainScene } from './MainScene'

export function Game() {
  const gameRef = useRef<Phaser.Game | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      width: 800,
      height: 600,
      parent: containerRef.current,
      backgroundColor: '#07070f',
      physics: {
        default: 'arcade',
        arcade: {
          gravity: { x: 0, y: 950 },
          debug: false,
        },
      },
      scene: [MainScene],
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      input: {
        keyboard: true,
      },
    }

    gameRef.current = new Phaser.Game(config)

    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true)
        gameRef.current = null
      }
    }
  }, [])

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-2">
      <div className="w-full max-w-4xl">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-bold tracking-wider text-fuchsia-400">APEX STRIKE</span>
          <span className="text-zinc-500 text-xs">v0.2 — Playable Prototype</span>
        </div>

        <div
          ref={containerRef}
          className="rounded-lg overflow-hidden border border-zinc-800 shadow-2xl shadow-fuchsia-950/40 bg-zinc-950"
          style={{ aspectRatio: '4/3' }}
        />

        <div className="mt-3 text-center text-xs text-zinc-500">
          <span className="text-zinc-400">Controls:</span> A/D or Arrow Keys = Move &nbsp;|&nbsp; W or Up = Jump &nbsp;|&nbsp; Space = Shoot
        </div>
      </div>
    </div>
  )
}