import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    host: true,
  },
  build: {
    // Split the heavy vendor trees into their own chunks. One 1.9MB monolith
    // spikes Rollup's peak memory during the build — the likely cause of the
    // deploy host killing (OOM) the build. Separate chunks lower that peak and
    // are individually cacheable by the browser.
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('phaser')) return 'phaser'
          if (/[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react'
          if (/@reown|@walletconnect|wagmi|viem|@tanstack|ox[\\/]/.test(id)) return 'wallet'
        },
      },
    },
  },
})
