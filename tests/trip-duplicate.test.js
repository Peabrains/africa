'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const DRAFT_KEY = 'africa-ai-planner-draft-v1';
const TRENDING_KEY = 'africa-ai-planner-trending-v1';

function queryResult(data = []) {
  const query = {
    select() { return query; },
    eq() { return query; },
    order() { return Promise.resolve({ data, error: null }); },
    then(resolve) { resolve({ data, error: null }); },
  };
  return query;
}

async function loadData({ online = true } = {}) {
  const sourceTrip = {
    id: 'trip-source', name: 'Thailand', owner_id: 'user-1', status: 'upcoming',
    start_date: '2026-11-01', end_date: '2026-11-10', countries: ['Thailand'],
    settings: { defaultTimezone: 'Asia/Bangkok' },
  };
  const copiedTrip = {
    ...sourceTrip,
    id: 'trip-copy',
    name: 'Thailand — Copy',
    settings: { ...sourceTrip.settings },
  };
  const store = new Map([
    ['sb_trips', [sourceTrip]],
    [`${DRAFT_KEY}:trip-source`, JSON.stringify({
      tripKey: 'trip-source',
      focusDayId: 'day-old',
      proposal: { items: [{ name: 'Market', dayId: 'day-old' }] },
      selected: [0],
    })],
    [`${TRENDING_KEY}:trip-source`, JSON.stringify({
      tripKey: 'trip-source',
      results: { places: [{ name: 'Cafe' }] },
      selected: [0],
    })],
  ]);
  const rpcCalls = [];
  const navigator = { onLine: false };
  const context = {
    console,
    navigator,
    localStorage: {
      getItem(key) { return store.get(key) ?? null; },
      setItem(key, value) { store.set(key, String(value)); },
      removeItem(key) { store.delete(key); },
    },
    document: { documentElement: { style: { setProperty() {}, removeProperty() {} } } },
    window: { matchMedia() { return { matches: false, addEventListener() {} }; } },
    DB: {
      async getMeta(key) {
        if (key === 'sb_trips') return [sourceTrip];
        if (key === 'sb_days::trip-source') return [];
        return null;
      },
      async setMeta(key, value) { if (key === 'sb_trips') store.set(key, value); },
      async loadBucket() { return []; }, async saveBucket() {},
      async loadQueue() { return []; }, async dequeueChange() {}, async queueChange() {},
    },
    SB: {
      auth: { async getUser() { return { data: { user: { id: 'user-1' } } }; } },
      rpc: async (name, params) => {
        rpcCalls.push({ name, params });
        return {
          data: {
            trip: copiedTrip,
            day_id_map: { 'day-old': 'day-new' },
            copied_counts: { itinerary_days: 1, stops: 1 },
          },
          error: null,
        };
      },
      from(table) { return queryResult(table === 'trips' ? [sourceTrip] : []); },
    },
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/data-platform.js'), 'utf8'), context);
  await context.window.Data.init();
  navigator.onLine = online;
  return { Data: context.window.Data, rpcCalls, sourceTrip, store };
}

test('duplicateTrip creates an independent trip through one atomic RPC', async () => {
  const { Data, rpcCalls, sourceTrip } = await loadData();

  const copy = await Data.duplicateTrip('trip-source', 'Thailand — Copy');

  assert.deepEqual({ name: rpcCalls[0].name, params: { ...rpcCalls[0].params } }, {
    name: 'duplicate_trip',
    params: { p_source_trip_id: 'trip-source', p_copy_name: 'Thailand — Copy' },
  });
  assert.equal(copy.id, 'trip-copy');
  assert.equal(Data.getTrips().length, 2);
  copy.name = 'Changed copy';
  assert.equal(sourceTrip.name, 'Thailand');
});

test('duplicateTrip remaps the copied planner state to the new trip and day IDs', async () => {
  const { Data, store } = await loadData();

  await Data.duplicateTrip('trip-source', 'Thailand — Copy');

  const draft = JSON.parse(store.get(`${DRAFT_KEY}:trip-copy`));
  const trending = JSON.parse(store.get(`${TRENDING_KEY}:trip-copy`));
  assert.equal(draft.tripKey, 'trip-copy');
  assert.equal(draft.focusDayId, 'day-new');
  assert.equal(draft.proposal.items[0].dayId, 'day-new');
  assert.equal(trending.tripKey, 'trip-copy');
  assert.equal(JSON.parse(store.get(`${DRAFT_KEY}:trip-source`)).focusDayId, 'day-old');
});

test('duplicateTrip refuses to create a partial copy while offline', async () => {
  const { Data, rpcCalls } = await loadData({ online: false });

  await assert.rejects(
    Data.duplicateTrip('trip-source', 'Thailand — Copy'),
    /internet connection/i,
  );
  assert.equal(rpcCalls.length, 0);
});

async function loadPhotoData({ sharedReference }) {
  const trip = { id: 'trip-copy', name: 'Copy', owner_id: 'user-1', status: 'active', settings: {} };
  const storagePath = 'trip-source/lion.jpg';
  const dexPhotoRows = [
    { id: 'photo-copy', trip_id: 'trip-copy', catch_id: 'catch-copy', animal_id: 'lion', storage_path: storagePath },
    ...(sharedReference ? [{ id: 'photo-source', trip_id: 'trip-source', catch_id: 'catch-source', animal_id: 'lion', storage_path: storagePath }] : []),
  ];
  const storageRemoveCalls = [];

  function tableQuery(table) {
    let action = 'select';
    const filters = {};
    const query = {
      select() { action = 'select'; return query; },
      delete() { action = 'delete'; return query; },
      eq(column, value) { filters[column] = value; return query; },
      order() { return query; },
      limit() { return query; },
      then(resolve) {
        let data = [];
        if (table === 'trips') data = [trip];
        if (table === 'dex_catches') {
          data = [{ id: 'catch-copy', trip_id: 'trip-copy', animal_id: 'lion', dex_photos: dexPhotoRows.filter(p => p.trip_id === 'trip-copy') }];
        }
        if (table === 'dex_photos') {
          if (action === 'delete') {
            for (let i = dexPhotoRows.length - 1; i >= 0; i--) {
              if (Object.entries(filters).every(([key, value]) => dexPhotoRows[i][key] === value)) dexPhotoRows.splice(i, 1);
            }
          }
          data = dexPhotoRows.filter(row => Object.entries(filters).every(([key, value]) => row[key] === value));
        }
        resolve({ data, error: null });
      },
    };
    return query;
  }

  const context = {
    console,
    navigator: { onLine: true },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    document: { documentElement: { style: { setProperty() {}, removeProperty() {} } } },
    window: { matchMedia() { return { matches: false, addEventListener() {} }; } },
    DB: {
      async getMeta() { return null; }, async setMeta() {},
      async loadBucket() { return []; }, async saveBucket() {},
      async loadQueue() { return []; }, async dequeueChange() {}, async queueChange() {},
      async deleteDexPhoto() {}, async loadDexPhoto() { return null; },
    },
    SB: {
      auth: { async getUser() { return { data: { user: { id: 'user-1' } } }; } },
      from: tableQuery,
      storage: { from() { return { async remove(paths) { storageRemoveCalls.push(paths); return { error: null }; } }; } },
    },
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/data-platform.js'), 'utf8'), context);
  await context.window.Data.init();
  return { Data: context.window.Data, dexPhotoRows, storageRemoveCalls };
}

test('deleting a duplicated photo reference keeps a file still used by the original trip', async () => {
  const { Data, dexPhotoRows, storageRemoveCalls } = await loadPhotoData({ sharedReference: true });

  await Data.removeDexPhoto('lion', 'photo-copy');

  assert.deepEqual(dexPhotoRows.map(row => row.id), ['photo-source']);
  assert.equal(storageRemoveCalls.length, 0);
});

test('deleting the last photo reference removes its storage object', async () => {
  const { Data, dexPhotoRows, storageRemoveCalls } = await loadPhotoData({ sharedReference: false });

  await Data.removeDexPhoto('lion', 'photo-copy');

  assert.equal(dexPhotoRows.length, 0);
  assert.equal(storageRemoveCalls.length, 1);
  assert.equal(storageRemoveCalls[0][0], 'trip-source/lion.jpg');
});
