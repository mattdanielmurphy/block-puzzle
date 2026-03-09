import { VitePWA } from "vite-plugin-pwa"
import { defineConfig } from "vite"

export default defineConfig({
	plugins: [
		VitePWA({
			devOptions: {
				enabled: true,
				type: "module", // Add this for dev testing
			},
			strategies: "generateSW", // ← Add this explicitly
			registerType: "autoUpdate",
			includeAssets: ["favicon.ico", "apple-touch-icon.png"], // ← Removed assets/*.jpg
			workbox: {
				globPatterns: ["**/*.{js,css,html,ico,png,svg,jpg,jpeg,json}"], // This already covers JPGs
				navigateFallback: "index.html", // Remove leading slash
				navigateFallbackDenylist: [/^\/api\//],
				ignoreURLParametersMatching: [/^v$/], // Ignore the ?v= timestamp from build.js
			},
			manifest: {
				name: "Blockdoku",
				short_name: "Blockdoku",
				start_url: "/",
				scope: "/",
				display: "standalone",
				background_color: "#050815",
				theme_color: "#303ce1ff",
				description: "Offline Block Puzzle Game",
				icons: [
					{
						src: "/apple-touch-icon.png",
						sizes: "180x180",
						type: "image/png",
					},
				],
			},
		}),
	],
	test: {
		environment: "jsdom",
	},
	server: {
		allowedHosts: ["08b1d5688b96.ngrok-free.app", "blockdoku.vercel.app"],
		host: "0.0.0.0",
		port: 3000,
		strictPort: true,
		hmr: {
			host: "matt.local",
		},
		proxy: {
			"/api": {
				target: "http://localhost:3001",
				changeOrigin: true,
			},
		},
	},
})
