import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const bridge=fs.readFileSync(new URL('../public/checkout-bridge.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');

test('claim UI explicitly follows Stripe requires_action instead of assuming a demo claim',()=>{
  assert.match(app,/payment\?\.status==='requires_action'/);
  assert.match(app,/location\.assign\(data\.payment\.url\)/);
  assert.match(app,/Registry response did not include a claim or checkout action/);
});

test('checkout bridge does not monkey-patch global fetch',()=>{
  assert.doesNotMatch(bridge,/window\.fetch\s*=/);
  assert.match(bridge,/verified Stripe webhook/);
  assert.match(bridge,/resale/);
});

test('production checkout copy does not promise that cards are never charged',()=>{
  assert.doesNotMatch(index,/demo checkout does not charge money/i);
  assert.match(index,/Production purchases use secure Stripe Checkout/);
  assert.match(index,/ownership is finalized only after verified payment/i);
});

test('offers panel uses multi-element selector helper for action collections',()=>{
  const actionLines=app.split('\n').filter(line=>/data-(?:withdraw|accept|pay|unwatch)-(?:offer|lot).*\.forEach/.test(line));
  assert.ok(actionLines.length>=3);
  assert.ok(actionLines.every(line=>line.trimStart().startsWith('$$(')),actionLines.join('\n'));
  assert.match(app,/\$\$\('\[data-withdraw-offer\]'\)\.forEach/);
  assert.match(app,/\$\$\('\[data-accept-offer\]'\)\.forEach/);
  assert.match(app,/\$\$\('\[data-pay-offer\]'\)\.forEach/);
});
