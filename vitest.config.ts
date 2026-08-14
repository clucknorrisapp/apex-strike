import { defineConfig } from 'vitest/config'

// Unit tests target the pure-logic + localStorage-backed game modules (meta, rank, daily, heat,
// splits, contracts, rush, leaderboard). They need no DOM or Phaser, so we run under the plain
// 'node' environment and stub localStorage in the setup file — fast, dependency-light, and isolated
// from the Vite/Phaser app build (which excludes *.test.ts via tsconfig.app.json).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
  },
})
