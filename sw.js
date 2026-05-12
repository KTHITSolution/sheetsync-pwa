const CACHE_NAME = 'mybank-product-v1'; // <--- BUMPED VERSION
const ASSETS = [
  './',
  './index.html',
  './config.js',
  './manifest.json',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './idb.js',     // <--- Added
  './chart.js'    // <--- Added
];

// 1. Install Phase
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// 2. Activate Phase
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 3. Fetch Phase
self.addEventListener('fetch', (e) => {
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then((response) => {
      return response || fetch(e.request);
    })
  );
});