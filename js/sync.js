'use strict';

const Sync = (() => {
  let db = null;
  let _unsub = null;
  let _initPushed = false;

  /* ─── Load InstantDB ─────────────────────────────────────── */
  function loadIDB() {
    return new Promise((resolve, reject) => {
      if (window._IDB) { resolve(window._IDB); return; }
      window.addEventListener('idb-ready', () => resolve(window._IDB), { once: true });
      setTimeout(() => reject(new Error('InstantDB load timeout')), 10000);
    });
  }

  /* ─── Flatten / unflatten stop ───────────────────────────── */
  function flatStop(s) {
    return {
      id: s.id, dayId: s.dayId, order: s.order || 1,
      segment: s.segment || 'kumano', name: s.name || '',
      activity: s.activity || '', transport: s.transport || '',
      transportType: s.transportType || null,
      time: s.time || '', timeZone: s.timeZone || 'JST',
      notes: s.notes || '', lat: s.lat || null, lng: s.lng || null,
      hasStamp: s.hasStamp ? true : false,
      isSanzan: s.isSanzan ? true : false,
      sanzanNum: s.sanzanNum || null,
      stampKanji: s.stampKanji || null, stampRomaji: s.stampRomaji || null,
      bkStatus: s.booking?.status || 'open', bkRef: s.booking?.ref || '',
      bkCost: s.booking?.cost || null, bkDeadline: s.booking?.deadline || null,
      trService: s.trainDetail?.service || null,
      trPlatform: s.trainDetail?.platform || null,
      trJrPass: s.trainDetail?.jrPass != null ? s.trainDetail.jrPass : null,
    };
  }

  function unflatStop(f) {
    return {
      id: f.id, dayId: f.dayId, order: f.order, segment: f.segment,
      name: f.name, activity: f.activity, transport: f.transport,
      transportType: f.transportType, time: f.time, timeZone: f.timeZone,
      notes: f.notes, lat: f.lat, lng: f.lng,
      hasStamp: f.hasStamp, isSanzan: f.isSanzan,
      sanzanNum: f.sanzanNum, stampKanji: f.stampKanji, stampRomaji: f.stampRomaji,
      booking: { status: f.bkStatus || 'open', ref: f.bkRef || '', cost: f.bkCost || null, deadline: f.bkDeadline || null },
      trainDetail: f.trService ? { service: f.trService, platform: f.trPlatform, jrPass: f.trJrPass } : null,
    };
  }

  /* ─── Safe merge — never replace more with fewer ─────────── */
  function mergeStops(remoteFlat) {
    const remote  = remoteFlat.map(unflatStop);
    const local   = Data.getStops();

    // If remote has substantially fewer stops, merge remote INTO local (not replace)
    if (remote.length < local.length * 0.8) {
      const merged = [...local];
      remote.forEach(r => {
        const idx = merged.findIndex(s => s.id === r.id);
        if (idx >= 0) {
          // Remote has an update to an existing stop — apply it
          merged[idx] = { ...merged[idx], ...r };
        } else {
          // New stop from remote — add it
          merged.push(r);
        }
      });
      return merged.sort((a, b) => {
        const dayOrder = ['d-1','d0','d1','d2','d3','d4','d5','d6','d7','d8','d9','d10','d11','d12'];
        const dd = dayOrder.indexOf(a.dayId) - dayOrder.indexOf(b.dayId);
        return dd !== 0 ? dd : (a.order || 0) - (b.order || 0);
      });
    }

    // Remote has sufficient data — full replace
    return remote.sort((a, b) => {
      const dayOrder = ['d-1','d0','d1','d2','d3','d4','d5','d6','d7','d8','d9','d10','d11','d12'];
      const dd = dayOrder.indexOf(a.dayId) - dayOrder.indexOf(b.dayId);
      return dd !== 0 ? dd : (a.order || 0) - (b.order || 0);
    });
  }

  /* ─── Apply remote data ──────────────────────────────────── */
  function applyRemote(data) {
    let changed = false;

    if (data.stops?.length) {
      const merged = mergeStops(data.stops);
      Data.setStops(merged);
      changed = true;
    }

    if (data.stamps?.length) {
      data.stamps.forEach(s => Data.setStampCollected(s.stopId, s.collected !== false));
      changed = true;
    }

    if (data.expenses?.length) {
      Data.setExpenses(data.expenses);
      changed = true;
    }

    if (data.packing?.length) {
      Data.setPackingItems(data.packing);
      changed = true;
    }

    if (data.overnight?.length) {
      data.overnight.forEach(o => Data.setOvernight(o.dayId, o));
      changed = true;
    }

    if (changed) {
      App.renderStampBanner();
      App.updateUrgentBadge();
      window.ItineraryScreen?.refresh?.();
      window.BookingsScreen?.refresh?.();
    }
  }

  /* ─── Push all local data ────────────────────────────────── */
  async function pushAll() {
    if (!db) return;
    const stops    = Data.getStops().map(s => db.tx.stops[s.id].update(flatStop(s)));
    const expenses = Data.getExpenses().map(e => db.tx.expenses[e.id].update(e));
    const packing  = Data.getPackingItems().map(p => db.tx.packing[p.id].update(p));
    const stamps   = Data.getStampStops()
      .filter(s => Data.isStampCollected(s.id))
      .map(s => db.tx.stamps[s.id].update({ stopId: s.id, collected: true }));
    const overnight = Object.entries(Data.getAllOvernight())
      .map(([dayId, o]) => db.tx.overnight[dayId].update({ dayId, ...o }));
    const all = [...stops, ...expenses, ...packing, ...stamps, ...overnight];
    if (all.length) await db.transact(all);
  }

  /* ─── Init ───────────────────────────────────────────────── */
  async function init() {
    if (!Config.INSTANT_APP_ID) {
      App.updateSyncStatus('offline');
      return;
    }
    try {
      const { init: iInit } = await loadIDB();
      db = iInit({ appId: Config.INSTANT_APP_ID });
      App.updateSyncStatus('syncing');

      _unsub = db.subscribeQuery(
        { stops:{}, stamps:{}, expenses:{}, packing:{}, overnight:{} },
        ({ data, error }) => {
          if (error) { console.error('[Sync]', error); App.updateSyncStatus('error'); return; }
          if (!data) return;

          if (!data.stops?.length && !_initPushed) {
            // InstantDB empty — push everything up
            _initPushed = true;
            pushAll().then(() => {
              App.updateSyncStatus('synced');
              Toast.show('Trip synced to InstantDB ✓', 'success');
            });
          } else {
            applyRemote(data);
            App.updateSyncStatus('synced');
            _initPushed = true;
          }
        }
      );
    } catch(e) {
      console.warn('[Sync] init:', e);
      App.updateSyncStatus('error');
    }
  }

  /* ─── Individual writes ──────────────────────────────────── */
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
  async function pushExpense(exp) {
    if (!db) return;
    try { await db.transact(db.tx.expenses[exp.id].update(exp)); }
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
        ? db.tx.stamps[stopId].update({ stopId, collected: true })
        : db.tx.stamps[stopId].delete();
      await db.transact(txn);
    } catch(e) { console.warn('[Sync] pushStamp:', e); }
  }
  async function pushPacking(item) {
    if (!db || !item) return;
    try { await db.transact(db.tx.packing[item.id].update(item)); }
    catch(e) { console.warn('[Sync] pushPacking:', e); }
  }
  async function removePacking(id) {
    if (!db) return;
    try { await db.transact(db.tx.packing[id].delete()); }
    catch(e) { console.warn('[Sync] removePacking:', e); }
  }
  async function pushOvernight(dayId, o) {
    if (!db) return;
    try { await db.transact(db.tx.overnight[dayId].update({ dayId, ...o })); }
    catch(e) { console.warn('[Sync] pushOvernight:', e); }
  }

  function destroy() {
    if (_unsub) { _unsub(); _unsub = null; }
    db = null;
  }

  return { init, pushAll, pushStop, removeStop, pushExpense, removeExpense, pushStamp, pushPacking, removePacking, pushOvernight, destroy };
})();

window.Sync = Sync;
