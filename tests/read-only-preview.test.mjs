import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas259-read-only-'));
const dbPath = path.join(tempDir, 'db.json');
process.env.MOONSTAKE_DB_PATH = dbPath;
process.env.ATLAS_PREVIEW_READ_ONLY = 'true';
// A misconfigured payment environment must never override the public-preview boundary.
process.env.PAYMENTS_MODE = 'stripe';
const { server } = await import('../src/server.mjs');
const { resetDb } = await import('../src/store.mjs');
resetDb();

let base;
test.before(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('read-only showcase exposes seeded public views and explicitly disables payments', async () => {
  const root = await fetch(base + '/');
  assert.equal(root.status, 200);
  assert.match(await root.text(), /id="preview-banner"/);

  const health = await fetch(base + '/api/health');
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true, service: 'atlas259', mode: 'demo', readOnly: true });

  const bootstrap = await fetch(base + '/api/bootstrap');
  assert.equal(bootstrap.status, 200);
  const data = await bootstrap.json();
  assert.equal(data.previewReadOnly, true);
  assert.equal(data.paymentsMode, 'disabled');
  assert.equal(data.user, null);
  assert.ok(data.claims.length >= 1);
  assert.ok(data.landmarks.length >= 5);

  const bodies = await fetch(base + '/api/celestial-bodies');
  assert.equal(bodies.status, 200);
  assert.ok((await bodies.json()).bodies.some(body => body.id === 'moon'));

  const board = await fetch(base + '/api/board');
  assert.equal(board.status, 200);
  assert.ok((await board.json()).board.length >= 1);
});

test('preview blocks all API mutations even if clients bypass disabled UI', async () => {
  const before = fs.readFileSync(dbPath, 'utf8');
  for (const pathname of [
    '/api/auth/signup',
    '/api/auth/signin',
    '/api/quote',
    '/api/claims',
    '/api/events/view',
    '/api/events/click',
    '/api/watchlist',
    '/api/seller/onboarding',
    '/api/admin/refund',
    '/api/webhooks/stripe',
    '/api/unknown-future-write'
  ]) {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const result = await fetch(base + pathname, { method, headers: { 'content-type': 'application/json' }, body: '{}' });
      assert.equal(result.status, 403, `${method} ${pathname}`);
      assert.equal((await result.json()).code, 'PREVIEW_READ_ONLY');
    }
  }
  assert.equal(fs.readFileSync(dbPath, 'utf8'), before, 'read-only requests must not mutate the seeded file');
});

test('operator UI is not served in public showcase mode', async () => {
  assert.equal((await fetch(base + '/admin.html')).status, 404);
  assert.equal((await fetch(base + '/admin.js')).status, 404);
  assert.equal((await fetch(base + '/api/admin/claims')).status, 404);
});
