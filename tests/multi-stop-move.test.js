'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

function queryResult(rows = []) {
  const query = {
    select() { return query; },
    eq() { return query; },
    order() { return Promise.resolve({ data: rows, error: null }); },
    then(resolve) { resolve({ data: rows, error: null }); },
  };
  return query;
}

async function loadData({ online = true } = {}) {
  const trip = {
    id: 'trip-1', name: 'Test trip', status: 'active',
    start_date: '2026-06-05', end_date: '2026-06-06',
    settings: { defaultTimezone: 'Asia/Bangkok' },
  };
  const days = [
    { id: 'day-a', trip_id: 'trip-1', day_index: 0, day_label: 'D0', date: '2026-06-05' },
    { id: 'day-b', trip_id: 'trip-1', day_index: 1, day_label: 'D1', date: '2026-06-06' },
  ];
  const beforeStops = [
    { id: 'stop-a', trip_id: 'trip-1', day_id: 'day-a', sort_order: 0, name: 'First selected', notes: 'keep me' },
    { id: 'stop-b', trip_id: 'trip-1', day_id: 'day-a', sort_order: 1, name: 'Second selected', activity: 'keep this too' },
    { id: 'stop-c', trip_id: 'trip-1', day_id: 'day-a', sort_order: 2, name: 'Stays behind' },
    { id: 'stop-d', trip_id: 'trip-1', day_id: 'day-b', sort_order: 0, name: 'Already there' },
  ];
  const afterStops = [
    { ...beforeStops[2], sort_order: 0 },
    beforeStops[3],
    { ...beforeStops[0], day_id: 'day-b', sort_order: 1 },
    { ...beforeStops[1], day_id: 'day-b', sort_order: 2 },
  ];
  let moved = false;
  const rpcCalls = [];
  const navigator = { onLine: false };
  const context = {
    console,
    navigator,
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    document: { documentElement: { style: { setProperty() {}, removeProperty() {} } } },
    window: { matchMedia() { return { matches: false, addEventListener() {} }; } },
    DB: {
      async getMeta(key) {
        if (key === 'sb_trips') return [trip];
        if (key === 'sb_days::trip-1') return days;
        if (key === 'sb_stops::trip-1') return beforeStops;
        return null;
      },
      async setMeta() {}, async loadBucket() { return []; }, async saveBucket() {},
      async loadQueue() { return []; }, async dequeueChange() {}, async queueChange() {},
    },
    SB: {
      async rpc(name, params) {
        rpcCalls.push({ name, params });
        moved = true;
        return { data: { moved_count: 2 }, error: null };
      },
      from(table) {
        if (table === 'itinerary_days') return queryResult(days);
        if (table === 'stops') return queryResult(moved ? afterStops : beforeStops);
        return queryResult([]);
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/data-platform.js'), 'utf8'), context);
  await context.window.Data.init();
  navigator.onLine = online;
  return { Data: context.window.Data, rpcCalls };
}

test('moveStops atomically appends selected stops in their existing order', async () => {
  const { Data, rpcCalls } = await loadData();

  await Data.moveStops(['stop-b', 'stop-a'], 'day-b');

  assert.equal(rpcCalls[0].name, 'move_stops_to_day');
  assert.deepEqual([...rpcCalls[0].params.p_stop_ids], ['stop-b', 'stop-a']);
  assert.equal(rpcCalls[0].params.p_target_day_id, 'day-b');
  assert.deepEqual(Data.getStopsByDay('day-a').map(stop => stop.name), ['Stays behind']);
  assert.deepEqual(Data.getStopsByDay('day-b').map(stop => stop.name), [
    'Already there', 'First selected', 'Second selected',
  ]);
  assert.equal(Data.getStopsByDay('day-b')[1].notes, 'keep me');
  assert.equal(Data.getStopsByDay('day-b')[2].activity, 'keep this too');
});

test('moveStops refuses a partial multi-stop move while offline', async () => {
  const { Data, rpcCalls } = await loadData({ online: false });

  await assert.rejects(Data.moveStops(['stop-a', 'stop-b'], 'day-b'), /internet connection/i);
  assert.equal(rpcCalls.length, 0);
});

test('moveStops requires at least one stop and a different destination day', async () => {
  const { Data, rpcCalls } = await loadData();

  await assert.rejects(Data.moveStops([], 'day-b'), /select at least one stop/i);
  await assert.rejects(Data.moveStops(['stop-a'], 'day-a'), /another day/i);
  assert.equal(rpcCalls.length, 0);
});
