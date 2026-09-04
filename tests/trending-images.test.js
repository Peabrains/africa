const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('supabase/functions/trending-places/index.ts', 'utf8');

test('trending images require strict place matching and never use generic source fallbacks', () => {
  assert.match(source, /const strictMatch = completeName \|\| \(tokens\.size >= 2 && score === tokens\.size\)/);
  assert.match(source, /\.filter\(\(\{ strictMatch \}\) => strictMatch\)/);
  assert.doesNotMatch(source, /async function attachSourceImages/);
});
