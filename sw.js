/* ============================================================
   SERVICE WORKER — Africa Safari PWA
   Cache version auto-bumps on every deploy via BUILD_TS
   BUILD: 202606292258
   ============================================================ */
const CACHE   = 'africa-safari-202606292258';
const VERSION = '202606292258';

const PRECACHE = [
  './', './index.html', './css/tokens.css', './css/print.css',
  './js/config.js', './js/db.js', './js/sync.js', './js/data.js',
  './js/icons.js', './js/toast.js', './js/bottom-sheet.js',
  './js/weather.js', './js/app.js', './js/auth.js',
  './js/screens/itinerary.js', './js/screens/map.js',
  './js/screens/bookings.js', './js/screens/sos.js',
];

/* ── Install: cache all app shell files ─────────────────────── */
self.addEventListener('install', e => {
  console.log('[SW] Installing version', VERSION);
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(PRECACHE))
      .then(() => {
        console.log('[SW] Precache complete, skipping waiting');
        return self.skipWaiting();   // activate immediately, don't wait
      })
  );
});

/* ── Activate: delete old caches, claim all tabs ────────────── */
self.addEventListener('activate', e => {
  console.log('[SW] Activating version', VERSION);
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(
        ks.filter(k => k !== CACHE).map(k => {
          console.log('[SW] Deleting old cache:', k);
          return caches.delete(k);
        })
      ))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .then(clients => {
        console.log('[SW] Notifying', clients.length, 'tab(s) to reload');
        clients.forEach(c => c.postMessage({ type: 'SW_UPDATED', version: VERSION }));
      })
  );
});

/* ── Fetch: routing strategy ────────────────────────────────── */
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // InstantDB sync — always network, never cache (auth data)
  if (url.hostname.includes('instantdb.com') || url.hostname.includes('getadb.com')) {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response('{}', { headers: { 'Content-Type': 'application/json' } })
      )
    );
    return;
  }

  // Weather — network only, no cache
  if (url.hostname.includes('open-meteo.com')) {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response('{}', { headers: { 'Content-Type': 'application/json' } })
      )
    );
    return;
  }

  // Map tiles — cache first (OSM tiles are stable)
  if (url.hostname.includes('tile.openstreetmap.org')) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return res;
        });
      })
    );
    return;
  }

  // Swahili phrase audio (Google Translate TTS) — cache first, same phrase plays offline forever after first listen
  if (url.hostname.includes('translate.google.com') && url.pathname.includes('translate_tts')) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request, { mode: 'no-cors' }).then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return res;
        });
      })
    );
    return;
  }

  // App shell — network first with cache fallback
  // This means: always try to get the freshest version,
  // fall back to cache if offline (critical for bush connectivity)
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => {
        return caches.match(e.request).then(cached => {
          if (cached) return cached;
          if (e.request.mode === 'navigate') return caches.match('./index.html');
        });
      })
  );
});

/* ── Message handler ────────────────────────────────────────── */
self.addEventListener('message', e => {
  if (e.data?.type === 'GET_VERSION') {
    e.source.postMessage({ type: 'SW_VERSION', version: VERSION });
  }
  if (e.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
