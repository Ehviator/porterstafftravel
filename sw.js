// Bump when changing cached URLs or fetch strategy (must match docs / README; sync copies to vite-scaffold/public)
const CACHE_NAME = 'porter-travel-v13';

/** Same-origin API — never cache (avoids stale/wrong travel-log per employeeId). */
function isSameOriginApiRequest(request) {
  try {
    const url = new URL(request.url);
    return url.origin === self.location.origin && url.pathname.startsWith('/api/');
  } catch {
    return false;
  }
}

const CACHEABLE_CDN_HOSTS = new Set([
  'unpkg.com',
  'cdn.tailwindcss.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
]);

/** Runtime cache: hashed Vite chunks, legacy /js, images, CDNs — not arbitrary HTML/JSON shells. */
function shouldWriteToRuntimeCache(request) {
  try {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return false;
    if (url.origin === self.location.origin) {
      const p = url.pathname;
      if (p.startsWith('/assets/')) return true;
      if (p.startsWith('/js/')) return true;
      if (p.endsWith('.png') || p.endsWith('.jpg') || p.endsWith('.jpeg') || p.endsWith('.webp') || p.endsWith('.svg') || p.endsWith('.ico')) return true;
      return false;
    }
    return CACHEABLE_CDN_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

/** Always try; failures are ignored (legacy vs Vite paths differ). */
async function precacheUrl(cache, url) {
  try {
    await cache.add(new Request(url, { cache: 'reload' }));
  } catch (e) {
    console.warn('[SW] precache skip:', url, e && e.message ? e.message : e);
  }
}

async function precacheAll(cache, urls) {
  await Promise.all(urls.map((u) => precacheUrl(cache, u)));
}

// Stable on both legacy HTML and Vite builds (copied into dist/public)
const STABLE_CORE = [
  './',
  './index.html',
  './translations-fr.js',
  './manifest.json',
  './js/mytrips-timezones.js',
  './js/flystandby-airline-logos.js',
];

// Legacy Babel-in-browser entry only — often absent when serving vite-scaffold/dist
const LEGACY_CORE = [
  './indexTEST.html',
  './js/gantt-timeline.jsx',
  './js/mytrips-route-map.jsx',
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/react@18/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
  'https://unpkg.com/@babel/standalone@7.26.0/babel.min.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await precacheAll(cache, STABLE_CORE);
      await precacheAll(cache, LEGACY_CORE);
      try {
        const res = await fetch(new Request('./precache-manifest.json', { cache: 'reload' }));
        if (res.ok) {
          const body = await res.json();
          const list = body && Array.isArray(body.assets) ? body.assets : [];
          await precacheAll(cache, list);
        }
      } catch (e) {
        console.warn('[SW] precache-manifest optional fetch failed', e);
      }
    })()
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

function offlineNavigateFallback() {
  return caches
    .match('/index.html')
    .then((r) => r || caches.match('/'))
    .then((r) => r || caches.match('./index.html'))
    .then((r) => r || caches.match('./'))
    .then((r) => r || caches.match('./indexTEST.html'));
}

function isSameOriginAssetsRequest(request) {
  try {
    const url = new URL(request.url);
    return url.origin === self.location.origin && url.pathname.startsWith('/assets/');
  } catch {
    return false;
  }
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  if (isSameOriginApiRequest(event.request)) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(
          JSON.stringify({
            error: 'offline',
            message: 'Travel log sync requires a network connection.',
          }),
          {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
          }
        );
      })
    );
    return;
  }

  // Navigation: network-first, then cached document, then offline shell
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => response)
        .catch(() =>
          caches.match(event.request).then((cached) => cached || offlineNavigateFallback())
        )
    );
    return;
  }

  // Hashed build assets: cache-first (filenames are content-addressed)
  if (isSameOriginAssetsRequest(event.request)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        });
      })
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200 && shouldWriteToRuntimeCache(event.request)) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          return new Response('Offline — content not cached', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({ 'Content-Type': 'text/plain' }),
          });
        });
      })
  );
});
