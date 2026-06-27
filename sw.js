const CACHE = 'japan-trip-v29';

const PRECACHE = [
  './', './index.html', './css/tokens.css', './css/print.css',
  './js/config.js', './js/db.js', './js/sync.js', './js/data.js',
  './js/icons.js', './js/toast.js', './js/bottom-sheet.js',
  './js/weather.js', './js/app.js',
  './js/screens/itinerary.js', './js/screens/map.js',
  './js/screens/bookings.js', './js/screens/sos.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // GAS API — network only, offline JSON fallback
  if (url.hostname.includes('script.google.com')) {
    e.respondWith(fetch(e.request).catch(() =>
      new Response(JSON.stringify({ ok:false, data:{ error:'offline' } }), { headers:{'Content-Type':'application/json'} })
    ));
    return;
  }

  // Open-Meteo weather — network first, no cache (stale weather is useless)
  if (url.hostname.includes('open-meteo.com')) {
    e.respondWith(fetch(e.request).catch(() => new Response('{}', { headers:{'Content-Type':'application/json'} })));
    return;
  }

  // Map tiles — cache first, long TTL (tiles don't change)
  if (url.hostname.includes('tile.openstreetmap.org')) {
    e.respondWith(caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      });
    }));
    return;
  }

  // Everything else — cache first, fall back to network
  e.respondWith(caches.match(e.request).then(cached => {
    if (cached) return cached;
    return fetch(e.request).then(res => {
      if (res.status === 200) {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return res;
    }).catch(() => {
      if (e.request.mode === 'navigate') return caches.match('./index.html');
    });
  }));
});
