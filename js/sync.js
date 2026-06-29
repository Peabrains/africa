'use strict';

/* ============================================================
   SYNC — InstantDB single-entity approach
   Africa Safari PWA

   ALL trip data is stored as ONE JSON record in InstantDB under
   the collection `tripData` with our app ID as the entity UUID.

   Data structure:
   tripData[APP_UUID] = {
     stops:    JSON string of stops array
     expenses: JSON string of expenses array
     packing:  JSON string of packing array
     settings: JSON string of { travelers, overnight, customLinks }
     updatedAt: timestamp
   }
   ============================================================ */

const Sync = (() => {
  const ENTITY_UUID = Config.INSTANT_APP_ID || '';

  let db           = null;
  let _unsub       = null;
  let _initPushed  = false;
  let _pushDebounce = null;

  /* ── Load InstantDB ESM module ──────────────────────────────── */
  function loadIDB() {
    return new Promise((resolve, reject) => {
      if (window._IDB) { resolve(window._IDB); return; }
      window.addEventListener('idb-ready', () => resolve(window._IDB), { once: true });
      setTimeout(() => reject(new Error('InstantDB load timeout')), 10000);
    });
  }

  /* ── Serialize all local state ──────────────────────────────── */
  function buildPayload() {
    return {
      dataVersion: String(Config.DATA_VERSION || 1),
      tripName:    Data.getTripName?.() || '',
      stops:       JSON.stringify(Data.getStops()),
      expenses:    JSON.stringify(Data.getExpenses()),
      packing:     JSON.stringify(Data.getPackingItems()),
      settings:    JSON.stringify({
        travelers:   Data.getTravelers(),
        overnight:   Data.getAllOvernight(),
        customLinks: Data.getCustomLinks?.() || [],
      }),
      updatedAt: Date.now(),
    };
  }

  /* ── Push all data to InstantDB ─────────────────────────────── */
  async function pushAll() {
    if (!db || !ENTITY_UUID) return;
    try {
      await db.transact(db.tx.tripData[ENTITY_UUID].update(buildPayload()));
    } catch(e) {
      console.warn('[Sync] pushAll failed:', e);
      throw e;
    }
  }

  /* ── Debounced push — batches rapid changes ─────────────────── */
  function debouncedPush() {
    if (!db) return;
    clearTimeout(_pushDebounce);
    _pushDebounce = setTimeout(() => pushAll().catch(e => console.warn('[Sync]', e)), 800);
  }

  /* ── Africa day order ───────────────────────────────────────── */
  const DAY_ORDER = [
    'd0','d1','d2','d3','d4','d5','d6','d7','d8',
    'd9','d10','d11','d12','d13','d14','d15','d16','d17',
  ];

  /* ── ID-based merge ─────────────────────────────────────────── */
  function mergeById(local, remote) {
    const remoteMap = {};
    remote.forEach(r => { remoteMap[r.id] = r; });
    const merged = local.map(l => {
      const r = remoteMap[l.id];
      if (!r) return l;
      const localT  = l.updatedAt || l.ts || 0;
      const remoteT = r.updatedAt || r.ts || 0;
      return remoteT > localT ? { ...l, ...r } : { ...r, ...l };
    });
    remote.forEach(r => { if (!merged.find(l => l.id === r.id)) merged.push(r); });
    return merged;
  }

  function mergeStops(remote) {
    const merged = mergeById(Data.getStops(), remote);
    return merged.sort((a,b) => {
      const dd = DAY_ORDER.indexOf(a.dayId) - DAY_ORDER.indexOf(b.dayId);
      return dd !== 0 ? dd : (a.order||0) - (b.order||0);
    });
  }

  /* ── Apply remote data to local state ───────────────────────── */
  function applyRemote(record) {
    if (!record) return;

    // Version check
    const blobVersion   = parseInt(record.dataVersion || '1');
    const targetVersion = Config.DATA_VERSION || 1;
    if (blobVersion < targetVersion) {
      console.log('[Sync] Remote v' + blobVersion + ' < local v' + targetVersion + ' — pushing new data up');
      setTimeout(() => pushAll().catch(console.warn), 500);
      return;
    }

    let changed = false;

    if (record.stops) {
      try {
        const remote = JSON.parse(record.stops);
        if (remote.length) {
          Data.setStops(mergeStops(remote));
          changed = true;
        }
      } catch(e) { console.warn('[Sync] parse stops:', e); }
    }

    if (record.expenses) {
      try {
        const remote = JSON.parse(record.expenses);
        Data.setExpenses(mergeById(Data.getExpenses(), remote));
        changed = true;
      } catch(e) { console.warn('[Sync] parse expenses:', e); }
    }

    if (record.packing) {
      try {
        const remote = JSON.parse(record.packing);
        Data.setPackingItems(mergeById(Data.getPackingItems(), remote));
        changed = true;
      } catch(e) { console.warn('[Sync] parse packing:', e); }
    }

    if (record.tripName) {
      Data.setTripName?.(record.tripName).catch(()=>{});
    }

    if (record.settings) {
      try {
        const s = JSON.parse(record.settings);
        if (Array.isArray(s.travelers))                Data.setTravelers(s.travelers);
        if (s.overnight && typeof s.overnight === 'object') {
          Object.entries(s.overnight).forEach(([dayId, o]) => Data.setOvernight(dayId, o));
        }
        if (Array.isArray(s.customLinks)) Data.setCustomLinks?.(s.customLinks);
        changed = true;
      } catch(e) { console.warn('[Sync] parse settings:', e); }
    }

    if (changed) {
      App.updateUrgentBadge();
      window.ItineraryScreen?.refresh?.();
      const focused  = document.activeElement;
      const formOpen = document.querySelector('.add-expense-form')?.style?.display === 'flex';
      if (!formOpen && (!focused || !['INPUT','TEXTAREA','SELECT'].includes(focused.tagName))) {
        window.BookingsScreen?.refresh?.();
      }
    }
  }

  /* ── Init ───────────────────────────────────────────────────── */
  async function init() {
    if (!Config.INSTANT_APP_ID) {
      App.updateSyncStatus('offline');
      console.log('[Sync] No INSTANT_APP_ID — add one to js/config.js to enable sync');
      return;
    }
    try {
      const { init: iInit } = await loadIDB();
      db = iInit({ appId: Config.INSTANT_APP_ID });
      App.updateSyncStatus('syncing');

      _unsub = db.subscribeQuery(
        { tripData: {} },
        ({ data, error }) => {
          if (error) {
            console.error('[Sync] subscription error:', error);
            App.updateSyncStatus('error');
            return;
          }
          if (!data) return;

          const records = data.tripData || [];
          if (!records.length) {
            if (!_initPushed) {
              _initPushed = true;
              pushAll()
                .then(() => {
                  App.updateSyncStatus('synced');
                  Toast.show('Trip data synced ✓', 'success');
                })
                .catch(e => {
                  App.updateSyncStatus('error');
                  Toast.show('Initial sync failed: ' + e.message, 'warning');
                });
            }
          } else {
            applyRemote(records[0]);
            App.updateSyncStatus('synced');
            _initPushed = true;
          }
        }
      );
    } catch(e) {
      console.warn('[Sync] init failed:', e);
      App.updateSyncStatus('error');
    }
  }

  /* ── Individual triggers — all debounce to pushAll ──────────── */
  function pushStop()      { debouncedPush(); }
  function removeStop()    { debouncedPush(); }
  function pushExpense()   { debouncedPush(); }
  function removeExpense() { debouncedPush(); }
  function pushPacking()   { debouncedPush(); }
  function removePacking() { debouncedPush(); }
  function pushSettings()  { debouncedPush(); }
  function pushTravelers() { debouncedPush(); }
  function pushStamp()     { debouncedPush(); }

  function destroy() {
    clearTimeout(_pushDebounce);
    if (_unsub) { _unsub(); _unsub = null; }
    db = null;
    _initPushed = false;
  }

  return {
    init,
    pushAll,
    pushStop, removeStop,
    pushExpense, removeExpense,
    pushPacking, removePacking,
    pushStamp,
    pushSettings, pushTravelers,
    destroy,
  };
})();

window.Sync = Sync;
