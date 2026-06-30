'use strict';

/* ============================================================
   DB — IndexedDB wrapper
   Africa Safari PWA — renamed from japan-trip
   Stores: stops | expenses | packing | meta | queue
   ============================================================ */
const DB = (() => {
  const NAME = 'africa-safari', VERSION = 2;
  let db;

  function open() {
    return new Promise((res, rej) => {
      if (db) return res(db);
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = e => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains('stops'))     d.createObjectStore('stops',     { keyPath:'id' });
        if (!d.objectStoreNames.contains('stamps'))    d.createObjectStore('stamps',    { keyPath:'stopId' });
        if (!d.objectStoreNames.contains('expenses'))  d.createObjectStore('expenses',  { keyPath:'id' });
        if (!d.objectStoreNames.contains('packing'))   d.createObjectStore('packing',   { keyPath:'id' });
        if (!d.objectStoreNames.contains('queue'))     d.createObjectStore('queue',     { keyPath:'id', autoIncrement:true });
        if (!d.objectStoreNames.contains('meta'))      d.createObjectStore('meta',      { keyPath:'key' });
        if (!d.objectStoreNames.contains('dexPhotos')) d.createObjectStore('dexPhotos', { keyPath:'id' });
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
    deleteStop:  (id)     => del('stops', id),
    clearStops:  ()       => clear('stops'),

    /* Stamps (unused in Africa but kept for API compatibility) */
    loadStamps:  ()               => getAll('stamps').then(rows => rows.filter(r => r.collected).map(r => r.stopId)),
    saveStamp:   (stopId, collected) => put('stamps', { stopId, collected }),
    clearStamps: ()               => clear('stamps'),

    /* Expenses */
    loadExpenses:  ()    => getAll('expenses'),
    saveExpense:   (exp) => put('expenses', exp),
    deleteExpense: (id)  => del('expenses', id),
    clearExpenses: ()    => clear('expenses'),

    /* Packing */
    loadPacking:     ()          => getAll('packing'),
    savePacking:     (items)     => Promise.all(items.map(i => put('packing', i))),
    savePackingItem: (item)      => put('packing', item),
    deletePacking:   (id)        => del('packing', id),
    clearPacking:    ()          => clear('packing'),
    togglePacking: (id, checked) => open().then(() => new Promise((res, rej) => {
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
    queueChange: (change) => put('queue', { ...change, id: Date.now() + Math.random() }),
    loadQueue:   ()        => getAll('queue'),
    clearQueue:  ()        => clear('queue'),

    /* Travelers + overnight */
    loadTravelers: ()       => getMeta('travelers').then(v => v || []),
    saveTravelers: (names)  => setMeta('travelers', names),
    loadOvernight: ()       => getMeta('overnight').then(v => v || null),
    saveOvernight: (data)   => setMeta('overnight', data),

    /* Custom links */
    loadCustomLinks: () => getMeta('customLinks').then(v => v || []),
    saveCustomLinks: (links) => setMeta('customLinks', links),

    /* Safari Dex — catch state + photos (stored separately, photos can be large) */
    loadDex: () => getMeta('dexState').then(v => v || {}),
    saveDex: (state) => setMeta('dexState', state),
    saveDexPhoto: (photoId, dataUrl) => put('dexPhotos', { id: photoId, dataUrl, savedAt: Date.now() }),
    loadDexPhoto: (photoId) => open().then(() => new Promise((res, rej) => {
      const req = tx('dexPhotos').get(photoId);
      req.onsuccess = () => res(req.result?.dataUrl || null);
      req.onerror   = () => rej(req.error);
    })),
    deleteDexPhoto: (photoId) => del('dexPhotos', photoId),
    clearDexPhotos: () => clear('dexPhotos'),

    /* Meta */
    getMeta,
    setMeta,
    getLastSync:  ()    => getMeta('lastSync'),
    setLastSync:  (ts)  => setMeta('lastSync', ts),
    clearMeta:    ()    => clear('meta'),
  };
})();

window.DB = DB;
