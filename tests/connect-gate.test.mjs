import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const marketplace=fs.readFileSync(new URL('../src/production-marketplace.mjs',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const preflight=fs.readFileSync(new URL('../scripts/preflight.mjs',import.meta.url),'utf8');

test('resale acceptance is blocked when deployment Connect gate is disabled',()=>{
  assert.match(marketplace,/if\(!connectAvailability\(\)\.enabled\)/);
  assert.match(marketplace,/Seller payouts are disabled for this deployment/);
});

test('seller UI requires both Stripe readiness and deployment Connect enablement',()=>{
  assert.match(app,/payoutReady=Boolean\(connect\.enabled&&payout\.resale_payout_ready\)/);
  assert.match(app,/data-accept-offer/);
});

test('production preflight makes Connect activation explicit',()=>{
  assert.match(preflight,/STRIPE_CONNECT_ENABLED must be true or false/);
  assert.match(preflight,/seller payouts are disabled/i);
});
