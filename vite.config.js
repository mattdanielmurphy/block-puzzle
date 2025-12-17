import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    VitePWA({
      selfDestroying: true,
      filename: 'service-worker.js',
      injectRegister: false, // We'll keep our manual registration in index.html for now, or let PWA handle it
      manifest: false, // We already have a manifest.json
    })
  ],
  test: {
    environment: 'jsdom', // or 'node'
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
