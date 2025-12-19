import { VitePWA } from "vite-plugin-pwa"
import { defineConfig } from "vite"

export default defineConfig({
	plugins: [
		VitePWA({
			selfDestroying: true,
			filename: "service-worker.js",
			injectRegister: false, // We'll keep our manual registration in index.html for now, or let PWA handle it
			manifest: false, // We already have a manifest.json
		}),
	],
	test: {
		environment: "jsdom", // or 'node'
	},
	server: {
		host: "0.0.0.0", // Force IPv4 binding (most compatible with iPhone)
		port: 3000, // Use the port you confirmed works
		strictPort: true,
		hmr: {
			host: "matt.local", // Tell the HMR client to use your network name
		},
		proxy: {
			"/api": {
				target: "http://localhost:3001",
				changeOrigin: true,
			},
		},
	},
})
