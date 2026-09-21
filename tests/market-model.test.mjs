import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MLD_MARKET,
  lotId,
  parseLotId,
  latLonToLot,
  lotPrimaryPriceCents,
  offerGuidance,
  settleSale,
  moonIndexFromGmvCents,
  lotAnalytics,
} from '../src/market-model.mjs';

test('MLD board exposes exactly 259,200 addressable lots', () => {
  assert.equal(MLD_MARKET.cols * MLD_MARKET.rows, 259_200);
  assert.equal(MLD_MARKET.totalLots, 259_200);
  assert.equal(lotId(719, 359), 'L-719-359');
  assert.deepEqual(parseLotId('L-000-000'), { id: 'L-000-000', x: 0, y: 0 });
  assert.throws(() => parseLotId('L-720-000'), /outside/);
});

test('real lunar coordinates map deterministically to lots', () => {
  assert.equal(latLonToLot(0, 0).id, 'L-360-180');
  assert.equal(latLonToLot(0.674, 23.473).id, 'L-406-178');
});

test('named ground costs more than standard ground', () => {
  const apollo = lotPrimaryPriceCents(latLonToLot(0.674, 23.473).id);
  const standard = lotPrimaryPriceCents('L-000-000');
  assert.equal(standard.priceCents, 100);
  assert.ok(apollo.priceCents > standard.priceCents);
  assert.equal(apollo.landmark, 'Apollo 11');
});

test('offers must beat last paid by at least one dollar and suggest ten percent', () => {
  assert.deepEqual(offerGuidance(100), {
    lastPaidCents: 100,
    minimumCents: 200,
    suggestedCents: 200,
    minimum: 2,
    suggested: 2,
    currency: 'USD',
  });
  const high = offerGuidance(10_000);
  assert.equal(high.minimumCents, 10_100);
  assert.equal(high.suggestedCents, 11_000);
});

test('first sale is entirely MLD revenue', () => {
  assert.deepEqual(settleSale({ amountCents: 500 }), {
    kind: 'first-sale',
    amountCents: 500,
    previousPaidCents: 0,
    gainCents: 500,
    sellerPayoutCents: 0,
    mldFeeCents: 500,
    currency: 'USD',
  });
});

test('resale returns stake plus sixty percent of gain', () => {
  const result = settleSale({ amountCents: 2_000, lastPaidCents: 1_000 });
  assert.equal(result.gainCents, 1_000);
  assert.equal(result.sellerPayoutCents, 1_600);
  assert.equal(result.mldFeeCents, 400);
  assert.throws(() => settleSale({ amountCents: 1_050, lastPaidCents: 1_000 }), /at least/);
});

test('Moon Index starts at 100 and rises monotonically with board GMV', () => {
  assert.equal(moonIndexFromGmvCents(0), 100);
  assert.equal(moonIndexFromGmvCents(259_200 * 100), 200);
  assert.ok(moonIndexFromGmvCents(10_000) > 100);
});

test('lot analytics exposes views, clicks and CTR', () => {
  assert.deepEqual(lotAnalytics({ views: 200, clicks: 20 }), { views: 200, clicks: 20, ctr: 0.1 });
});
