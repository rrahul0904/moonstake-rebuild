import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verifyStripeSignature } from '../src/stripe.mjs';

test('Stripe webhook signature verifies a valid payload', () => {
  const secret='whsec_test'; const body='{"id":"evt_1"}'; const t=1700000000;
  const sig=crypto.createHmac('sha256',secret).update(`${t}.${body}`).digest('hex');
  assert.equal(verifyStripeSignature(body,`t=${t},v1=${sig}`,secret,300,t),true);
});

test('Stripe webhook signature rejects tampering and stale timestamps', () => {
  const secret='whsec_test'; const body='{"id":"evt_1"}'; const t=1700000000;
  const sig=crypto.createHmac('sha256',secret).update(`${t}.${body}`).digest('hex');
  assert.equal(verifyStripeSignature(body+'x',`t=${t},v1=${sig}`,secret,300,t),false);
  assert.equal(verifyStripeSignature(body,`t=${t},v1=${sig}`,secret,300,t+301),false);
});
