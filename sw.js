/**
 * YooService — sw.js (Service Worker)
 * Version: 2.0
 * Strategy: Cache-First for assets, Network-First for HTML
 */

const CACHE_NAME = 'yooservice-v2';
const STATIC_CACHE = 'yooservice-static-v2';
const DYNAMIC_CACHE = 'yooservice-dynamic-v2';

// Core assets to cache immediately on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/manifest.json',
  '/img/og-image.jpg',
  '/offline.html',
];

// External resources to cache
const EXTERNAL_ASSETS = [
  'https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800;900&family=Instrument+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css',
];

/* ── INSTALL ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('[SW] Some static assets failed to cache:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

/* ── ACTIVATE ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== STATIC_CACHE && key !== DYNAMIC_CACHE)
          .map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

/* ── FETCH ── */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip Formspree and analytics
  if (url.hostname === 'formspree.io' || url.hostname.includes('google-analytics')) return;

  // HTML: Network-first, fall back to cache, then offline page
  if (request.headers.get('Accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone();
          caches.open(DYNAMIC_CACHE).then(cache => cache.put(request, clone));
          return response;
        })
        .catch(() => {
          return caches.match(request)
            .then(cached => cached || caches.match('/offline.html'));
        })
    );
    return;
  }

  // Images: Cache-first
  if (request.destination === 'image') {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          const clone = response.clone();
          caches.open(DYNAMIC_CACHE).then(cache => cache.put(request, clone));
          return response;
        });
      })
    );
    return;
  }

  // CSS/JS/Fonts: Stale-while-revalidate
  if (['style', 'script', 'font'].includes(request.destination)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(cache => {
        return cache.match(request).then(cached => {
          const networkFetch = fetch(request).then(response => {
            cache.put(request, response.clone());
            return response;
          });
          return cached || networkFetch;
        });
      })
    );
    return;
  }

  // Default: Network-first
  event.respondWith(
    fetch(request)
      .then(response => {
        const clone = response.clone();
        caches.open(DYNAMIC_CACHE).then(cache => cache.put(request, clone));
        return response;
      })
      .catch(() => caches.match(request))
  );
});

/* ── BACKGROUND SYNC ── */
self.addEventListener('sync', event => {
  if (event.tag === 'sync-form') {
    event.waitUntil(syncOfflineForms());
  }
});

async function syncOfflineForms() {
  // Retry any forms submitted offline
  const cache = await caches.open(DYNAMIC_CACHE);
  // Implementation depends on IndexedDB setup
}

/* ── PUSH NOTIFICATIONS (optional) ── */
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  self.registration.showNotification(data.title || 'YooService', {
    body: data.body || 'New message from YooService',
    icon: '/img/icon-192.png',
    badge: '/img/icon-72.png',
    vibrate: [200, 100, 200],
    data: { url: data.url || '/' }
  });
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data?.url || '/')
  );
});
