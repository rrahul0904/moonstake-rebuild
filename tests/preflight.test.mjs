import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProductionEnv } from '../scripts/preflight.mjs';

const good = {
  BACKEND_MODE: 'supabase',
  NODE_ENV: 'production',
  APP_URL: 'https://moonstake.example',
  SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_demo',
  SUPABASE_SECRET_KEY: 'sb_secret_demo',
  STRIPE_SECRET_KEY: 'rk_test_demo',
  STRIPE_WEBHOOK_SECRET: 'whsec_demo',
  ADMIN_EMAILS: 'owner@example.com',
};

test('production preflight accepts a safe production-shaped environment', () => {
  const result = validateProductionEnv(good);
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test('production preflight rejects local URLs, legacy Supabase keys and malformed Stripe secrets', () => {
  const result = validateProductionEnv({
    ...good,
    APP_URL: 'http://localhost:4173',
    SUPABASE_PUBLISHABLE_KEY: 'anon-key',
    SUPABASE_SECRET_KEY: 'service-role-key',
    STRIPE_SECRET_KEY: 'bad-key',
    STRIPE_WEBHOOK_SECRET: 'bad-secret',
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((x) => x.includes('APP_URL')));
  assert.ok(result.errors.some((x) => x.includes('SUPABASE_PUBLISHABLE_KEY')));
  assert.ok(result.errors.some((x) => x.includes('SUPABASE_SECRET_KEY')));
  assert.ok(result.errors.some((x) => x.includes('STRIPE_SECRET_KEY')));
  assert.ok(result.errors.some((x) => x.includes('STRIPE_WEBHOOK_SECRET')));
});

test('production preflight warns when a full Stripe secret key is used', () => {
  const result = validateProductionEnv({ ...good, STRIPE_SECRET_KEY: 'sk_test_demo' });
  assert.equal(result.ok, true);
  assert.ok(result.warnings.some((x) => x.includes('restricted rk_')));
});
