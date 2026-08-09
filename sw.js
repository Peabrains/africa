/* ============================================================
   SERVICE WORKER — Africa Safari PWA (design-lab branch)
   Cache version bumped manually alongside APP_VERSION.
   BUILD: 202608091450
   ============================================================ */
const CACHE   = 'africa-safari-lab-202608091450';
const VERSION = '202608091450';

const PRECACHE = [
  './', './index.html', './css/tokens.css', './css/print.css',
  './css/fonts/pjs-400.woff2', './css/fonts/pjs-500.woff2', './css/fonts/pjs-600.woff2',
  './css/fonts/pjs-700.woff2', './css/fonts/pjs-800.woff2',
  './css/fonts/fraunces-500.woff2', './css/fonts/fraunces-600.woff2',
  './manifest.json',
  './js/config.js', './js/db.js', './js/supabase.js',
  './js/data-platform.js', './js/trip-switcher.js', './js/auth.js',
  './js/icons.js', './js/toast.js', './js/bottom-sheet.js',
  './js/weather.js', './js/flight-price.js', './js/app.js',
  './js/screens/itinerary.js', './js/screens/map.js', './js/screens/dex.js',
  './js/screens/bookings.js', './js/screens/sos.js', './js/screens/stamps.js',
  './js/screens/food.js', './js/screens/landing.js', './js/screens/bucket-list.js',
  './js/screens/journal.js',
  './js/screens/account.js',
  './data/world-countries.geojson',
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

  // Supabase — always network, never cached, never routed through the
  // app-shell strategy below. That strategy's catch-all falls through to
  // `undefined` for any non-navigate request with no cache match, which
  // the browser turns into "FetchEvent.respondWith received an error:
  // Returned response is null" — a hard crash on the page's own fetch()
  // call. Every insert/update/delete/select the app makes goes through
  // Supabase, so this bypass matters a lot more than it looks: a single
  // flaky request (not even a full offline state) was enough to break
  // whatever action triggered it, with no queue/retry possible since the
  // page never got a real rejection to catch — it got a browser-level
  // TypeError instead.
  // Supabase — always network, never cached, never routed through the
  // app-shell strategy below. Deliberately does NOT call respondWith():
  // that requires a promise that RESOLVES to a Response even in the
  // failure case, so wrapping the fetch in respondWith(fetch(...)) still
  // crashes with the same "FetchEvent.respondWith received an error"
  // browser-level error whenever the fetch itself rejects (a genuine
  // network failure, not a SW bug) — it just showed a different inner
  // message ("Load failed" instead of "Returned response is null").
  // Not calling respondWith() at all tells the browser to handle this
  // request exactly as if there were no service worker, so a real
  // network failure comes back to the page as a normal fetch() rejection
  // that Supabase's client and our own try/catch blocks already know how
  // to handle gracefully — no browser-level crash possible either way.
  if (url.hostname.includes('supabase.co')) {
    return;
  }

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

  // CDN libraries (Supabase client, Leaflet) — cache first, same pattern as
  // OSM tiles. These are version-pinned URLs (e.g. @supabase/supabase-js@2)
  // so their content never changes; caching them long-term is safe.
  // Without this, a truly offline first-ever load can't even construct the
  // Supabase client (js/supabase.js throws synchronously if window.supabase
  // is missing), which breaks the entire data layer before app.js's own
  // error handling ever gets a chance to run.
  if (url.hostname.includes('cdn.jsdelivr.net')) {
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

  // App shell — network first with cache fallback
  // This means: always try to get the freshest version,
  // fall back to cache if offline (critical for bush connectivity)
  e.respondWith(
    fetch(e.request, { cache: 'no-store' })
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
