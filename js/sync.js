'use strict';

/* ============================================================
   SYNC — powered by InstantDB (instantdb.com)

   How it works:
   • On init: subscribe to all collections. InstantDB streams
     any changes from any device instantly.
   • On write: transact() pushes to InstantDB which syncs to
     all connected devices in real time.
   • Offline: InstantDB queues writes locally and replays when
     reconnected. No manual queue needed.

   Setup (one time):
   1. Visit https://www.getadb.com/provision/<any-uuid>
      in your browser to get credentials.
   2. Copy the "appId" into js/config.js → INSTANT_APP_ID.
   3. Deploy to GitHub — done. Both devices now share state.
   ============================================================ */

const Sync = (() => {
  let db       = null;
  let _unsub   = null;
  let _ready   = false;
  let _initPushed = false; // true after first pushAll

  /* ─── Load InstantDB (ESM → global) ─────────────────────── */
  function loadInstantDB() {
    return new Promise((resolve, reject) => {
      if (window._IDB) { resolve(window._IDB); return; }
      window.addEventListener('idb-ready', () => resolve(window._IDB), { once:true });
      // Timeout fallback
      setTimeout(() => reject(new Error('InstantDB load timeout')), 10000);
    });
  }

  /* ─── Flatten stop for InstantDB (no nested objects) ────── */
  function flatStop(s) {
    return {
      id:            s.id,
      dayId:         s.dayId,
      order:         s.order   || 1,
      segment:       s.segment || 'kumano',
      name:          s.name    || '',
      activity:      s.activity || '',
      transport:     s.transport || '',
      transportType: s.transportType || null,
      time:          s.time    || '',
      timeZone:      s.timeZone || 'JST',
      accommodation: s.accommodation || null,
      notes:         s.notes   || '',
      lat:           s.lat     || null,
      lng:           s.lng     || null,
      hasStamp:      s.hasStamp  ? true : false,
      isSanzan:      s.isSanzan  ? true : false,
      sanzanNum:     s.sanzanNum || null,
      stampKanji:    s.stampKanji  || null,
      stampRomaji:   s.stampRomaji || null,
      // Flattened booking
      bkStatus:      s.booking?.status   || 'open',
      bkRef:         s.booking?.ref      || '',
      bkCost:        s.booking?.cost     || null,
      bkDeadline:    s.booking?.deadline || null,
      // Flattened trainDetail
      trService:     s.trainDetail?.service  || null,
      trPlatform:    s.trainDetail?.platform || null,
      trJrPass:      s.trainDetail?.jrPass   != null ? s.trainDetail.jrPass : null,
    };
  }

  function unflatStop(f) {
    return {
      id:            f.id,
      dayId:         f.dayId,
      order:         f.order,
      segment:       f.segment,
      name:          f.name,
      activity:      f.activity,
      transport:     f.transport,
      transportType: f.transportType,
      time:          f.time,
      timeZone:      f.timeZone,
      accommodation: f.accommodation,
      notes:         f.notes,
      lat:           f.lat,
      lng:           f.lng,
      hasStamp:      f.hasStamp,
      isSanzan:      f.isSanzan,
      sanzanNum:     f.sanzanNum,
      stampKanji:    f.stampKanji,
      stampRomaji:   f.stampRomaji,
      booking: {
        status:   f.bkStatus   || 'open',
        ref:      f.bkRef      || '',
        cost:     f.bkCost     || null,
        deadline: f.bkDeadline || null,
      },
      trainDetail: f.trService ? {
        service:  f.trService,
        platform: f.trPlatform,
        jrPass:   f.trJrPass,
      } : null,
    };
  }

  /* ─── Apply remote data to local state ──────────────────── */
  function applyRemote(data) {
    let changed = false;

    if (data.stops?.length) {
      const stops = data.stops.map(unflatStop)
        .sort((a,b) => {
          const di = Object.keys({'d-1':0,d0:1,d1:2,d2:3,d3:4,d4:5,d5:6,d6:7,d7:8,d8:9,d9:10,d10:11,d11:12,d12:13});
          const dd = (di.indexOf(a.dayId)||0) - (di.indexOf(b.dayId)||0);
          return dd !== 0 ? dd : (a.order||0) - (b.order||0);
        });
      Data.setStops(stops);
      changed = true;
    }

    if (data.stamps?.length) {
      data.stamps.forEach(s => Data.setStampCollected(s.stopId, s.collected !== false));
      changed = true;
    }

    if (data.expenses) {
      Data.setExpenses(data.expenses);
      changed = true;
    }

    if (data.packing?.length) {
      Data.setPackingItems(data.packing);
      changed = true;
    }

    if (changed) {
      App.renderStampBanner();
      App.updateUrgentBadge();
      window.ItineraryScreen?.refresh?.();
      window.BookingsScreen?.refresh?.();
    }
  }

  /* ─── Init ───────────────────────────────────────────────── */
  async function init() {
    if (!Config.INSTANT_APP_ID) {
      App.updateSyncStatus('offline');
      console.log('[Sync] No INSTANT_APP_ID — running offline only');
      return;
    }

    try {
      const { init: iInit } = await loadInstantDB();
      db = iInit({ appId: Config.INSTANT_APP_ID });
      App.updateSyncStatus('syncing');

      _unsub = db.subscribeQuery(
        { stops:{}, stamps:{}, expenses:{}, packing:{} },
        ({ data, error }) => {
          if (error) {
            console.error('[Sync]', error);
            App.updateSyncStatus('error');
            return;
          }
          if (!data) return;

          const hasRemoteData = data.stops?.length > 0;

          if (!hasRemoteData && !_initPushed) {
            /* InstantDB is empty — push all local seed data */
            _initPushed = true;
            pushAll().then(() => {
              App.updateSyncStatus('synced');
              Toast.show('Trip data saved to InstantDB', 'success');
            });
          } else if (hasRemoteData) {
            applyRemote(data);
            App.updateSyncStatus('synced');
            _ready = true;
          }
        }
      );
    } catch(e) {
      console.warn('[Sync] init failed:', e);
      App.updateSyncStatus('error');
    }
  }

  /* ─── Writes ─────────────────────────────────────────────── */
  async function pushStop(stop) {
    if (!db) return;
    try { await db.transact(db.tx.stops[stop.id].update(flatStop(stop))); }
    catch(e) { console.warn('[Sync] pushStop:', e); }
  }

  async function removeStop(id) {
    if (!db) return;
    try { await db.transact(db.tx.stops[id].delete()); }
    catch(e) { console.warn('[Sync] removeStop:', e); }
  }

  async function pushExpense(expense) {
    if (!db) return;
    try { await db.transact(db.tx.expenses[expense.id].update(expense)); }
    catch(e) { console.warn('[Sync] pushExpense:', e); }
  }

  async function removeExpense(id) {
    if (!db) return;
    try { await db.transact(db.tx.expenses[id].delete()); }
    catch(e) { console.warn('[Sync] removeExpense:', e); }
  }

  async function pushStamp(stopId, collected) {
    if (!db) return;
    try {
      const txn = collected
        ? db.tx.stamps[stopId].update({ stopId, collected:true })
        : db.tx.stamps[stopId].delete();
      await db.transact(txn);
    } catch(e) { console.warn('[Sync] pushStamp:', e); }
  }

  async function pushPacking(item) {
    if (!db) return;
    try { await db.transact(db.tx.packing[item.id].update(item)); }
    catch(e) { console.warn('[Sync] pushPacking:', e); }
  }

  async function removePacking(id) {
    if (!db) return;
    try { await db.transact(db.tx.packing[id].delete()); }
    catch(e) { console.warn('[Sync] removePacking:', e); }
  }

  /* ─── First-time init push ───────────────────────────────── */
  async function pushAll() {
    if (!db) return;
    const stops    = Data.getStops().map(s => db.tx.stops[s.id].update(flatStop(s)));
    const expenses = Data.getExpenses().map(e => db.tx.expenses[e.id].update(e));
    const packing  = Data.getPackingItems().map(p => db.tx.packing[p.id].update(p));
    const stamps   = Data.getStampStops()
      .filter(s => Data.isStampCollected(s.id))
      .map(s => db.tx.stamps[s.id].update({ stopId:s.id, collected:true }));
    const all = [...stops, ...expenses, ...packing, ...stamps];
    if (all.length) await db.transact(all);
  }

  function destroy() {
    if (_unsub) { _unsub(); _unsub = null; }
    db = null;
  }

  return { init, pushStop, removeStop, pushExpense, removeExpense, pushStamp, pushPacking, removePacking, pushAll, destroy };
})();

window.Sync = Sync;
