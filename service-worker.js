const CACHE_NAME = "block-puzzle-v1"
const ASSETS = [
	"./",
	"./index.html",
	"./styles.css",
	"./manifest.json",
	"./dist/src/main.js",
	"./dist/src/engine/logic.js",
	"./dist/src/engine/replay.js",
	"./dist/src/engine/rng.js",
	"./dist/src/engine/shapes.js",
	"./dist/src/engine/types.js",
	"./dist/src/ui/effects.js",
	"./dist/src/ui/input.js",
	"./dist/src/ui/renderer.js",
	"./dist/src/ui/replay-player.js",
	"./dist/src/ui/theme.js",
	"./dist/src/ui/tutorial.js",
	"./dist/src/version.js",
]

self.addEventListener("install", (event) => {
	// Force the waiting service worker to become the active service worker.
	self.skipWaiting()
	event.waitUntil(
		caches.open(CACHE_NAME).then((cache) => {
			console.log("Caching app shell")
			return cache.addAll(ASSETS)
		})
	)
})

self.addEventListener("activate", (event) => {
	event.waitUntil(
		Promise.all([
			// Take control of all clients immediately
			clients.claim(),
			// Clean up old caches
			caches.keys().then((keys) =>
				Promise.all(
					keys.map((key) => {
						if (key !== CACHE_NAME) {
							console.log("Deleting old cache:", key)
							return caches.delete(key)
						}
					})
				)
			),
		])
	)
})

self.addEventListener("fetch", (event) => {
	event.respondWith(
		caches.match(event.request).then((response) => {
			// Cache hit - return response
			if (response) {
				return response
			}
			return fetch(event.request)
		})
	)
})
