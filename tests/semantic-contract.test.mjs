import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SEMANTIC_API_VERSION,
  buildSemanticSnapshot,
  clampSemanticZoom,
  parseSectorId,
  searchSemanticEntities
} from '../public/semantic-contract.js';

test('semantic contract exposes a dated version', () => {
  assert.equal(SEMANTIC_API_VERSION, '2026-09-21.2');
});

test('registry ids support canonical Moon lots plus legacy donor sectors', () => {
  assert.deepEqual(parseSectorId('MOON-360-180'), { id:'MOON-360-180',x:360,y:180,kind:'moon-lot' });
  assert.deepEqual(parseSectorId('S-03-09'), { id:'S-03-09',x:3,y:9,kind:'legacy-sector' });
  assert.throws(() => parseSectorId('MOON-720-000'), /outside/);
  assert.throws(() => parseSectorId('3,9'), /must look like/);
});

test('semantic entity search prefers exact titles', () => {
  const rows = searchSemanticEntities('apollo 11', {
    landmarks: [
      { id: 'l1', name: 'Apollo 11', subtitle: 'Mare Tranquillitatis' },
      { id: 'l2', name: 'Apollo 11 Ridge', subtitle: 'Nearby feature' }
    ],
    claims: [{ id: 'c1', brand: 'Apollo 11 Labs', tagline: 'Launch tools' }]
  });
  assert.equal(rows[0].id, 'l1');
  assert.equal(rows[0].kind, 'landmark');
});

test('semantic snapshot intentionally excludes email and purchase authority', () => {
  const snapshot = buildSemanticSnapshot({
    zoom: 2.5,
    panX: 10,
    panY: -4,
    mode: 'select',
    selected: new Set(['MOON-001-001']),
    quote: { count: 1, total: 2, unavailable: [] },
    user: { email: 'private@example.com', brand: 'Acme' },
    activeClaim: { id: 'claim_1', brand: 'Acme', sectors: ['MOON-001-001'], url: 'https://example.com' }
  });
  assert.deepEqual(snapshot.user, { signedIn: true, brand: 'Acme' });
  assert.equal('email' in snapshot.user, false);
  assert.equal('purchase' in snapshot, false);
});

test('zoom values are finite and clamped', () => {
  assert.equal(clampSemanticZoom(10), 5.5);
  assert.equal(clampSemanticZoom(0.1), 0.72);
  assert.throws(() => clampSemanticZoom('nope'), /finite/);
});
