'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

function loadSharing() {
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/budget-sharing.js'), 'utf8'), context);
  return context.window.BudgetSharing;
}

test('budget sharing defaults to all travellers and calculates an equal share', () => {
  const sharing = loadSharing();
  assert.deepEqual(Array.from(sharing.normalizeSelection([], ['VN', 'CK'])), ['VN', 'CK']);
  assert.equal(sharing.perPerson(15000, ['VN', 'CK']), 7500);
});

test('budget sharing ignores names no longer on the trip', () => {
  const sharing = loadSharing();
  assert.deepEqual(Array.from(sharing.normalizeSelection(['VN', 'Former traveller'], ['VN', 'CK'])), ['VN']);
});

test('budget sharing groups category totals without changing the trip total', () => {
  const sharing = loadSharing();
  const result = sharing.groupByCategory([
    { category: 'Accommodation', cost: 18000 },
    { category: 'Transport', cost: 15000 },
    { category: 'Accommodation', cost: 24000 },
  ]);
  assert.equal(result.Accommodation.total, 42000);
  assert.equal(result.Transport.total, 15000);
  assert.equal(sharing.total([{ cost: 18000 }, { cost: 15000 }, { cost: 24000 }]), 57000);
});

test('cost selector label shows selected traveller initials instead of sharing text', () => {
  const sharing = loadSharing();
  assert.equal(sharing.selectionLabel(['VN', 'CK']), 'VN + CK');
  assert.equal(sharing.selectionLabel(['VN']), 'VN');
  assert.equal(sharing.selectionLabel([]), 'Select');
});

test('inline traveller chips toggle shares but never leave a cost unassigned', () => {
  const sharing = loadSharing();
  assert.deepEqual(Array.from(sharing.toggleSelection(['VN', 'CK'], 'VN')), ['CK']);
  assert.deepEqual(Array.from(sharing.toggleSelection(['VN'], 'VN')), ['VN']);
  assert.deepEqual(Array.from(sharing.toggleSelection(['VN'], 'CK')), ['VN', 'CK']);
});
