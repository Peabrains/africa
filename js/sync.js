'use strict';

/* ============================================================
   SYNC — InstantDB single-entity approach

   ALL trip data is stored as ONE JSON record in InstantDB under
   the collection `tripData` with our app ID as the entity UUID.
   This avoids the UUID requirement issue (our stop IDs like
   's01' are not valid UUIDs).

   Data structure:
   tripData[APP_UUID] = {
     stops:    JSON string of stops array
     expenses: JSON string of expenses array
     packing:  JSON string of packing array
     stamps:   JSON string of collected stamp ID array
     settings: JSON string of { travelers, overnight }
     updatedAt: timestamp
   }
   ============================================================ */

const Sync = (() => {
  // Our InstantDB app ID is already a valid UUID — use it as the stable entity ID
  const ENTITY_UUID = Config.INSTANT_APP_ID || '6b3ba6ba-b131-445f-9369-d84324863dc7';

  let db      = null;
  let _unsub  = null;
  let _initPushed = false;
  let _pushDebounce = null;

  /* ─── Load InstantDB module (loaded via ESM in index.html) ── */
  function loadIDB() {
    return new Promise((resolve, reject) => {
      if (window._IDB) { resolve(window._IDB); return; }
      window.addEventListener('idb-ready', () => resolve(window._IDB), { once: true });
      setTimeout(() => reject(new Error('InstantDB load timeout')), 10000);
    });
  }

  /* ─── Serialize all local state to one record ─────────────── */
  function buildPayload() {
    return {
      stops:    JSON.stringify(Data.getStops()),
      expenses: JSON.stringify(Data.getExpenses()),
      packing:  JSON.stringify(Data.getPackingItems()),
      stamps:   JSON.stringify([...(window._STAMPS_COLLECTED || [])]),
      settings: JSON.stringify({
        travelers: Data.getTravelers(),
        overnight: Data.getAllOvernight(),
      }),
      updatedAt: Date.now(),
    };
  }

  /* ─── Push all data to InstantDB ─────────────────────────── */
  async function pushAll() {
    if (!db) return;
    try {
      await db.transact(db.tx.tripData[ENTITY_UUID].update(buildPayload()));
    } catch(e) {
      console.warn('[Sync] pushAll failed:', e);
      throw e;
    }
  }

  /* ─── Debounced push — batches rapid successive changes ───── */
  function debouncedPush() {
    if (!db) return;
    clearTimeout(_pushDebounce);
    _pushDebounce = setTimeout(() => pushAll().catch(e => console.warn('[Sync]', e)), 800);
  }

  /* ─── Apply remote data to local state ──────────────────── */
  function applyRemote(record) {
    if (!record) return;
    let changed = false;

    /* Stops — use merge strategy: never replace more with fewer */
    if (record.stops) {
      try {
        const remote = JSON.parse(record.stops);
        if (remote.length) {
          const local = Data.getStops();
          if (remote.length >= local.length * 0.8) {
            // Remote has enough stops — full replace, sort by day+order
            const dayOrder = ['d-1','d0','d1','d2','d3','d4','d5','d6','d7','d8','d9','d10','d11','d12'];
            remote.sort((a,b) => {
              const dd = dayOrder.indexOf(a.dayId) - dayOrder.indexOf(b.dayId);
              return dd !== 0 ? dd : (a.order||0) - (b.order||0);
            });
            Data.setStops(remote);
          } else {
            // Remote is sparse — merge into local
            const merged = [...local];
            remote.forEach(r => {
              const idx = merged.findIndex(s => s.id === r.id);
              if (idx >= 0) merged[idx] = { ...merged[idx], ...r };
              else merged.push(r);
            });
            Data.setStops(merged);
          }
          changed = true;
        }
      } catch(e) { console.warn('[Sync] parse stops:', e); }
    }

    /* Expenses */
    if (record.expenses) {
      try {
        const remote = JSON.parse(record.expenses);
        const local  = Data.getExpenses();
        if (remote.length >= local.length) {
          Data.setExpenses(remote);
        } else {
          const merged = [...local];
          remote.forEach(r => {
            const idx = merged.findIndex(e => e.id === r.id);
            if (idx >= 0) merged[idx] = r; else merged.push(r);
          });
          Data.setExpenses(merged);
        }
        changed = true;
      } catch(e) { console.warn('[Sync] parse expenses:', e); }
    }

    /* Packing */
    if (record.packing) {
      try {
        const remote = JSON.parse(record.packing);
        const local  = Data.getPackingItems();
        if (remote.length >= local.length * 0.8) {
          Data.setPackingItems(remote);
        } else {
          const merged = [...local];
          remote.forEach(r => {
            const idx = merged.findIndex(p => p.id === r.id);
            if (idx >= 0) merged[idx] = r; else merged.push(r);
          });
          Data.setPackingItems(merged);
        }
        changed = true;
      } catch(e) { console.warn('[Sync] parse packing:', e); }
    }

    /* Stamps */
    if (record.stamps) {
      try {
        const ids = JSON.parse(record.stamps);
        ids.forEach(id => Data.setStampCollected(id, true));
        changed = true;
      } catch(e) { console.warn('[Sync] parse stamps:', e); }
    }

    /* Settings (travelers + overnight) */
    if (record.settings) {
      try {
        const s = JSON.parse(record.settings);
        if (Array.isArray(s.travelers)) Data.setTravelers(s.travelers);
        if (s.overnight && typeof s.overnight === 'object') {
          Object.entries(s.overnight).forEach(([dayId, o]) => Data.setOvernight(dayId, o));
        }
        changed = true;
      } catch(e) { console.warn('[Sync] parse settings:', e); }
    }

    if (changed) {
      App.renderStampBanner();
      App.updateUrgentBadge();
      window.ItineraryScreen?.refresh?.();
      window.BookingsScreen?.refresh?.();
    }
  }

  /* ─── Init — subscribe to single entity ──────────────────── */
  async function init() {
    if (!Config.INSTANT_APP_ID) {
      App.updateSyncStatus('offline');
      console.log('[Sync] No INSTANT_APP_ID configured');
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
            /* InstantDB is empty — push all local data */
            if (!_initPushed) {
              _initPushed = true;
              pushAll()
                .then(() => {
                  App.updateSyncStatus('synced');
                  Toast.show('Trip data synced to InstantDB ✓', 'success');
                })
                .catch(e => {
                  App.updateSyncStatus('error');
                  Toast.show('Initial sync failed: ' + e.message, 'warning');
                });
            }
          } else {
            /* Apply remote data */
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

  /* ─── Individual write triggers (all debounce to pushAll) ─── */
  // Using debounced pushAll means rapid successive changes
  // (e.g. checking 5 packing items) batch into one write.

  function pushStop()     { debouncedPush(); }
  function removeStop()   { debouncedPush(); }
  function pushExpense()  { debouncedPush(); }
  function removeExpense(){ debouncedPush(); }
  function pushPacking()  { debouncedPush(); }
  function removePacking(){ debouncedPush(); }
  function pushSettings() { debouncedPush(); }
  function pushTravelers(){ debouncedPush(); }

  async function pushStamp(stopId, collected) {
    // Stamps need immediate push (user expects instant feedback)
    debouncedPush();
  }

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
