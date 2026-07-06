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
    cEl.style.display = '';
    const today  = new Date(); today.setHours(0,0,0,0);
    const days = Data.getDays?.() || [];
    const startDate = (days[0] && days[0].date) || Data.getCurrentTrip?.()?.start_date;
    const depart = startDate ? new Date(startDate + 'T00:00:00') : null;
    if (!depart || isNaN(depart.getTime())) { cEl.style.display = 'none'; return; }
    const diff   = Math.ceil((depart - today) / 864e5);
    if      (diff > 1)  cEl.textContent = diff + ' days to go \uD83C\uDF0D';
    else if (diff === 1) cEl.textContent = 'Departing tomorrow! \uD83C\uDF0D';
    else if (diff === 0) cEl.textContent = 'Departure day! \u2708\uFE0F';
    else                 cEl.style.display = 'none';
  }

  /* ── Header subtitle: "31 Aug – 17 Sep · Kumano Kodo · Nagano · ..." ──
     Derived live from itinerary days, never hardcoded. Hidden entirely
     when the trip has no days yet (nothing sensible to show). */
  const SEGMENT_LABELS = {
    tanzania: 'Tanzania', kenya: 'Kenya', uganda: 'Uganda',
    kumano: 'Kumano Kodo', nagano: 'Nagano', alpine: 'Alpine Route', osaka: 'Osaka',
    japan: 'Japan',
  };

  function formatShortDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    if (!m) return '';
    const [, y, mo, d] = m;
    const dt = new Date(Number(y), Number(mo) - 1, Number(d));
    return `${Number(d)} ${dt.toLocaleDateString('en-US', { month: 'short' })}`;
  }

  function renderHeaderSub() {
    const el = document.querySelector('.header-sub');
    if (!el) return;
    const days = Data.getDays?.() || [];
    if (!days.length) { el.style.display = 'none'; return; }
    el.style.display = '';

    const dates = days.map(d => d.date).filter(Boolean).sort();
    const range = dates.length ? `${formatShortDate(dates[0])} – ${formatShortDate(dates[dates.length - 1])}` : '';

    const locations = [];
    days.forEach(d => {
      const seg = d.segment;
      if (!seg || seg === 'transit' || locations.includes(seg)) return;
      locations.push(seg);
    });
    const locText = locations.map(s => SEGMENT_LABELS[s] || (s.charAt(0).toUpperCase() + s.slice(1))).join(' · ');

    el.textContent = [range, locText].filter(Boolean).join(' · ');
  }

  /* ── Day-before push notifications ──────────────────────────── */
  const MAX_TIMEOUT_MS = 20 * 24 * 60 * 60 * 1000; // 20 days — safely under the ~24.8-day
                                                     // browser setTimeout overflow limit
  const _remindersArmed = new Set(); // per-session guard against re-arming the same day repeatedly

  async function scheduleDayBeforeReminders() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      const perm = await Notification.requestPermission().catch(() => 'denied');
      if (perm !== 'granted') return;
    }
    if (Notification.permission !== 'granted') return;

    const tripName = Data.getCurrentTrip?.()?.name || 'Trip';
    const now = Date.now();
    Data.getDays().forEach(day => {
      if (_remindersArmed.has(day.id)) return;

      const stops = Data.getStopsByDay(day.id);
      const firstFlight = stops.find(s => s.transportType === 'plane');
      const body = firstFlight
        ? 'First flight: ' + firstFlight.name + (firstFlight.time ? ' at ' + firstFlight.time : '')
        : 'Tomorrow: ' + day.title;

      // day.date is a real ISO date (YYYY-MM-DD) from Supabase
      const dayDate = new Date(day.date + 'T00:00:00');
      if (isNaN(dayDate.getTime())) return;

      const reminderTime = dayDate.getTime() - (10 * 60 * 60 * 1000); // 10hrs before = eve prior
      const delay = reminderTime - now;
      // Skip anything too far out — setTimeout delays beyond ~24.8 days overflow and
      // fire immediately instead of waiting. This function re-runs every app open,
      // so each day gets scheduled properly once it's within the safe window.
      if (delay <= 0 || delay > MAX_TIMEOUT_MS) return;

      _remindersArmed.add(day.id);
      setTimeout(() => {
        new Notification('\uD83C\uDF0D ' + tripName + ' \u2014 tomorrow is ' + day.label, {
          body,
          icon: './icons/icon-192.png',
          tag:  'trip-' + day.id,
        });
      }, delay);
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

    // Third nav slot is trip-specific: Dex for the Africa trip, Pilgrim
    // Stamps for the Japan trip. Any other (e.g. a newly created) trip
    // gets a blank slot rather than guessing — nothing to show yet.
    try {
      const AFRICA_TRIP_ID = '83891de6-44ee-4ec2-bb95-6726cbd8c370';
      const JAPAN_TRIP_ID  = '91a41e0d-f247-4d89-ba15-02f0994a16c8';
      const tripId = Data.getCurrentTrip?.()?.id;
      const navBtns = document.querySelectorAll('.nav-btn');
      const thirdBtn = navBtns[2];
      if (thirdBtn) {
        if (tripId === JAPAN_TRIP_ID) {
          thirdBtn.style.display = '';
          thirdBtn.dataset.screen = 'stamps';
          thirdBtn.innerHTML = `${Icons.star('icon-lg')}<span>Stamps</span>`;
        } else if (tripId === AFRICA_TRIP_ID) {
          thirdBtn.style.display = '';
          thirdBtn.dataset.screen = 'dex';
          thirdBtn.innerHTML = `${Icons.star('icon-lg')}<span>Dex</span>`;
        } else {
          thirdBtn.style.display = 'none';
          thirdBtn.dataset.screen = '';
        }
      }
      dbg('navSwap ✓ trip:' + tripId);
    } catch(e) { dbg('navSwap ✗ ' + e.message, '#f66'); }

    TripSwitcher?.init();
    dbg('TripSwitcher ✓');

    try { watchConnectivity(); dbg('watchConnectivity ✓'); } 
    catch(e) { dbg('watchConnectivity ✗ ' + e.message, '#f66'); }

    try { updateUrgentBadge(); dbg('updateUrgentBadge ✓'); } 
    catch(e) { dbg('updateUrgentBadge ✗ ' + e.message, '#f66'); }

    try { renderCountdown(); dbg('renderCountdown ✓'); } 
    catch(e) { dbg('renderCountdown ✗ ' + e.message, '#f66'); }

    try { renderHeaderSub(); dbg('renderHeaderSub ✓'); }
    catch(e) { dbg('renderHeaderSub ✗ ' + e.message, '#f66'); }

    try {
      const tnEl = document.getElementById('header-trip-name-text');
      if (tnEl && Data.getTripName) tnEl.textContent = Data.getTripName();
      dbg('tripName ✓ ' + Data.getTripName?.());
    } catch(e) { dbg('tripName ✗ ' + e.message, '#f66'); }

    try {
      window.TripSwitcher?.init();
      dbg('tripSwitcher ✓');
    } catch(e) { dbg('tripSwitcher ✗ ' + e.message, '#f66'); }

    try { updateSyncStatus(navigator.onLine ? 'synced' : 'offline'); dbg('syncStatus ✓'); }
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
