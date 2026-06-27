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
      dataVersion: String(Config.DATA_VERSION || 1),
      tripName:    Data.getTripName?.() || '',
      stops:    JSON.stringify(Data.getStops()),
      expenses: JSON.stringify(Data.getExpenses()),
      packing:  JSON.stringify(Data.getPackingItems()),
      stamps:   JSON.stringify([...(window._STAMPS_COLLECTED || [])]),
      settings: JSON.stringify({
        travelers:   Data.getTravelers(),
        overnight:   Data.getAllOvernight(),
        customLinks: Data.getCustomLinks?.() || [],
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
  /* ─── ID-based merge helpers ─────────────────────────────── */
  const DAY_ORDER = ['d-1','d0','d1','d2','d3','d4','d5','d6','d7','d8','d9','d10','d11','d12'];

  function mergeById(local, remote) {
    const remoteMap = {};
    remote.forEach(r => { remoteMap[r.id] = r; });
    const merged = local.map(l => {
      const r = remoteMap[l.id];
      if (!r) return l;
      // Newer timestamp wins — protects local edits from being overwritten by stale remote
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

  function applyRemote(record) {
    if (!record) return;
    // Version check — ignore old data blobs from before a major seed rebuild
    const blobVersion = parseInt(record.dataVersion || '1');
    const targetVersion = Config.DATA_VERSION || 1;
    if (blobVersion < targetVersion) {
      console.log('[Sync] Remote blob v'+blobVersion+' < current v'+targetVersion+'. Pushing new data up.');
      setTimeout(() => pushAll().catch(console.warn), 500);
      return;
    }
    let changed = false;

    /* Stops — ID-based merge, never drops local-only additions */
    if (record.stops) {
      try {
        const remote = JSON.parse(record.stops);
        if (remote.length) {
          // Extra safety: if local has new sk* IDs but remote only has old s* IDs,
          // this is a version mismatch — push new data instead of merging old in
          const localHasNew  = Data.getStops().some(s => s.id.startsWith('sk'));
          const remoteHasNew = remote.some(s => s.id.startsWith('sk'));
          if (localHasNew && !remoteHasNew) {
            console.log('[Sync] Remote has old stop IDs, pushing new data up.');
            setTimeout(() => pushAll().catch(console.warn), 500);
          } else {
            Data.setStops(mergeStops(remote));
            changed = true;
          }
        }
      } catch(e) { console.warn('[Sync] parse stops:', e); }
    }

    /* Expenses */
    if (record.expenses) {
      try {
        const remote = JSON.parse(record.expenses);
        Data.setExpenses(mergeById(Data.getExpenses(), remote));
        changed = true;
      } catch(e) { console.warn('[Sync] parse expenses:', e); }
    }

    /* Packing */
    if (record.packing) {
      try {
        const remote = JSON.parse(record.packing);
        Data.setPackingItems(mergeById(Data.getPackingItems(), remote));
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

    /* Trip name */
    if (record.tripName) {
      Data.setTripName?.(record.tripName).catch(()=>{});
    }

    /* Settings (travelers + overnight) */
    if (record.settings) {
      try {
        const s = JSON.parse(record.settings);
        if (Array.isArray(s.travelers)) Data.setTravelers(s.travelers);
        if (s.overnight && typeof s.overnight === 'object') {
          Object.entries(s.overnight).forEach(([dayId, o]) => Data.setOvernight(dayId, o));
        }
        if (Array.isArray(s.customLinks)) Data.setCustomLinks?.(s.customLinks);
        changed = true;
      } catch(e) { console.warn('[Sync] parse settings:', e); }
    }

    if (changed) {
      App.renderStampBanner();
      App.updateUrgentBadge();
      window.ItineraryScreen?.refresh?.();
      // Don't re-render if user is actively typing in an input
      const _focused = document.activeElement;
      const _formOpen = document.querySelector('.add-expense-form')?.style?.display === 'flex';
      if (!_formOpen && (!_focused || !['INPUT','TEXTAREA','SELECT'].includes(_focused.tagName))) {
        window.BookingsScreen?.refresh?.();
      }
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
