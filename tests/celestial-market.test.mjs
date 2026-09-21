import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BODY_CATALOG,
  SOLID_BODY_IDS,
  OBSERVATION_BODY_IDS,
  bodyLotId,
  parseBodyLotId,
  latLonToBodyLot,
  bodyPrimaryPriceCents,
  settleBodySale,
  bodyIndexFromGmvCents,
  solarIndexFromBodyGmv,
  launchPlan,
} from '../src/celestial-market.mjs';

test('catalog separates solid surface markets from non-land observation inventory', () => {
  assert.equal(BODY_CATALOG.moon.inventoryMode, 'surface-lots');
  assert.equal(BODY_CATALOG.mars.inventoryMode, 'surface-lots');
  assert.equal(BODY_CATALOG.jupiter.inventoryMode, 'observation-zones');
  assert.equal(BODY_CATALOG.sun.inventoryMode, 'observation-zones');
  assert.ok(SOLID_BODY_IDS.includes('europa'));
  assert.ok(OBSERVATION_BODY_IDS.includes('saturn'));
});

test('all solid launch bodies preserve the 259,200 angular-address board', () => {
  for (const bodyId of SOLID_BODY_IDS) {
    assert.equal(BODY_CATALOG[bodyId].grid.cols * BODY_CATALOG[bodyId].grid.rows, 259_200);
  }
});

test('body lot identifiers are globally unambiguous', () => {
  assert.equal(bodyLotId('mars', 719, 359), 'MARS-719-359');
  assert.deepEqual(parseBodyLotId('EUROPA-000-000'), { id: 'EUROPA-000-000', bodyId: 'europa', x: 0, y: 0 });
  assert.throws(() => parseBodyLotId('JUPITER-000-000'), /does not expose surface lots/);
});

test('lat/lon maps consistently on each solid body', () => {
  assert.deepEqual(latLonToBodyLot('mars', 0, 0), { id: 'MARS-360-180', bodyId: 'mars', x: 360, y: 180 });
  assert.deepEqual(latLonToBodyLot('mercury', 90, -180), { id: 'MERCURY-000-000', bodyId: 'mercury', x: 0, y: 0 });
});

test('Moon pricing remains backward compatible with the MLD model', () => {
  const moon = bodyPrimaryPriceCents('moon', 'MOON-406-178');
  assert.equal(moon.bodyId, 'moon');
  assert.equal(moon.landmark, 'Apollo 11');
  assert.equal(moon.priceCents, 2500);
});

test('new bodies can apply curated official-feature premiums without changing base economics', () => {
  const standard = bodyPrimaryPriceCents('mars', 'MARS-360-180');
  const landmark = bodyPrimaryPriceCents('mars', 'MARS-360-180', { landmarkMultiplier: 5 });
  assert.equal(standard.priceCents, 200);
  assert.equal(landmark.priceCents, 1000);
  assert.equal(landmark.tier, 'named-ground');
});

test('the same stake plus sixty-percent-gain resale economy works across solid bodies', () => {
  const result = settleBodySale({ bodyId: 'mars', amountCents: 2_000, lastPaidCents: 1_000 });
  assert.equal(result.bodyId, 'mars');
  assert.equal(result.sellerPayoutCents, 1_600);
  assert.equal(result.mldFeeCents, 400);
  assert.throws(() => settleBodySale({ bodyId: 'jupiter', amountCents: 2_000, lastPaidCents: 1_000 }), /does not use/);
});

test('each solid body index starts at 100 and scales against its own launch board', () => {
  assert.equal(bodyIndexFromGmvCents('mars', 0), 100);
  assert.equal(bodyIndexFromGmvCents('mars', 259_200 * 200), 200);
  assert.equal(bodyIndexFromGmvCents('moon', 259_200 * 100), 200);
});

test('solar index aggregates launched surface markets without pretending gas giants have land', () => {
  assert.equal(solarIndexFromBodyGmv({}), 100);
  const value = solarIndexFromBodyGmv({ moon: 25_920_000, mars: 51_840_000 });
  assert.ok(value > 100);
  assert.ok(Number.isFinite(value));
});

test('launch plan keeps the Moon first to protect liquidity', () => {
  const plan = launchPlan();
  assert.equal(plan[0].id, 'moon');
  assert.equal(plan[0].phase, 1);
  assert.ok(plan.find((x) => x.id === 'jupiter').phase > plan.find((x) => x.id === 'mars').phase);
});
