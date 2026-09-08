// KisanSetu Advanced Service Worker - Full Mobile Offline & PWA Engine
const CACHE_NAME = 'kisansetu-app-v3.2';
const DATA_CACHE_NAME = 'kisansetu-data-v3.2';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/style.css',
  '/images/logo.png',
  '/js/api.js',
  '/js/i18n.js',
  '/js/app.js',
  '/js/farmer.js',
  '/js/buyer.js',
  '/js/logistics_hook.js',
  '/js/admin.js',
  '/js/map.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const asset of STATIC_ASSETS) {
        try {
          await cache.add(asset);
        } catch (err) {
          console.warn('SW pre-cache warning for asset:', asset, err);
        }
      }
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME && key !== DATA_CACHE_NAME) {
            console.log('Purged outdated KisanSetu cache:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Interceptor: Network-First for HTML/Scripts/Styles to ensure instant visibility of code changes
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // 1. API Requests - Network First, fallback to cached API responses
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const respClone = response.clone();
            caches.open(DATA_CACHE_NAME).then((cache) => {
              cache.put(event.request, respClone);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(event.request).then((cached) => {
            if (cached) {
              return cached;
            }
            return new Response(JSON.stringify({ 
              success: false, 
              offline: true, 
              message: "You are currently offline. Displaying cached data." 
            }), {
              headers: { "Content-Type": "application/json" }
            });
          });
        })
    );
    return;
  }

  // 2. Static Assets, Navigation & Pages - Network First (instant live updates), Fallback to Cache
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const respClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, respClone);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          if (event.request.headers.get('accept') && event.request.headers.get('accept').includes('text/html')) {
            return caches.match('/') || caches.match('/index.html');
          }
        });
      })
  );
});
