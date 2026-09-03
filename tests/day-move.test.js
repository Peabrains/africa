'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

function queryResult(data = []) {
  const query = {
    select() { return query; },
    eq() { return query; },
    order() { return Promise.resolve({ data, error: null }); },
    then(resolve) { resolve({ data, error: null }); },
  };
  return query;
}

async function loadData({ online }) {
  const trip = {
    id: 'trip-1', name: 'Test trip', status: 'active',
    start_date: '2026-06-05', end_date: '2026-06-08',
    settings: { defaultTimezone: 'Asia/Bangkok' },
  };
  const cachedDays = [
    { id: 'day-a', trip_id: 'trip-1', day_index: 0, day_label: 'D0', date: '2026-06-05', title: 'Old plan', locality: 'Bangkok', segment: 'TH' },
    { id: 'day-b', trip_id: 'trip-1', day_index: 1, day_label: 'D1', date: '2026-06-08', title: 'Target plan', locality: 'Bangkok', segment: 'TH' },
  ];
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
        if (key === 'sb_days::trip-1') return cachedDays;
        return null;
      },
      async setMeta() {}, async loadBucket() { return []; }, async saveBucket() {},
      async loadQueue() { return []; }, async dequeueChange() {}, async queueChange() {},
    },
    SB: {
      rpc: async (name, params) => {
        rpcCalls.push({ name, params });
        return { data: { blank_day_id: 'blank-1', overridden_day_id: params.p_override ? 'day-b' : null }, error: null };
      },
      from(table) { return queryResult(table === 'itinerary_days' ? cachedDays : []); },
    },
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/data-platform.js'), 'utf8'), context);
  await context.window.Data.init();
  navigator.onLine = online;
  return { Data: context.window.Data, rpcCalls };
}

test('moveDay calls the atomic RPC with explicit override intent', async () => {
  const { Data, rpcCalls } = await loadData({ online: true });

  await Data.moveDay('day-a', '2026-06-08', { override: true });

  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].name, 'move_itinerary_day');
  assert.deepEqual({ ...rpcCalls[0].params }, {
    p_day_id: 'day-a',
    p_target_date: '2026-06-08',
    p_override: true,
  });
});

test('moveDay refuses destructive date changes while offline', async () => {
  const { Data, rpcCalls } = await loadData({ online: false });

  await assert.rejects(
    Data.moveDay('day-a', '2026-06-08', { override: true }),
    /internet connection/i,
  );
  assert.equal(rpcCalls.length, 0);
});

test('day editor exposes date move and two explicit override confirmations', () => {
  const source = fs.readFileSync(path.join(ROOT, 'js/bottom-sheet.js'), 'utf8');

  assert.match(source, /field\('Date','d-date',day\.date,'date'\)/);
  assert.match(source, /Override this date/);
  assert.match(source, /Permanently override/);
});

test('migration defines an authorized atomic move that creates a contextual blank day', () => {
  const migrationsDir = path.join(ROOT, 'supabase/migrations');
  const migration = fs.existsSync(migrationsDir)
    ? fs.readdirSync(migrationsDir).find(name => name.endsWith('_move_itinerary_day.sql'))
    : null;
  assert.ok(migration, 'move_itinerary_day migration must exist');

  const sql = fs.readFileSync(path.join(migrationsDir, migration), 'utf8');
  assert.match(sql, /create or replace function public\.move_itinerary_day/i);
  assert.match(sql, /security definer set search_path = ''/i);
  assert.match(sql, /public\.is_trip_editor/i);
  assert.match(sql, /p_override boolean/i);
  assert.match(sql, /delete from public\.itinerary_days/i);
  assert.match(sql, /insert into public\.itinerary_days[\s\S]*locality[\s\S]*segment[\s\S]*weather_points/i);
  assert.match(sql, /row_number\(\) over[\s\S]*order by date/i);
  assert.match(sql, /revoke execute[\s\S]*from public/i);
  assert.match(sql, /grant execute[\s\S]*to authenticated/i);
});
