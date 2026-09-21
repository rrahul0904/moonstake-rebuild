import test from 'node:test';
import assert from 'node:assert/strict';
import { createRefund } from '../src/stripe.mjs';

test('Stripe refund uses payment intent and stable idempotency key', async () => {
  const original=globalThis.fetch;
  process.env.STRIPE_SECRET_KEY='rk_test';
  let captured;
  globalThis.fetch=async (url,options)=>{
    captured={url,options,body:Object.fromEntries(options.body.entries())};
    return new Response(JSON.stringify({id:'re_test',status:'succeeded'}),{status:200,headers:{'content-type':'application/json'}});
  };
  try{
    const result=await createRefund({claimId:'claim-123',paymentIntentId:'pi_123'});
    assert.equal(result.id,'re_test');
    assert.equal(captured.url,'https://api.stripe.com/v1/refunds');
    assert.equal(captured.body.payment_intent,'pi_123');
    assert.equal(captured.body.reason,'requested_by_customer');
    assert.equal(captured.body['metadata[claim_id]'],'claim-123');
    assert.equal(captured.options.headers['idempotency-key'],'atlas259-refund-claim-123');
  } finally { globalThis.fetch=original; }
});

test('Stripe refund rejects a non-approved reason before network call', async () => {
  process.env.STRIPE_SECRET_KEY='rk_test';
  await assert.rejects(()=>createRefund({claimId:'claim-123',paymentIntentId:'pi_123',reason:'anything'}),/Invalid Stripe refund reason/);
});
