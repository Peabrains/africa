'use strict';

const App = (() => {
  const SCREENS = {
    itinerary: () => window.ItineraryScreen,
    map:       () => window.MapScreen,
    bookings:  () => window.BookingsScreen,
    sos:       () => window.SOSScreen,
  };

  let currentScreen = null;
  let currentModule = null;

  /* ─── Stamp banner — rendered once, shown/hidden per screen ─ */
  function renderStampBanner() {
    const container = document.getElementById('stamp-persistent');
    if (!container) return;

    const expanded = (() => {
      try { return sessionStorage.getItem('stampExpanded') === 'true'; } catch(_) { return false; }
    })();

    const p = Data.getStampProgress();
    const stamps = Data.getStampStops();

    container.innerHTML = '';
    const banner = document.createElement('div');
    banner.className = 'stamp-banner';

    const header = document.createElement('div');
    header.className = 'stamp-header';
    header.innerHTML = `
      <div class="stamp-header-left">
        <span class="stamp-title">御朱印帳</span>
        <span class="stamp-sub">Pilgrim Passport</span>
      </div>
      <div class="stamp-header-right">
        <span class="stamp-count">${p.collected}/${p.total}</span>
        <span class="stamp-sanzan">Sanzan ${p.sanzanCollected}/${p.sanzanTotal}</span>
        ${expanded ? Icons.chevronUp('stamp-chevron') : Icons.chevronDown('stamp-chevron')}
      </div>`;
    header.addEventListener('click', () => {
      try { sessionStorage.setItem('stampExpanded', !expanded); } catch(_) {}
      renderStampBanner();
    });

    const bar = document.createElement('div');
    bar.className = 'stamp-progress-bar';
    bar.innerHTML = `<div class="stamp-progress-fill" style="width:${p.total ? Math.round(p.collected/p.total*100) : 0}%"></div>`;

    banner.appendChild(header);
    banner.appendChild(bar);

    if (expanded) {
      const grid = document.createElement('div');
      grid.className = 'stamp-grid';
      stamps.forEach(stop => {
        const collected = Data.isStampCollected(stop.id);
        const dot = document.createElement('button');
        dot.className = `stamp-dot ${collected ? 'stamp-dot--collected' : ''} ${stop.isSanzan ? 'stamp-dot--sanzan' : ''}`;
        dot.innerHTML = `
          <span class="stamp-kanji">${stop.stampKanji}</span>
          <span class="stamp-romaji">${stop.stampRomaji}</span>
          ${stop.isSanzan ? `<span class="stamp-tag">S${stop.sanzanNum}</span>` : ''}`;
        dot.addEventListener('click', async () => {
          const now = await Data.toggleStamp(stop.id);
          const prog = Data.getStampProgress();
          if (prog.sanzanComplete && now && stop.isSanzan && stop.sanzanNum === 3) {
            Toast.show('三山達成 — Kumano Sanzan complete!', 'success');
          } else {
            Toast.show(now ? `${stop.stampRomaji} stamp collected` : 'Stamp uncollected', now ? 'success' : 'info');
          }
          renderStampBanner();
        });
        grid.appendChild(dot);
      });
      banner.appendChild(grid);
      banner.insertAdjacentHTML('beforeend', '<p class="stamp-hint">Tap to collect · Red border = Kumano Sanzan</p>');
    }

    container.appendChild(banner);
  }

  /* ─── Screen switch ──────────────────────────────────────── */
  function switchTo(name) {
    if (!(name in SCREENS)) return;
    currentModule?.destroy?.();

    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.screen === name));

    const el = document.getElementById('screen-content');
    el.innerHTML = '';
    el.scrollTop = 0;
    el.classList.toggle('map-active', name === 'map');

    // Show stamp banner only on itinerary tab
    const sp = document.getElementById('stamp-persistent');
    if (sp) sp.style.display = name === 'itinerary' ? 'block' : 'none';

    currentScreen = name;
    currentModule = SCREENS[name]();
    currentModule.init(el);
    try { sessionStorage.setItem('lastScreen', name); } catch(_) {}
  }

  /* ─── Sync status ────────────────────────────────────────── */
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
    el.className = `badge ${cls}`;
    el.textContent = txt;
  }

  /* ─── Conflict UI ────────────────────────────────────────── */
  let _remoteConflict = null;

  function showConflict(remote) {
    _remoteConflict = remote;
    let banner = document.getElementById('conflict-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'conflict-banner';
      banner.className = 'conflict-banner';
      document.getElementById('app').insertBefore(banner, document.getElementById('screen-content'));
    }
    banner.innerHTML = `
      <p class="conflict-msg">⚠ Google Sheet was updated while you had offline changes.</p>
      <div class="conflict-btns">
        <button id="conflict-keep" class="btn btn-ghost" style="font-size:11px;min-height:32px">Keep mine</button>
        <button id="conflict-remote" class="btn btn-primary" style="font-size:11px;min-height:32px">Use Sheet</button>
      </div>`;
    banner.style.display = 'flex';
    document.getElementById('conflict-keep').onclick   = () => Sync.keepLocal();
    document.getElementById('conflict-remote').onclick = () => Sync.acceptRemote(_remoteConflict);
  }

  function hideConflict() {
    const b = document.getElementById('conflict-banner');
    if (b) b.style.display = 'none';
  }

  /* ─── Urgent badge ───────────────────────────────────────── */
  function updateUrgentBadge() {
    const el = document.getElementById('urgent-count');
    if (!el) return;
    const { urgent } = Data.getStats();
    el.textContent = urgent;
    el.style.display = urgent > 0 ? 'flex' : 'none';
  }

  /* ─── Connectivity ───────────────────────────────────────── */
  function watchConnectivity() {
    window.addEventListener('online', async () => {
      if (Config.GAS_URL) {
        const queue = await DB.loadQueue().catch(() => []);
        if (queue.length) await Sync.push();
        else updateSyncStatus('synced');
      }
    });
    window.addEventListener('offline', () => updateSyncStatus('offline'));
  }

  /* ─── Service worker ─────────────────────────────────────── */
  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('./sw.js')
      .then(r => console.log('[SW]', r.scope))
      .catch(e => console.warn('[SW]', e));
  }

  /* ─── Init ───────────────────────────────────────────────── */
  async function init() {
    registerSW();
    await DB.init();
    await Data.init();

    watchConnectivity();
    updateUrgentBadge();
    updateSyncStatus(Config.GAS_URL && navigator.onLine ? 'syncing' : 'offline');

    // Render stamp banner once into its persistent container
    renderStampBanner();

    // Wire nav
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => switchTo(btn.dataset.screen));
    });

    // Sync button — force re-push all data to InstantDB
    document.getElementById('sync-btn')?.addEventListener('click', async () => {
      if (!Config.INSTANT_APP_ID) {
        Toast.show('Add INSTANT_APP_ID to js/config.js — visit getadb.com/provision/<uuid>', 'warning');
        return;
      }
      await Sync.pushAll();
      Toast.show('All data pushed to InstantDB', 'success');
    });

    // Countdown
    const diff = Math.ceil((new Date(Config.TRIP_DATE) - new Date()) / 864e5);
    const cEl  = document.getElementById('countdown');
    if (cEl && diff > 0) cEl.textContent = `${diff} days to go`;

    // Start on last screen
    let start = 'itinerary';
    try { start = sessionStorage.getItem('lastScreen') || 'itinerary'; } catch(_) {}
    switchTo(start);

    // Initialise InstantDB sync (handles pull + live subscription)
    await Sync.init();
  }

  return { init, switchTo, updateSyncStatus, updateUrgentBadge, showConflict, hideConflict, renderStampBanner };
})();

document.addEventListener('DOMContentLoaded', App.init);
window.App = App;
