const CACHE_NAME = 'saito-pos-v1';
const ASSETS_TO_CACHE = [
  '/admin/pos',
  '/admin/pos/kitchen',
  '/manifest.json',
  '/icon-192x192.png',
  '/icon-512x512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request).catch(() => {
        // Fallback for API calls or other dynamic data can be handled here if needed
      });
    })
  );
});
