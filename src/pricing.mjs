export const GRID = { cols: 64, rows: 32 };

export const LANDMARKS = [
  { id: 'apollo11', name: 'Apollo 11', subtitle: 'Mare Tranquillitatis', x: 38, y: 17, lat: 0.674, lon: 23.473 },
  { id: 'armstrong', name: 'Armstrong', subtitle: 'Apollo 11 landing area', x: 38, y: 17, lat: 0.674, lon: 23.473 },
  { id: 'tycho', name: 'Tycho', subtitle: 'Prominent impact crater', x: 28, y: 23, lat: -43.31, lon: -11.36 },
  { id: 'copernicus', name: 'Copernicus', subtitle: 'Young lunar crater', x: 25, y: 15, lat: 9.62, lon: -20.08 },
  { id: 'aristarchus', name: 'Aristarchus', subtitle: 'Bright lunar crater', x: 23, y: 13, lat: 23.7, lon: -47.4 },
  { id: 'plato', name: 'Plato', subtitle: 'Dark-floored crater', x: 29, y: 10, lat: 51.6, lon: -9.3 },
  { id: 'shackleton', name: 'Shackleton', subtitle: 'South polar crater', x: 32, y: 31, lat: -89.9, lon: 0 },
  { id: 'orientale', name: 'Orientale', subtitle: 'Multi-ring impact basin', x: 13, y: 18, lat: -19.4, lon: -92.8 }
];

export function sectorId(x, y) {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= GRID.cols || y >= GRID.rows) {
    throw new Error('Invalid sector coordinates');
  }
  return `S-${String(x).padStart(2, '0')}-${String(y).padStart(2, '0')}`;
}

export function parseSectorId(id) {
  const match = /^S-(\d{2})-(\d{2})$/.exec(String(id));
  if (!match) throw new Error('Invalid sector id');
  const x = Number(match[1]);
  const y = Number(match[2]);
  if (x >= GRID.cols || y >= GRID.rows) throw new Error('Invalid sector id');
  return { x, y };
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

export function quoteSectors(ids, claimed = new Set()) {
  const unique = [...new Set(ids.map(String))];
  if (unique.length > 64) throw new Error('A single claim is limited to 64 sectors');
  const unavailable = unique.filter((id) => claimed.has(id));
  const available = unique.filter((id) => !claimed.has(id));
  const lines = available.map((id) => ({ id, price: sectorPrice(id) }));
  return {
    count: available.length,
    total: lines.reduce((sum, line) => sum + line.price, 0),
    currency: 'USD',
    unavailable,
    lines
  };
}
