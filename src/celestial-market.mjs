import {
  MLD_MARKET,
  NAMED_GROUND,
  lotPrimaryPriceCents,
  offerGuidance,
  settleSale,
  moonIndexFromGmvCents,
} from './market-model.mjs';

const STANDARD_GRID = Object.freeze({ cols: 720, rows: 360, totalLots: 259_200 });

export const CELESTIAL_MARKET_VERSION = 1;

export const BODY_CATALOG = Object.freeze({
  moon: Object.freeze({
    id: 'moon',
    name: 'Moon',
    kind: 'solid-surface',
    parent: 'earth',
    inventoryMode: 'surface-lots',
    launchPhase: 1,
    enabled: true,
    grid: STANDARD_GRID,
    basePriceCents: MLD_MARKET.basePriceCents,
    registryLabel: 'Moon Registry',
    indexLabel: 'Moon Index',
    dataSources: ['NASA PDS', 'JPL planetary maps', 'USGS/IAU Gazetteer'],
  }),
  mars: Object.freeze({
    id: 'mars',
    name: 'Mars',
    kind: 'solid-surface',
    parent: 'sun',
    inventoryMode: 'surface-lots',
    launchPhase: 2,
    enabled: false,
    grid: STANDARD_GRID,
    basePriceCents: 200,
    registryLabel: 'Mars Registry',
    indexLabel: 'Mars Index',
    dataSources: ['NASA PDS', 'JPL planetary maps', 'USGS/IAU Gazetteer'],
  }),
  mercury: Object.freeze({
    id: 'mercury',
    name: 'Mercury',
    kind: 'solid-surface',
    parent: 'sun',
    inventoryMode: 'surface-lots',
    launchPhase: 2,
    enabled: false,
    grid: STANDARD_GRID,
    basePriceCents: 150,
    registryLabel: 'Mercury Registry',
    indexLabel: 'Mercury Index',
    dataSources: ['NASA PDS', 'JPL planetary maps', 'USGS/IAU Gazetteer'],
  }),
  venus: Object.freeze({
    id: 'venus',
    name: 'Venus',
    kind: 'solid-surface',
    parent: 'sun',
    inventoryMode: 'surface-lots',
    launchPhase: 3,
    enabled: false,
    grid: STANDARD_GRID,
    basePriceCents: 150,
    registryLabel: 'Venus Registry',
    indexLabel: 'Venus Index',
    dataSources: ['NASA PDS', 'JPL planetary maps', 'USGS/IAU Gazetteer'],
  }),
  ceres: Object.freeze({
    id: 'ceres',
    name: 'Ceres',
    kind: 'solid-surface',
    parent: 'sun',
    inventoryMode: 'surface-lots',
    launchPhase: 3,
    enabled: false,
    grid: STANDARD_GRID,
    basePriceCents: 100,
    registryLabel: 'Ceres Registry',
    indexLabel: 'Ceres Index',
    dataSources: ['NASA PDS', 'JPL planetary maps', 'USGS/IAU Gazetteer'],
  }),
  pluto: Object.freeze({
    id: 'pluto',
    name: 'Pluto',
    kind: 'solid-surface',
    parent: 'sun',
    inventoryMode: 'surface-lots',
    launchPhase: 4,
    enabled: false,
    grid: STANDARD_GRID,
    basePriceCents: 100,
    registryLabel: 'Pluto Registry',
    indexLabel: 'Pluto Index',
    dataSources: ['NASA PDS', 'JPL planetary maps', 'USGS/IAU Gazetteer'],
  }),
  europa: Object.freeze({
    id: 'europa',
    name: 'Europa',
    kind: 'solid-surface',
    parent: 'jupiter',
    inventoryMode: 'surface-lots',
    launchPhase: 4,
    enabled: false,
    grid: STANDARD_GRID,
    basePriceCents: 125,
    registryLabel: 'Europa Registry',
    indexLabel: 'Europa Index',
    dataSources: ['NASA PDS', 'JPL planetary maps', 'USGS/IAU Gazetteer'],
  }),
  titan: Object.freeze({
    id: 'titan',
    name: 'Titan',
    kind: 'solid-surface',
    parent: 'saturn',
    inventoryMode: 'surface-lots',
    launchPhase: 4,
    enabled: false,
    grid: STANDARD_GRID,
    basePriceCents: 125,
    registryLabel: 'Titan Registry',
    indexLabel: 'Titan Index',
    dataSources: ['NASA PDS', 'JPL planetary maps', 'USGS/IAU Gazetteer'],
  }),
  jupiter: Object.freeze({
    id: 'jupiter',
    name: 'Jupiter',
    kind: 'gas-giant',
    parent: 'sun',
    inventoryMode: 'observation-zones',
    launchPhase: 5,
    enabled: false,
    grid: null,
    basePriceCents: null,
    registryLabel: 'Jupiter Observation Registry',
    indexLabel: 'Jupiter Index',
    dataSources: ['NASA PDS', 'JPL planetary maps'],
  }),
  saturn: Object.freeze({
    id: 'saturn',
    name: 'Saturn',
    kind: 'gas-giant',
    parent: 'sun',
    inventoryMode: 'observation-zones',
    launchPhase: 5,
    enabled: false,
    grid: null,
    basePriceCents: null,
    registryLabel: 'Saturn Observation Registry',
    indexLabel: 'Saturn Index',
    dataSources: ['NASA PDS', 'JPL planetary maps'],
  }),
  sun: Object.freeze({
    id: 'sun',
    name: 'Sun',
    kind: 'star',
    parent: null,
    inventoryMode: 'observation-zones',
    launchPhase: 6,
    enabled: false,
    grid: null,
    basePriceCents: null,
    registryLabel: 'Solar Observation Registry',
    indexLabel: 'Solar Observation Index',
    dataSources: ['NASA heliophysics data'],
  }),
});

export const SOLID_BODY_IDS = Object.freeze(
  Object.values(BODY_CATALOG).filter((body) => body.inventoryMode === 'surface-lots').map((body) => body.id)
);

export const OBSERVATION_BODY_IDS = Object.freeze(
  Object.values(BODY_CATALOG).filter((body) => body.inventoryMode === 'observation-zones').map((body) => body.id)
);

export function getBody(bodyId) {
  const id = String(bodyId || '').trim().toLowerCase();
  const body = BODY_CATALOG[id];
  if (!body) throw new Error('Unknown celestial body');
  return body;
}

export function bodyLotId(bodyId, x, y) {
  const body = getBody(bodyId);
  if (body.inventoryMode !== 'surface-lots') throw new Error(`${body.name} does not expose surface lots`);
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= body.grid.cols || y >= body.grid.rows) {
    throw new Error('Invalid lot coordinates');
  }
  return `${body.id.toUpperCase()}-${String(x).padStart(3, '0')}-${String(y).padStart(3, '0')}`;
}

export function parseBodyLotId(id) {
  const match = /^([A-Z]+)-(\d{3})-(\d{3})$/.exec(String(id || '').trim().toUpperCase());
  if (!match) throw new Error('Celestial lot id must look like MOON-000-000');
  const body = getBody(match[1].toLowerCase());
  if (body.inventoryMode !== 'surface-lots') throw new Error(`${body.name} does not expose surface lots`);
  const x = Number(match[2]), y = Number(match[3]);
  if (x >= body.grid.cols || y >= body.grid.rows) throw new Error('Lot is outside the body board');
  return { id: bodyLotId(body.id, x, y), bodyId: body.id, x, y };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function latLonToBodyLot(bodyId, lat, lon) {
  const body = getBody(bodyId);
  if (body.inventoryMode !== 'surface-lots') throw new Error(`${body.name} does not expose latitude/longitude surface lots`);
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon))) throw new Error('Latitude/longitude must be finite');
  const safeLat = clamp(Number(lat), -90, 90);
  const wrappedLon = ((((Number(lon) + 180) % 360) + 360) % 360) - 180;
  const x = clamp(Math.floor(((wrappedLon + 180) / 360) * body.grid.cols), 0, body.grid.cols - 1);
  const y = clamp(Math.floor(((90 - safeLat) / 180) * body.grid.rows), 0, body.grid.rows - 1);
  return { id: bodyLotId(body.id, x, y), bodyId: body.id, x, y };
}

export function bodyPrimaryPriceCents(bodyId, id, { landmarkMultiplier = 1 } = {}) {
  const body = getBody(bodyId);
  if (body.inventoryMode !== 'surface-lots') throw new Error(`${body.name} does not expose surface-lot pricing`);

  if (body.id === 'moon') {
    const parsed = parseBodyLotId(id);
    const lunar = lotPrimaryPriceCents(`L-${String(parsed.x).padStart(3, '0')}-${String(parsed.y).padStart(3, '0')}`);
    return { ...lunar, lotId: parsed.id, bodyId: body.id, registryLabel: body.registryLabel };
  }

  const parsed = parseBodyLotId(id);
  const multiplier = Math.max(1, Math.min(100, Number(landmarkMultiplier) || 1));
  const priceCents = Math.round(body.basePriceCents * multiplier);
  return {
    lotId: parsed.id,
    bodyId: body.id,
    priceCents,
    price: priceCents / 100,
    currency: MLD_MARKET.currency,
    tier: multiplier > 1 ? 'named-ground' : 'standard',
    registryLabel: body.registryLabel,
  };
}

export function bodyOfferGuidance(lastPaidCents) {
  return offerGuidance(lastPaidCents);
}

export function settleBodySale({ bodyId, amountCents, lastPaidCents = null }) {
  const body = getBody(bodyId);
  if (body.inventoryMode !== 'surface-lots') throw new Error(`${body.name} does not use the surface-lot resale model`);
  return { bodyId: body.id, ...settleSale({ amountCents, lastPaidCents }) };
}

export function bodyIndexFromGmvCents(bodyId, gmvCents) {
  const body = getBody(bodyId);
  if (body.inventoryMode !== 'surface-lots') throw new Error(`${body.name} does not use the surface-lot index model`);
  if (body.id === 'moon') return moonIndexFromGmvCents(gmvCents);
  const gross = Number(gmvCents);
  if (!Number.isFinite(gross) || gross < 0) throw new Error('gmvCents must be non-negative');
  const launchBoardCents = body.grid.totalLots * body.basePriceCents;
  return Number((100 + (gross / launchBoardCents) * 100).toFixed(2));
}

export function solarIndexFromBodyGmv(bodyGmvCents = {}) {
  let gross = 0;
  let launchCapacity = 0;
  for (const bodyId of SOLID_BODY_IDS) {
    const body = getBody(bodyId);
    if (!body.enabled && body.launchPhase > 4) continue;
    const value = Number(bodyGmvCents[bodyId] || 0);
    if (!Number.isFinite(value) || value < 0) throw new Error('Body GMV must be non-negative');
    gross += value;
    launchCapacity += body.grid.totalLots * body.basePriceCents;
  }
  if (!launchCapacity) return 100;
  return Number((100 + (gross / launchCapacity) * 100).toFixed(2));
}

export function launchPlan() {
  return Object.values(BODY_CATALOG)
    .sort((a, b) => a.launchPhase - b.launchPhase || a.name.localeCompare(b.name))
    .map((body) => ({
      id: body.id,
      name: body.name,
      phase: body.launchPhase,
      inventoryMode: body.inventoryMode,
      enabled: body.enabled,
      totalLots: body.grid?.totalLots || 0,
      basePriceCents: body.basePriceCents,
    }));
}

export function moonNamedGround() {
  return NAMED_GROUND.map((item) => ({ ...item }));
}
