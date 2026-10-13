// Legacy service worker. Replaced by /service-worker.js (built from
// src/service-worker.js), which the app now registers instead.
//
// This file is kept so browsers that still have the old registration and
// check this URL for updates receive a harmless worker: it has NO fetch
// handler (every request goes straight to the network), it only deletes the
// old cache and does not reload any page. Do not delete this file.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('domio-shell-'))
          .map((key) => caches.delete(key))
      )
    )
  );
});
