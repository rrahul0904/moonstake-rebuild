import test from 'node:test';
import assert from 'node:assert/strict';
import { sectorId, lotId, parseSectorId, parseLotId, sectorPrice, registryPrice, quoteSectors } from '../src/pricing.mjs';

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


test('canonical Atlas 259 Moon lot ids round-trip',()=>{
  assert.equal(lotId(360,180),'MOON-360-180');
  assert.deepEqual(parseLotId('MOON-360-180'),{id:'MOON-360-180',kind:'moon-lot',x:360,y:180});
});

test('canonical Moon lots use MLD named-ground pricing',()=>{
  const price=registryPrice('MOON-406-178');
  assert.equal(price.priceCents,2500);
  assert.equal(price.landmark,'Apollo 11');
});

test('quote can mix legacy donor data with canonical Atlas 259 positions during migration',()=>{
  const q=quoteSectors(['S-05-05','MOON-360-180'],new Set());
  assert.equal(q.count,2);
  assert.equal(q.totalCents,200);
  assert.equal(q.total,2);
});
