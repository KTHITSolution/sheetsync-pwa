const CACHE_NAME = 'mybank-v38'; // <--- ALWAYS bump this version when you update code!
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  'https://cdn.jsdelivr.net/npm/idb@7/build/umd.js',
  'https://cdn.jsdelivr.net/npm/chart.js'
];

// 1. Install Phase: Cache assets AND Skip Waiting
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  // CRITICAL FIX: Force this new SW to become active immediately
  self.skipWaiting();
});

// 2. Activate Phase: Clean up old caches AND Claim Clients
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          // If the cache name is NOT the current one, delete it
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  // CRITICAL FIX: Tell the new SW to take control of all open tabs right now
  self.clients.claim();
});

// 3. Fetch Phase: Stale-While-Revalidate Strategy for HTML
// (This ensures you see new content faster in the future)
self.addEventListener('fetch', (e) => {
  // For the main HTML file, try Network first, fallback to Cache
  // This helps prevent getting stuck on old versions
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }

  // For other assets (images, JS), keep doing Cache First for speed
  e.respondWith(
    caches.match(e.request).then((response) => {
      return response || fetch(e.request);
    })
  );
});