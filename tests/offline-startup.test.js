'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function loadAuth({ online, storedSession, storedSessionKey = 'sb-abycrkrfaocttujzhqhq-auth-token', getSessionResult }) {
  const appended = [];
  const storage = new Map();
  const elements = new Map();
  const fakeElement = () => ({
    style: {},
    dataset: {},
    value: '',
    textContent: '',
    disabled: false,
    addEventListener() {},
    remove() {},
  });
  if (storedSession) {
    storage.set(storedSessionKey, JSON.stringify(storedSession));
  }

  const context = {
    console,
    Promise,
    setTimeout,
    navigator: { onLine: online },
    localStorage: {
      get length() { return storage.size; },
      key(index) { return [...storage.keys()][index] ?? null; },
      getItem(key) { return storage.get(key) ?? null; },
    },
    document: {
      body: { appendChild(node) { appended.push(node); } },
      createElement() { return { ...fakeElement(), innerHTML: '' }; },
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, fakeElement());
        return elements.get(id);
      },
    },
    SB: {
      auth: {
        getSession: async () => getSessionResult,
        onAuthStateChange() {},
      },
    },
  };
  context.window = {
    location: { hash: '' },
    __authRedirectHash: '',
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/auth.js'), 'utf8'), context);
  return { Auth: context.window.Auth, appended };
}

test('offline startup accepts the previously cached Supabase user', async () => {
  const cachedUser = { id: 'traveler-1', email: 'traveler@example.com' };
  const { Auth, appended } = loadAuth({
    online: false,
    storedSession: { access_token: 'expired-is-fine-offline', user: cachedUser },
    getSessionResult: { data: { session: null }, error: new Error('network unavailable') },
  });

  const user = await Promise.race([
    Auth.gate(),
    new Promise(resolve => setTimeout(() => resolve(null), 10)),
  ]);

  assert.equal(user?.id, cachedUser.id);
  assert.equal(appended.length, 0, 'the login overlay must not replace cached trips offline');
});

test('offline startup does not accept another app’s Supabase session', async () => {
  const { Auth, appended } = loadAuth({
    online: false,
    storedSessionKey: 'sb-another-project-auth-token',
    storedSession: { access_token: 'other-app-token', user: { id: 'other-user' } },
    getSessionResult: { data: { session: null }, error: null },
  });

  const result = await Promise.race([
    Auth.gate(),
    new Promise(resolve => setTimeout(() => resolve('waiting-for-network'), 10)),
  ]);

  assert.equal(result, 'waiting-for-network');
  assert.equal(appended.length, 1, 'a device without this app’s cached session should show the offline screen');
});

test('offline trip loading reads IndexedDB without attempting Supabase', async () => {
  const cachedTrips = [{ id: 'trip-1', name: 'Cached trip', status: 'active' }];
  let authCalls = 0;
  const context = {
    console,
    navigator: { onLine: false },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    window: {
      matchMedia() { return { matches: false, addEventListener() {} }; },
    },
    document: { documentElement: { style: { setProperty() {}, removeProperty() {} } } },
    DB: {
      async getMeta(key) { return key === 'sb_trips' ? cachedTrips : null; },
      async setMeta() {},
      async loadQueue() { return []; },
    },
    SB: {
      auth: {
        async getUser() { authCalls += 1; throw new Error('must not call auth offline'); },
      },
      from() {
        const query = {
          select() { return query; },
          eq() { return query; },
          order() { return Promise.resolve({ data: [], error: null }); },
          then(resolve) { resolve({ data: [], error: null }); },
        };
        return query;
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/data-platform.js'), 'utf8'), context);

  const trips = await context.window.Data.loadTrips();

  assert.equal(authCalls, 0);
  assert.equal(trips.length, 1);
  assert.equal(trips[0].id, 'trip-1');
});
