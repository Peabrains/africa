'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function loadApp(pendingCount) {
  const badge = { className: '', textContent: '' };
  const context = {
    console,
    navigator: {},
    sessionStorage: { setItem() {}, getItem() { return null; } },
    document: {
      getElementById(id) { return id === 'sync-badge' ? badge : null; },
      querySelectorAll() { return []; },
      addEventListener() {},
    },
    Data: { async getPendingCount() { return pendingCount; } },
  };
  context.window = { addEventListener() {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8'), context);
  return { App: context.window.App, badge };
}

test('offline badge includes pending changes without hiding offline state', async () => {
  const { App, badge } = loadApp(2);

  await App.updateSyncStatus('offline');

  assert.equal(badge.textContent, 'Offline · 2 pending');
  assert.match(badge.className, /badge-open/);
});

test('online pending badge remains the compact pending count', async () => {
  const { App, badge } = loadApp(2);

  await App.updateSyncStatus('synced');

  assert.equal(badge.textContent, '2 pending');
  assert.match(badge.className, /badge-pending/);
});
