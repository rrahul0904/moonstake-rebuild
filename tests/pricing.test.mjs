import test from 'node:test';
import assert from 'node:assert/strict';
import { sectorId, parseSectorId, sectorPrice, quoteSectors } from '../src/pricing.mjs';

test('sector ids round-trip', () => {
  assert.equal(sectorId(3, 7), 'S-03-07');
  assert.deepEqual(parseSectorId('S-03-07'), { x:3, y:7 });
});

test('standard lots start at one dollar', () => {
  assert.equal(sectorPrice('S-05-05'), 1);
});

test('landmark lots can be premium', () => {
  assert.ok(sectorPrice('S-38-17') >= 3);
});

test('quote removes duplicates and reports claimed sectors', () => {
  const q = quoteSectors(['S-05-05','S-05-05','S-06-05'], new Set(['S-06-05']));
  assert.equal(q.count,1);
  assert.equal(q.total,1);
  assert.deepEqual(q.unavailable,['S-06-05']);
});
