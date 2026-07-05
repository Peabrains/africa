'use strict';

const App = (() => {
  const SCREENS = {
    itinerary: () => window.ItineraryScreen,
    map:       () => window.MapScreen,
    dex:       () => window.DexScreen,
    stamps:    () => window.StampsScreen,
    bookings:  () => window.BookingsScreen,
    sos:       () => window.SOSScreen,
    landing:   () => window.LandingScreen,
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

      // day.date is a real ISO date (YYYY-MM-DD) from Supabase
      const dayDate = new Date(day.date + 'T00:00:00');
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
    // Debug logging — console only (no visible overlay)
    function dbg(msg, col) {
      if (col === '#f66') console.error('[App]', msg);
      else console.log('[App]', msg);
    }

    dbg('SB: ' + (typeof SB) + ' | Data: ' + (typeof Data));

    try {
      await DB.init();
      dbg('DB.init ✓');
    } catch(e) { dbg('DB.init ✗ ' + e.message, '#f66'); }

    let trips = [];
    try {
      trips = await Data.loadTrips?.() || [];
      dbg('loadTrips ✓ count:' + trips.length);
      if (trips[0]) dbg('trip: ' + trips[0].name);
    } catch(e) { dbg('loadTrips ✗ ' + e.message, '#f66'); }

    if (!trips.length) {
      dbg('NO TRIPS — stopping', '#f66');
      const content = document.getElementById('screen-content');
      if (content) content.innerHTML = `
        <div style="padding:var(--s6);text-align:center">
          <span style="font-size:48px">🧭</span>
          <p style="margin-top:var(--s3);font-size:var(--text-base);font-weight:500">No trips found</p>
          <button onclick="Auth.signOut()" style="margin-top:var(--s4);background:none;border:1.5px solid var(--border);border-radius:var(--r-md);padding:10px 20px;font-size:var(--text-sm);cursor:pointer;font-family:var(--font)">Sign out</button>
        </div>`;
      return;
    }

    try {
      await Data.init();
      dbg('Data.init ✓ days:' + Data.getDays().length);
    } catch(e) { dbg('Data.init ✗ ' + e.message, '#f66'); }

    // Third nav slot is trip-conditional: Dex (wildlife) for Africa-style
    // trips, Pilgrim Stamps for Japan-style trips. Never both at once —
    // this can only run after Data.init(), since it needs to know which
    // trip is actually active.
    try {
      const isStampTrip = Data.getTripCurrency?.() === 'JPY';
      const navBtns = document.querySelectorAll('.nav-btn');
      const thirdBtn = navBtns[2];
      if (thirdBtn) {
        if (isStampTrip) {
          thirdBtn.dataset.screen = 'stamps';
          thirdBtn.innerHTML = `${Icons.star('icon-lg')}<span>Stamps</span>`;
        } else {
          thirdBtn.dataset.screen = 'dex';
          thirdBtn.innerHTML = `${Icons.star('icon-lg')}<span>Dex</span>`;
        }
        // Re-wire the click handler since innerHTML replacement above
        // doesn't remove the existing listener, but dataset.screen changed —
        // the existing delegated listener (bound to dataset.screen at click
        // time, not capture time) already reads dataset.screen live, so a
        // fresh binding isn't needed here. Left as a comment for clarity.
      }
      dbg('navSwap ✓ ' + (isStampTrip ? 'stamps' : 'dex'));
    } catch(e) { dbg('navSwap ✗ ' + e.message, '#f66'); }

    TripSwitcher?.init();
    dbg('TripSwitcher ✓');

    try { watchConnectivity(); dbg('watchConnectivity ✓'); } 
    catch(e) { dbg('watchConnectivity ✗ ' + e.message, '#f66'); }

    try { updateUrgentBadge(); dbg('updateUrgentBadge ✓'); } 
    catch(e) { dbg('updateUrgentBadge ✗ ' + e.message, '#f66'); }

    try { renderCountdown(); dbg('renderCountdown ✓'); } 
    catch(e) { dbg('renderCountdown ✗ ' + e.message, '#f66'); }

    try {
      const tnEl = document.getElementById('header-trip-name-text');
      if (tnEl && Data.getTripName) tnEl.textContent = Data.getTripName();
      dbg('tripName ✓ ' + Data.getTripName?.());
    } catch(e) { dbg('tripName ✗ ' + e.message, '#f66'); }

    try {
      window.TripSwitcher?.init();
      dbg('tripSwitcher ✓');
    } catch(e) { dbg('tripSwitcher ✗ ' + e.message, '#f66'); }

    try { updateSyncStatus('offline'); dbg('syncStatus ✓'); }
    catch(e) { dbg('syncStatus ✗ ' + e.message, '#f66'); }

    try {
      document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTo(btn.dataset.screen));
      });
      dbg('navBtns ✓');
    } catch(e) { dbg('navBtns ✗ ' + e.message, '#f66'); }

    document.getElementById('sync-btn')?.addEventListener('click', async () => {
      Toast.show('Syncing with Supabase…', 'info');
      await Data.loadTrips?.();
      await Data.init();
      App.reload?.();
    });

    let start = 'landing';
    try { start = sessionStorage.getItem('lastScreen') || 'landing'; } catch(_) {}
    dbg('switching to: ' + start);
    try {
      switchTo(start);
      dbg('switchTo ✓');
      const sc = document.getElementById('screen-content');
      dbg('children: ' + (sc ? sc.children.length : 'null'));
      dbg('days: ' + Data.getDays().length);
      if (Data.getDays().length > 0) {
        const d = Data.getDays()[0];
        dbg('d[0]: ' + d.label + ' stops:' + (d.stops?.length||0));
      }
    } catch(e) { 
      dbg('switchTo ✗ ' + e.message, '#f66');
      dbg('stack: ' + (e.stack||'').split('\n').slice(0,3).join(' | '), '#f66');
    }

    // Sync disabled on platform branch (uses Supabase, not InstantDB)
    try { scheduleDayBeforeReminders(); } catch(_) {}

    // Upcoming booking deadlines — surfaces on open since we don't have
    // true push notifications yet (see getUpcomingDeadlines)
    try {
      const upcoming = Data.getUpcomingDeadlines?.(14) || [];
      if (upcoming.length) {
        const next = upcoming[0];
        const days = Math.ceil((new Date(next.deadline) - Date.now()) / 86400000);
        const when = days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
        Toast.show(
          `⚠️ ${next.name} — booking deadline ${when}` + (upcoming.length > 1 ? ` (+${upcoming.length - 1} more)` : ''),
          'warning'
        );
      }
    } catch(_) {}
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
    const tripNameEl = document.getElementById('header-trip-name-text');
    if (tripNameEl) tripNameEl.textContent = Data.getCurrentTrip()?.name || 'Trip Companion';
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
