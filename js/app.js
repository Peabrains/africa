'use strict';

const App = (() => {
  const SCREENS = {
    itinerary: () => window.ItineraryScreen,
    map:       () => window.MapScreen,
    dex:       () => window.DexScreen,
    bookings:  () => window.BookingsScreen,
    sos:       () => window.SOSScreen,
  };

  let currentScreen = null;
  let currentModule = null;

  /* ── Stamp banner stub — Africa has no stamps, kept for API compat ── */
  function renderStampBanner() {}

  /* ── Screen switch ───────────────────────────────────────────── */
  function switchTo(name) {
    if (!(name in SCREENS)) return;
    currentModule?.destroy?.();

    document.querySelectorAll('.nav-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.screen === name)
    );

    const el = document.getElementById('screen-content');
    el.style.cssText = '';
    el.innerHTML    = '';
    el.scrollTop    = 0;
    el.classList.toggle('map-active', name === 'map');

    const sp = document.getElementById('stamp-persistent');
    if (sp) sp.style.display = 'none';

    currentScreen = name;
    currentModule = SCREENS[name]();
    currentModule.init(el);
    try { sessionStorage.setItem('lastScreen', name); } catch(_) {}
  }

  /* ── Sync status ─────────────────────────────────────────────── */
  function updateSyncStatus(state) {
    const el = document.getElementById('sync-badge');
    if (!el) return;
    const m = {
      synced:  ['badge-booked',  'Synced'],
      syncing: ['badge-pending', 'Syncing…'],
      offline: ['badge-open',    'Offline'],
      error:   ['badge-urgent',  'Sync error'],
    };
    const [cls, txt] = m[state] || m.offline;
    el.className   = `badge ${cls}`;
    el.textContent = txt;
  }

  function showConflict() {}
  function hideConflict() {}

  /* ── Urgent badge ────────────────────────────────────────────── */
  function updateUrgentBadge() {
    const el = document.getElementById('urgent-count');
    if (!el) return;
    const { urgent } = Data.getStats();
    el.textContent   = urgent;
    el.style.display = urgent > 0 ? 'flex' : 'none';
  }

  /* ── Connectivity ────────────────────────────────────────────── */
  function watchConnectivity() {
    window.addEventListener('online', async () => {
      if (Config.INSTANT_APP_ID) {
        updateSyncStatus('syncing');
        try   { await Sync.pushAll(); updateSyncStatus('synced'); }
        catch (_) { updateSyncStatus('error'); }
      }
    });
    window.addEventListener('offline', () => updateSyncStatus('offline'));
  }

  /* ── Service worker ──────────────────────────────────────────── */
  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('./sw.js')
      .then(r  => console.log('[SW] registered', r.scope))
      .catch(e => console.warn('[SW] failed', e));
  }

  /* ── Countdown ───────────────────────────────────────────────── */
  function renderCountdown() {
    const cEl = document.getElementById('countdown');
    if (!cEl) return;
    const today  = new Date(); today.setHours(0,0,0,0);
    const depart = new Date(Config.TRIP_DATE);
    const diff   = Math.ceil((depart - today) / 864e5);
    if      (diff > 1)  cEl.textContent = diff + ' days to go \uD83C\uDF0D';
    else if (diff === 1) cEl.textContent = 'Departing tomorrow! \uD83C\uDF0D';
    else if (diff === 0) cEl.textContent = 'Departure day! \u2708\uFE0F';
    else                 cEl.style.display = 'none';
  }

  /* ── Day-before push notifications ──────────────────────────── */
  async function scheduleDayBeforeReminders() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      const perm = await Notification.requestPermission().catch(() => 'denied');
      if (perm !== 'granted') return;
    }
    if (Notification.permission !== 'granted') return;

    const now = Date.now();
    Data.getDays().forEach(day => {
      const stops = Data.getStopsByDay(day.id);
      const firstFlight = stops.find(s => s.transportType === 'plane');
      const body = firstFlight
        ? 'First flight: ' + firstFlight.name + (firstFlight.time ? ' at ' + firstFlight.time : '')
        : 'Tomorrow: ' + day.title;

      // Parse date label e.g. "Mon 1 Sep" → use trip year
      const parts = day.date.match(/(\d+)\s+(\w+)/);
      if (!parts) return;
      const tripYear = new Date(Config.TRIP_DATE).getFullYear();
      const dayDate  = new Date(parts[1] + ' ' + parts[2] + ' ' + tripYear);
      if (isNaN(dayDate.getTime())) return;

      const reminderTime = dayDate.getTime() - (10 * 60 * 60 * 1000); // 10hrs before = eve prior
      if (reminderTime <= now) return;

      setTimeout(() => {
        new Notification('\uD83C\uDF0D Africa Safari \u2014 tomorrow is ' + day.label, {
          body,
          icon: './icons/icon-192.png',
          tag:  'africa-' + day.id,
        });
      }, reminderTime - now);
    });
  }

  /* ── Init (called by Auth.gate().then(() => App.init())) ─────── */
  async function init() {
    registerSW();
    await DB.init();

    console.log('[App] DB init done, SB:', typeof SB, 'Data:', typeof Data);

    let trips = [];
    try {
      trips = await Data.loadTrips?.() || [];
      console.log('[App] loadTrips count:', trips.length);
    } catch(e) {
      console.error('[App] loadTrips ERROR:', e.message);
    }

    if (!trips.length) {
      const content = document.getElementById('screen-content');
      if (content) content.innerHTML = `
        <div style="padding:var(--s6);text-align:center">
          <span style="font-size:48px">🌍</span>
          <p style="margin-top:var(--s3);font-size:var(--text-base);color:var(--text-primary);font-weight:500">No trips found</p>
          <button onclick="Auth.signOut()" style="margin-top:var(--s4);background:none;border:1.5px solid var(--border);border-radius:var(--r-md);padding:10px 20px;font-size:var(--text-sm);color:var(--text-secondary);cursor:pointer;font-family:var(--font)">Sign out</button>
        </div>`;
      return;
    }

    try {
      await Data.init();
      console.log('[App] Data.init done — days:', Data.getDays().length);
    } catch(e) {
      console.error('[App] Data.init ERROR:', e.message);
    }

    TripSwitcher?.init();


    watchConnectivity();
    updateUrgentBadge();
    renderCountdown();

    const tnEl = document.getElementById('header-trip-name');
    if (tnEl && Data.getTripName) tnEl.textContent = Data.getTripName();

    updateSyncStatus(Config.INSTANT_APP_ID && navigator.onLine ? 'syncing' : 'offline');

    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => switchTo(btn.dataset.screen));
    });

    document.getElementById('sync-btn')?.addEventListener('click', async () => {
      if (!Config.INSTANT_APP_ID) {
        Toast.show('No InstantDB App ID configured', 'warning');
        return;
      }
      updateSyncStatus('syncing');
      try {
        await Sync.pushAll();
        updateSyncStatus('synced');
        Toast.show('All data synced \u2713', 'success');
      } catch(e) {
        updateSyncStatus('error');
        Toast.show('Sync failed: ' + e.message, 'warning');
      }
    });

    let start = 'itinerary';
    try { start = sessionStorage.getItem('lastScreen') || 'itinerary'; } catch(_) {}
    switchTo(start);

    await Sync.init();
    scheduleDayBeforeReminders().catch(() => {});
  }

  return {
    init,
    switchTo,
    updateSyncStatus,
    updateUrgentBadge,
    showConflict,
    hideConflict,
    renderStampBanner,
    reload() { init(); },
  };
})();

/* ── SW-driven reload ────────────────────────────────────────── */
if (navigator.serviceWorker) {
  navigator.serviceWorker.addEventListener('message', e => {
    if (e.data && e.data.type === 'SW_UPDATED') {
  // New SW activated — show toast then reload to get fresh files
  if (window.Toast) Toast.show('App updated to ' + e.data.version + ' — refreshing…', 'info');
  setTimeout(() => window.location.reload(), 1500);
}
  });
}

/* ── DOMContentLoaded — SW version display + update checks ──────
   NOTE: App.init() is NOT called here — it is called by
   Auth.gate().then(() => App.init()) in index.html.            */
document.addEventListener('DOMContentLoaded', () => {
  if ('serviceWorker' in navigator) {
    let _swRefreshing = false;

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!_swRefreshing) {
        _swRefreshing = true;
        // Request version from new SW before reload
        if (navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({ type: 'GET_VERSION' });
        }
      }
    });

    // Show trip name in header
    const tripNameEl = document.getElementById('app-trip-name');
    if (tripNameEl) tripNameEl.textContent = Data.getCurrentTrip()?.name || 'Safari App';
    const vEl = document.getElementById('app-version-display');
    if (vEl) vEl.textContent = Config.APP_VERSION || 'v1';

    navigator.serviceWorker.ready.then(reg => {
      reg.update().catch(() => {});
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    });
  }
});

window.App = App;
