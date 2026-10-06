/* PackPlanner service worker — issue #157 (StoreReadiness A1).
 *
 * Strategy:
 *  - App shell (HTML/manifest/icons): precached on install, refreshed on activate.
 *  - Navigations: network-first, cached shell as offline fallback.
 *  - Same-origin static assets (hashed JS/CSS/images/fonts): cache-first,
 *    fetched and stored on first use.
 *  - /api/* : NEVER cached. API responses contain user data (trips, checklist,
 *    JWT-backed payloads) and must not survive in a shared cache.
 */
const VERSION = 'v1';
const SHELL_CACHE = `packplanner-shell-${VERSION}`;
const RUNTIME_CACHE = `packplanner-runtime-${VERSION}`;

const SHELL_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/logo192.png',
  '/logo512.png',
  '/favicon.ico',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== RUNTIME_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

function isApiRequest(url) {
  return url.pathname === '/api' || url.pathname.startsWith('/api/');
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Cross-origin (fonts CDN, analytics, ...): let the network handle it.
  if (url.origin !== self.location.origin) return;
  // API calls: network only — never cached, never served from cache.
  if (isApiRequest(url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches
              .open(SHELL_CACHE)
              .then((cache) => cache.put('/index.html', copy))
              .catch(() => {});
          }
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Static assets: cache-first (build output is content-hashed), network fallback.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response && response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches
            .open(RUNTIME_CACHE)
            .then((cache) => cache.put(request, copy))
            .catch(() => {});
        }
        return response;
      });
    })
  );
});
