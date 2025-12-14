const CACHE_NAME = 'block-sudoku-v1';
const ASSETS = [
    './',
    './index.html',
    './styles.css',
    './manifest.json',
    './dist/src/main.js',
    './dist/src/engine/logic.js',
    './dist/src/engine/rng.js',
    './dist/src/engine/shapes.js',
    './dist/src/engine/types.js',
    './dist/src/ui/renderer.js',
    './dist/src/ui/input.js',
    './dist/src/ui/theme.js'
    // Icons would go here
];

self.addEventListener('install', (event: any) => { // : any to bypass TS lib issues if not configured
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('Generous caching of app shell');
            return cache.addAll(ASSETS);
        })
    );
});

self.addEventListener('activate', (event: any) => {
    event.waitUntil(
        caches.keys().then(keys => Promise.all(
            keys.map(key => {
                if (key !== CACHE_NAME) return caches.delete(key);
            })
        ))
    );
});

self.addEventListener('fetch', (event: any) => {
    event.respondWith(
        caches.match(event.request).then(response => {
            return response || fetch(event.request);
        })
    );
});
