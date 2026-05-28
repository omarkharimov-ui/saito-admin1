const CACHE_NAME = 'saito-admin-v1';
const urlsToCache = [
  '/',
  '/manifest.json',
  '/icon-192x192.png',
  '/icon-512x512.png',
  '/favicon.svg',
  '/favicon-dark.svg',
  '/apple-touch-icon.png'
];

// Install event - cache resources with error handling
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        // Cache each URL individually to handle errors
        return Promise.all(
          urlsToCache.map(url => 
            cache.add(url).catch(err => {
              console.log(`Failed to cache ${url}:`, err);
              // Don't fail the entire installation if one file fails
              return Promise.resolve();
            })
          )
        );
      })
      .then(() => self.skipWaiting())
      .catch(err => {
        console.log('Service worker installation failed:', err);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
    .catch(err => {
      console.log('Service worker activation failed:', err);
    })
  );
});

// Fetch event - serve from cache when offline with better error handling
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests and external resources
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Return cached version or fetch from network
        if (response) {
          return response;
        }
        
        return fetch(event.request).catch(err => {
          console.log(`Failed to fetch ${event.request.url}:`, err);
          // Return a basic offline page for HTML requests
          if (event.request.headers.get('accept')?.includes('text/html')) {
            return new Response(`
              <!DOCTYPE html>
              <html>
                <head>
                  <title>Offline - Saito Admin</title>
                  <meta name="viewport" content="width=device-width, initial-scale=1">
                  <style>
                    body { 
                      font-family: system-ui, -apple-system, sans-serif; 
                      background: #0a0a0a; 
                      color: white; 
                      display: flex; 
                      align-items: center; 
                      justify-content: center; 
                      height: 100vh; 
                      margin: 0; 
                      text-align: center;
                    }
                    .container { max-width: 400px; padding: 20px; }
                    h1 { color: #D4AF37; margin-bottom: 20px; }
                    p { color: #ccc; line-height: 1.6; }
                    button { 
                      background: #D4AF37; 
                      color: black; 
                      border: none; 
                      padding: 12px 24px; 
                      border-radius: 8px; 
                      cursor: pointer; 
                      font-weight: bold;
                      margin-top: 20px;
                    }
                  </style>
                </head>
                <body>
                  <div class="container">
                    <h1>Offline</h1>
                    <p>You are currently offline. Please check your internet connection and try again.</p>
                    <button onclick="window.location.reload()">Retry</button>
                  </div>
                </body>
              </html>
            `, {
              status: 200,
              statusText: 'OK',
              headers: { 'Content-Type': 'text/html' }
            });
          }
          
          // For other failed requests, just let them fail
          throw err;
        });
      })
  );
});
