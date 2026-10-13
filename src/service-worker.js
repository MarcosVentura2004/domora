/* eslint-disable no-restricted-globals */

// Domio service worker.
//
// Compiled by react-scripts (Workbox InjectManifest) into /service-worker.js.
// No Workbox runtime is imported: the build only injects the list of assets
// below, which also makes this file change on every deploy so the browser
// detects new versions.
//
// Strategy (priority: never a blank screen):
//   - Navigations (HTML): network-first. The cache is used ONLY when the
//     network fails. Last resort: /offline.html.
//   - Hashed assets under /static/: cache-first (their URL changes when their
//     content changes, so they can never be stale).
//   - Everything else (Supabase, Stripe, any cross-origin request, any
//     non-GET request, public/ files without hash): untouched, straight to
//     the network.
//   - A new version waits until the user taps "Actualizar" in the app
//     (message SKIP_WAITING). No automatic skipWaiting, no forced reloads.

const BUILD_MANIFEST = self.__WB_MANIFEST || [];

const CACHE_PREFIX = 'domio-';
const STATIC_CACHE = 'domio-static-v1';
const PAGES_CACHE = 'domio-pages-v1';
const CACHES_IN_USE = [STATIC_CACHE, PAGES_CACHE];

const SHELL_KEY = '/index.html';
const OFFLINE_URL = '/offline.html';

const manifestUrls = BUILD_MANIFEST.map(
  (entry) => new URL(typeof entry === 'string' ? entry : entry.url, self.location.origin).pathname
);

// Only the app entry points are precached (not the heavy lazy chunks such as
// exceljs/jspdf), so the cached shell can boot offline.
const PRECACHE_STATIC = manifestUrls.filter((path) =>
  /^\/static\/(js|css)\/main\.[0-9a-f]+\.(js|css)$/.test(path)
);

function isHtmlResponse(response) {
  const type = response.headers.get('content-type') || '';
  return type.includes('text/html');
}

// SPA routes have no file extension (/, /planes, /reset-password...).
// Static HTML files (/legal/*.html, /offline.html) must not replace the shell.
function isAppRoute(url) {
  return !/\.[a-z0-9]+$/i.test(url.pathname) && !url.pathname.startsWith('/.well-known/');
}

async function fetchFresh(path) {
  const response = await fetch(new Request(path, { cache: 'reload' }));
  if (!response.ok) throw new Error(`Precache failed for ${path}: ${response.status}`);
  return response;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const [pages, statics] = await Promise.all([
        caches.open(PAGES_CACHE),
        caches.open(STATIC_CACHE),
      ]);
      const offline = await fetchFresh(OFFLINE_URL);
      await pages.put(OFFLINE_URL, offline);

      const shell = await fetchFresh('/index.html');
      if (isHtmlResponse(shell)) await pages.put(SHELL_KEY, shell);

      await Promise.all(
        PRECACHE_STATIC.map(async (path) => {
          const response = await fetchFresh(path);
          if (!isHtmlResponse(response)) await statics.put(path, response);
        })
      );
    })()
  );
  // Intentionally NO self.skipWaiting() here: the app asks the user first.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Drop caches from older service workers (e.g. legacy "domio-shell-v2").
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && !CACHES_IN_USE.includes(key))
          .map((key) => caches.delete(key))
      );

      // Prune hashed assets that no longer belong to this build.
      if (manifestUrls.length > 0) {
        const current = new Set(manifestUrls);
        const statics = await caches.open(STATIC_CACHE);
        const requests = await statics.keys();
        await Promise.all(
          requests
            .filter((request) => !current.has(new URL(request.url).pathname))
            .map((request) => statics.delete(request))
        );
      }
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

async function handleNavigation(request) {
  const url = new URL(request.url);
  try {
    const response = await fetch(request);
    if (
      response.ok &&
      !response.redirected &&
      isAppRoute(url) &&
      isHtmlResponse(response)
    ) {
      const pages = await caches.open(PAGES_CACHE);
      await pages.put(SHELL_KEY, response.clone());
    }
    return response;
  } catch (err) {
    // No network: last known app shell, otherwise the offline page.
    const pages = await caches.open(PAGES_CACHE);
    const cached = isAppRoute(url) ? await pages.match(SHELL_KEY) : undefined;
    if (cached) return cached;
    const offline = await pages.match(OFFLINE_URL);
    if (offline) return offline;
    return new Response(
      '<!DOCTYPE html><html lang="es"><meta charset="utf-8"><title>Sin conexión</title><p>Sin conexión a internet.</p></html>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
}

async function handleStaticAsset(request) {
  const statics = await caches.open(STATIC_CACHE);
  const cached = await statics.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  // Never store error pages or the SPA fallback (index.html served for a
  // missing chunk) under a JS/CSS URL.
  if (response.ok && response.type === 'basic' && !isHtmlResponse(response)) {
    await statics.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Supabase, Stripe and any other external API: never touched.
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }

  if (url.pathname.startsWith('/static/') && !request.headers.has('range')) {
    event.respondWith(handleStaticAsset(request));
  }
  // Anything else (manifest, icons, /.well-known/, public/ files): network.
});
