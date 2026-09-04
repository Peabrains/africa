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

async function loadData({ online = true, targetOccupied = false } = {}) {
  const trip = {
    id: 'trip-1', name: 'Test trip', status: 'active',
    start_date: '2026-06-05', end_date: '2026-06-06',
    settings: { defaultTimezone: 'Asia/Bangkok' },
  };
  const days = [
    { id: 'day-a', trip_id: 'trip-1', day_index: 0, day_label: 'D0', date: '2026-06-05' },
    { id: 'day-b', trip_id: 'trip-1', day_index: 1, day_label: 'D1', date: '2026-06-06' },
  ];
  const stay = {
    id: 'stay-a', trip_id: 'trip-1', day_id: 'day-a', name: 'Riverside Hotel',
    address: '1 River Road', status: 'booked', ref: 'HOTEL-42', cost: 240,
    cost_currency: 'THB', payment_status: 'partial', amount_paid: 100,
    deadline: '2026-05-01', notes: 'Late arrival', lat: 13.7, lng: 100.5,
    luggage_forwarding: { enabled: true, to: 'Next hotel', courier: 'Yamato' },
  };
  const occupiedStay = { id: 'stay-b', trip_id: 'trip-1', day_id: 'day-b', name: 'Existing Hotel' };
  const beforeStays = targetOccupied ? [stay, occupiedStay] : [stay];
  const afterStays = targetOccupied ? beforeStays : [{ ...stay, day_id: 'day-b' }];
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
        if (key === 'sb_overnight::trip-1') {
          return Object.fromEntries(beforeStays.map(item => [item.day_id, item]));
        }
        return null;
      },
      async setMeta() {}, async loadBucket() { return []; }, async saveBucket() {},
      async loadQueue() { return []; }, async dequeueChange() {}, async queueChange() {},
    },
    SB: {
      async rpc(name, params) {
        rpcCalls.push({ name, params });
        moved = true;
        return { data: { overnight_id: 'stay-a' }, error: null };
      },
      from(table) {
        if (table === 'itinerary_days') return queryResult(days);
        if (table === 'overnights') return queryResult(moved ? afterStays : beforeStays);
        return queryResult([]);
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/data-platform.js'), 'utf8'), context);
  await context.window.Data.init();
  navigator.onLine = online;
  return { Data: context.window.Data, rpcCalls, stay };
}

test('moveOvernight leaves the source blank and preserves the complete stay', async () => {
  const { Data, rpcCalls, stay } = await loadData();

  await Data.moveOvernight('day-a', 'day-b');

  assert.equal(rpcCalls[0].name, 'move_overnight_to_day');
  assert.equal(rpcCalls[0].params.p_source_day_id, 'day-a');
  assert.equal(rpcCalls[0].params.p_target_day_id, 'day-b');
  assert.equal(Data.getOvernight('day-a'), null);
  const moved = Data.getOvernight('day-b');
  for (const key of Object.keys(stay)) {
    if (key !== 'day_id') assert.deepEqual(moved[key], stay[key], `preserves ${key}`);
  }
  assert.equal(moved.day_id, 'day-b');
});

test('moveOvernight refuses offline moves without calling the server', async () => {
  const { Data, rpcCalls } = await loadData({ online: false });

  await assert.rejects(Data.moveOvernight('day-a', 'day-b'), /internet connection/i);
  assert.equal(rpcCalls.length, 0);
});

test('moveOvernight refuses to overwrite an occupied destination', async () => {
  const { Data, rpcCalls } = await loadData({ targetOccupied: true });

  await assert.rejects(Data.moveOvernight('day-a', 'day-b'), /already has accommodation/i);
  assert.equal(rpcCalls.length, 0);
});
