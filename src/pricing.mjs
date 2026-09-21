import { lotPrimaryPriceCents, latLonToLot } from './market-model.mjs';

export const GRID = Object.freeze({ cols: 64, rows: 32 });
export const LOT_GRID = Object.freeze({ cols: 720, rows: 360, totalLots: 259_200 });

const RAW_LANDMARKS = [
  { id: 'apollo11', name: 'Apollo 11', subtitle: 'Mare Tranquillitatis', x: 38, y: 17, lat: 0.674, lon: 23.473 },
  { id: 'armstrong', name: 'Armstrong', subtitle: 'Apollo 11 landing area', x: 38, y: 17, lat: 0.674, lon: 23.473 },
  { id: 'tycho', name: 'Tycho', subtitle: 'Prominent impact crater', x: 28, y: 23, lat: -43.31, lon: -11.36 },
  { id: 'copernicus', name: 'Copernicus', subtitle: 'Young lunar crater', x: 25, y: 15, lat: 9.62, lon: -20.08 },
  { id: 'aristarchus', name: 'Aristarchus', subtitle: 'Bright lunar crater', x: 23, y: 13, lat: 23.7, lon: -47.4 },
  { id: 'plato', name: 'Plato', subtitle: 'Dark-floored crater', x: 29, y: 10, lat: 51.6, lon: -9.3 },
  { id: 'shackleton', name: 'Shackleton', subtitle: 'South polar crater', x: 32, y: 31, lat: -89.9, lon: 0 },
  { id: 'orientale', name: 'Orientale', subtitle: 'Multi-ring impact basin', x: 13, y: 18, lat: -19.4, lon: -92.8 }
];

export const LANDMARKS = Object.freeze(RAW_LANDMARKS.map((landmark) => {
  const canonical = latLonToLot(landmark.lat, landmark.lon);
  return Object.freeze({
    ...landmark,
    lotId: `MOON-${String(canonical.x).padStart(3,'0')}-${String(canonical.y).padStart(3,'0')}`,
    lotX: canonical.x,
    lotY: canonical.y,
  });
}));

export function sectorId(x, y) {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= GRID.cols || y >= GRID.rows) {
    throw new Error('Invalid sector coordinates');
  }
  return `S-${String(x).padStart(2, '0')}-${String(y).padStart(2, '0')}`;
}

export function lotId(x, y) {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= LOT_GRID.cols || y >= LOT_GRID.rows) {
    throw new Error('Invalid Moon lot coordinates');
  }
  return `MOON-${String(x).padStart(3,'0')}-${String(y).padStart(3,'0')}`;
}

export function parseSectorId(id) {
  const match = /^S-(\d{2})-(\d{2})$/.exec(String(id));
  if (!match) throw new Error('Invalid sector id');
  const x = Number(match[1]);
  const y = Number(match[2]);
  if (x >= GRID.cols || y >= GRID.rows) throw new Error('Invalid sector id');
  return { id: sectorId(x,y), kind:'legacy-sector', x, y };
}

export function parseLotId(id) {
  const match = /^MOON-(\d{3})-(\d{3})$/.exec(String(id || '').trim().toUpperCase());
  if (!match) throw new Error('Invalid Moon lot id');
  const x=Number(match[1]), y=Number(match[2]);
  if(x>=LOT_GRID.cols||y>=LOT_GRID.rows)throw new Error('Invalid Moon lot id');
  return { id:lotId(x,y), kind:'moon-lot', x, y };
}

export function parseRegistryPosition(id) {
  const value=String(id||'').trim();
  if(value.startsWith('S-'))return parseSectorId(value);
  return parseLotId(value);
}

export function sectorPrice(id) {
  const { x, y } = parseSectorId(id);
  let price = 1;
  if (x === 31 || x === 32 || y === 15 || y === 16) price = 2;
  for (const landmark of LANDMARKS) {
    const distance = Math.hypot(x - landmark.x, y - landmark.y);
    if (distance <= 1.25) price = Math.max(price, 4);
    else if (distance <= 2.25) price = Math.max(price, 3);
  }
  return price;
}

export function registryPrice(id) {
  const parsed=parseRegistryPosition(id);
  if(parsed.kind==='legacy-sector')return {id:parsed.id,price:sectorPrice(parsed.id),priceCents:sectorPrice(parsed.id)*100,currency:'USD',kind:parsed.kind};
  const mld=lotPrimaryPriceCents(`L-${String(parsed.x).padStart(3,'0')}-${String(parsed.y).padStart(3,'0')}`);
  return {id:parsed.id,price:mld.priceCents/100,priceCents:mld.priceCents,currency:mld.currency,kind:parsed.kind,tier:mld.tier,landmark:mld.landmark};
}

export function quoteSectors(ids, claimed = new Set()) {
  const unique = [...new Set(ids.map(String))];
  if (unique.length > 64) throw new Error('A single registry action is limited to 64 positions');
  const unavailable = unique.filter((id) => claimed.has(id));
  const available = unique.filter((id) => !claimed.has(id));
  const lines = available.map((id) => registryPrice(id));
  const totalCents=lines.reduce((sum,line)=>sum+line.priceCents,0);
  return {
    count: available.length,
    total: totalCents / 100,
    totalCents,
    currency: 'USD',
    unavailable,
    lines
  };
}
