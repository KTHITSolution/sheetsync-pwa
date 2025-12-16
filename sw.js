const CACHE_NAME = 'mybank-v11';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  'https://cdn.jsdelivr.net/npm/idb@7/build/umd.js',
  'https://cdn.jsdelivr.net/npm/chart.js' // Critical: Cache external lib
];

// 1. Install Phase: Cache assets
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// 2. Fetch Phase: Serve from Cache, then Network
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => {
      return response || fetch(e.request);
    })
  );
});