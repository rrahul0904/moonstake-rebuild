export const MLD_MARKET = Object.freeze({
  cols: 720,
  rows: 360,
  totalLots: 259_200,
  currency: 'USD',
  basePriceCents: 100,
  minimumOfferIncrementCents: 100,
  suggestedMarkupBps: 1_000,
  sellerGainShareBps: 6_000,
  indexBase: 100,
});

const LANDMARKS = Object.freeze([
  { id: 'apollo11', name: 'Apollo 11', lat: 0.674, lon: 23.473 },
  { id: 'tycho', name: 'Tycho', lat: -43.31, lon: -11.36 },
  { id: 'copernicus', name: 'Copernicus', lat: 9.62, lon: -20.08 },
  { id: 'aristarchus', name: 'Aristarchus', lat: 23.7, lon: -47.4 },
  { id: 'plato', name: 'Plato', lat: 51.6, lon: -9.3 },
  { id: 'shackleton', name: 'Shackleton', lat: -89.9, lon: 0 },
  { id: 'orientale', name: 'Orientale', lat: -19.4, lon: -92.8 },
]);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function lotId(x, y) {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= MLD_MARKET.cols || y >= MLD_MARKET.rows) {
    throw new Error('Invalid lot coordinates');
  }
  return `L-${String(x).padStart(3, '0')}-${String(y).padStart(3, '0')}`;
}

export function parseLotId(id) {
  const match = /^L-(\d{3})-(\d{3})$/.exec(String(id || '').trim());
  if (!match) throw new Error('Lot id must look like L-000-000');
  const x = Number(match[1]);
  const y = Number(match[2]);
  if (x >= MLD_MARKET.cols || y >= MLD_MARKET.rows) throw new Error('Lot is outside the Moon board');
  return { id: lotId(x, y), x, y };
}

export function latLonToLot(lat, lon) {
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon))) throw new Error('Latitude/longitude must be finite');
  const safeLat = clamp(Number(lat), -90, 90);
  const wrappedLon = ((((Number(lon) + 180) % 360) + 360) % 360) - 180;
  const x = clamp(Math.floor(((wrappedLon + 180) / 360) * MLD_MARKET.cols), 0, MLD_MARKET.cols - 1);
  const y = clamp(Math.floor(((90 - safeLat) / 180) * MLD_MARKET.rows), 0, MLD_MARKET.rows - 1);
  return { id: lotId(x, y), x, y };
}

function landmarkCell(landmark) {
  return { ...landmark, ...latLonToLot(landmark.lat, landmark.lon) };
}

export const NAMED_GROUND = Object.freeze(LANDMARKS.map(landmarkCell));

export function lotPrimaryPriceCents(id) {
  const lot = parseLotId(id);
  let priceCents = MLD_MARKET.basePriceCents;
  let tier = 'standard';
  let landmark = null;

  for (const named of NAMED_GROUND) {
    const distance = Math.hypot(lot.x - named.x, lot.y - named.y);
    if (distance <= 1.5 && priceCents < 2_500) {
      priceCents = 2_500;
      tier = 'landmark-core';
      landmark = named.name;
    } else if (distance <= 4 && priceCents < 1_000) {
      priceCents = 1_000;
      tier = 'landmark-ring';
      landmark = named.name;
    } else if (distance <= 10 && priceCents < 500) {
      priceCents = 500;
      tier = 'named-ground';
      landmark = named.name;
    }
  }

  return { lotId: lot.id, priceCents, price: priceCents / 100, currency: MLD_MARKET.currency, tier, landmark };
}

export function offerGuidance(lastPaidCents) {
  const paid = Number(lastPaidCents);
  if (!Number.isInteger(paid) || paid < MLD_MARKET.basePriceCents) throw new Error('lastPaidCents must be an integer >= 100');
  const minimumCents = paid + MLD_MARKET.minimumOfferIncrementCents;
  const suggestedCents = Math.max(minimumCents, Math.ceil((paid * (10_000 + MLD_MARKET.suggestedMarkupBps)) / 10_000));
  return {
    lastPaidCents: paid,
    minimumCents,
    suggestedCents,
    minimum: minimumCents / 100,
    suggested: suggestedCents / 100,
    currency: MLD_MARKET.currency,
  };
}

export function settleSale({ amountCents, lastPaidCents = null }) {
  const amount = Number(amountCents);
  if (!Number.isInteger(amount) || amount < MLD_MARKET.basePriceCents) throw new Error('amountCents must be an integer >= 100');

  if (lastPaidCents == null) {
    return {
      kind: 'first-sale',
      amountCents: amount,
      previousPaidCents: 0,
      gainCents: amount,
      sellerPayoutCents: 0,
      mldFeeCents: amount,
      currency: MLD_MARKET.currency,
    };
  }

  const previous = Number(lastPaidCents);
  const guidance = offerGuidance(previous);
  if (amount < guidance.minimumCents) throw new Error(`Offer must be at least $${(guidance.minimumCents / 100).toFixed(2)}`);

  const gainCents = amount - previous;
  const sellerGainCents = Math.floor((gainCents * MLD_MARKET.sellerGainShareBps) / 10_000);
  const sellerPayoutCents = previous + sellerGainCents;
  const mldFeeCents = amount - sellerPayoutCents;

  return {
    kind: 'resale',
    amountCents: amount,
    previousPaidCents: previous,
    gainCents,
    sellerPayoutCents,
    mldFeeCents,
    currency: MLD_MARKET.currency,
  };
}

export function moonIndexFromGmvCents(gmvCents) {
  const gross = Number(gmvCents);
  if (!Number.isFinite(gross) || gross < 0) throw new Error('gmvCents must be non-negative');
  const launchBoardCents = MLD_MARKET.totalLots * MLD_MARKET.basePriceCents;
  return Number((MLD_MARKET.indexBase + (gross / launchBoardCents) * 100).toFixed(2));
}

export function lotAnalytics({ views = 0, clicks = 0 } = {}) {
  const safeViews = Math.max(0, Number(views) || 0);
  const safeClicks = Math.max(0, Number(clicks) || 0);
  return {
    views: safeViews,
    clicks: safeClicks,
    ctr: safeViews ? safeClicks / safeViews : 0,
  };
}
