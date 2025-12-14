"use strict";
// DEVELOPMENT SERVICE WORKER
// This service worker is designed to force network requests for everything, ensuring you always see the latest version.

const CACHE_NAME = 'block-puzzle-dev-v1';

self.addEventListener('install', (event) => {
    // Force immediate activation
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    // Delete all old caches just in case
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => caches.delete(key))
            );
        }).then(() => {
            // Take control of all clients immediately
            return self.clients.claim();
        })
    );
});

self.addEventListener('fetch', (event) => {
    // Determine if it's a mutation request
    if (event.request.method !== 'GET') {
        return;
    }

    // Network Only Strategy
    // We intentionally do NOT match in cache.
    // If offline, this will fail, but that's acceptable for local dev iteration.
    event.respondWith(
        fetch(event.request, { 
            cache: 'no-store' // Tell the browser/server we don't want cached responses
        }).catch((error) => {
            console.error('Network fetch failed', error);
            // Optional: fallback to cache if you really want some offline cap during dev, 
            // but for "always latest version" requirements, failure is better than stale.
            return new Response('Offline - Connect to network for Dev Mode', { status: 503 });
        })
    );
});