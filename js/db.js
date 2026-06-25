'use strict';

/* ============================================================
   DB — IndexedDB wrapper
   Stores: stops | stamps | expenses | packing | queue
   ============================================================ */
const DB = (() => {
  const NAME = 'japan-trip', VERSION = 1;
  let db;

  function open() {
    return new Promise((res, rej) => {
      if (db) return res(db);
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = e => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains('stops'))    d.createObjectStore('stops',    { keyPath:'id' });
        if (!d.objectStoreNames.contains('stamps'))   d.createObjectStore('stamps',   { keyPath:'stopId' });
        if (!d.objectStoreNames.contains('expenses')) d.createObjectStore('expenses', { keyPath:'id' });
        if (!d.objectStoreNames.contains('packing'))  d.createObjectStore('packing',  { keyPath:'id' });
        if (!d.objectStoreNames.contains('queue'))    d.createObjectStore('queue',    { keyPath:'id', autoIncrement:true });
        if (!d.objectStoreNames.contains('meta'))     d.createObjectStore('meta',     { keyPath:'key' });
      };
      req.onsuccess = e => { db = e.target.result; res(db); };
      req.onerror   = e => rej(e.target.error);
    });
  }

  function tx(store, mode='readonly') {
    return db.transaction(store, mode).objectStore(store);
  }

  function getAll(store) {
    return open().then(() => new Promise((res, rej) => {
      const req = tx(store).getAll();
      req.onsuccess = () => res(req.result);
      req.onerror   = () => rej(req.error);
    }));
  }

  function put(store, val) {
    return open().then(() => new Promise((res, rej) => {
      const req = tx(store, 'readwrite').put(val);
      req.onsuccess = () => res(req.result);
      req.onerror   = () => rej(req.error);
    }));
  }

  function del(store, key) {
    return open().then(() => new Promise((res, rej) => {
      const req = tx(store, 'readwrite').delete(key);
      req.onsuccess = () => res();
      req.onerror   = () => rej(req.error);
    }));
  }

  function clear(store) {
    return open().then(() => new Promise((res, rej) => {
      const req = tx(store, 'readwrite').clear();
      req.onsuccess = () => res();
      req.onerror   = () => rej(req.error);
    }));
  }

  function getMeta(key) {
    return open().then(() => new Promise((res) => {
      const req = tx('meta').get(key);
      req.onsuccess = () => res(req.result?.value ?? null);
      req.onerror   = () => res(null);
    }));
  }

  function setMeta(key, value) {
    return put('meta', { key, value });
  }

  return {
    init: open,

    /* Stops */
    loadStops:   ()       => getAll('stops'),
    saveStop:    (stop)   => put('stops', { ...stop, _savedAt: Date.now() }),
    saveStops:   (stops)  => Promise.all(stops.map(s => put('stops', { ...s, _savedAt: Date.now() }))),

    /* Stamps */
    loadStamps:  ()       => getAll('stamps').then(rows => rows.filter(r => r.collected).map(r => r.stopId)),
    saveStamp:   (stopId, collected) => put('stamps', { stopId, collected }),

    /* Expenses */
    loadExpenses:  ()     => getAll('expenses'),
    saveExpense:   (exp)  => put('expenses', exp),
    deleteExpense: (id)   => del('expenses', id),

    /* Packing */
    loadPacking:   ()          => getAll('packing'),
    savePacking:   (items)     => Promise.all(items.map(i => put('packing', i))),
    togglePacking: (id, checked) => open().then(() => new Promise((res,rej) => {
      const store = tx('packing', 'readwrite');
      const req   = store.get(id);
      req.onsuccess = () => {
        const item = req.result;
        if (item) { item.checked = checked; store.put(item); }
        res();
      };
      req.onerror = () => rej(req.error);
    })),

    /* Sync queue */
    queueChange:  (change) => put('queue', { ...change, id: Date.now() + Math.random() }),
    loadQueue:    ()        => getAll('queue'),
    clearQueue:   ()        => clear('queue'),

    /* Stops — delete */
    deleteStop: (id) => del('stops', id),

    /* Packing — save single item + delete */
    savePackingItem: (item) => put('packing', item),
    deletePacking:   (id)   => del('packing', id),

    /* Travelers */
    loadTravelers: () => getMeta('travelers').then(v => v || []),
    saveTravelers: (names) => setMeta('travelers', names),

    /* Overnight */
    loadOvernight: () => getMeta('overnight').then(v => v || null),
    saveOvernight: (data) => setMeta('overnight', data),

    /* Meta */
    getLastSync:  ()    => getMeta('lastSync'),
    setLastSync:  (ts)  => setMeta('lastSync', ts),
  };
})();

window.DB = DB;
