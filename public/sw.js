const CACHE_NAME = 'domio-shell-v2';
const OFFLINE_URL = '/offline.html';

// Do NOT cache '/' (index.html) — it must always be fetched fresh so new
// deployments are picked up immediately.
const SHELL_ASSETS = [
  '/offline.html',
  '/manifest.json',
  '/favicon.ico',
  '/icon-192.png',
  '/icon-512.png',
];

// Supabase domains that must always go to the network (never cache auth/data)
const BYPASS_ORIGINS = [
  'supabase.co',
  'supabase.com',
];

function isBypass(url) {
  return BYPASS_ORIGINS.some((origin) => url.hostname.includes(origin));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Always pass Supabase requests directly to the network
  if (isBypass(url)) {
    return;
  }

  // Only handle GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(event.request).catch(() => {
        // For navigation requests show the offline page
        if (event.request.mode === 'navigate') {
          return caches.match(OFFLINE_URL);
        }
      });
    })
  );
});
