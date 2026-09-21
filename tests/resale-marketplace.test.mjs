import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createResaleCheckoutSession } from '../src/stripe.mjs';

test('resale Checkout identifies offer, lot and transaction type with stable idempotency', async () => {
  const original=globalThis.fetch;
  process.env.STRIPE_SECRET_KEY='rk_test';
  process.env.STRIPE_WEBHOOK_SECRET='whsec_test';
  process.env.APP_URL='https://atlas259.example';
  let captured;
  globalThis.fetch=async (url,options)=>{
    captured={url,options,body:Object.fromEntries(options.body.entries())};
    return new Response(JSON.stringify({id:'cs_resale_123',url:'https://checkout.stripe.test/resale'}),{
      status:200,headers:{'content-type':'application/json'}
    });
  };
  try{
    const result=await createResaleCheckoutSession({offerId:'offer-123',amountCents:2000,lotId:'MOON-406-178'});
    assert.equal(result.id,'cs_resale_123');
    assert.equal(captured.url,'https://api.stripe.com/v1/checkout/sessions');
    assert.equal(captured.body['metadata[transaction_type]'],'resale');
    assert.equal(captured.body['metadata[offer_id]'],'offer-123');
    assert.equal(captured.body['metadata[lot_id]'],'MOON-406-178');
    assert.equal(captured.body['line_items[0][price_data][unit_amount]'],'2000');
    assert.equal(captured.options.headers['idempotency-key'],'atlas259-resale-offer-offer-123');
    assert.match(captured.body.success_url,/resale=success/);
  } finally {
    globalThis.fetch=original;
  }
});

test('resale Checkout rejects malformed money input before network call', async () => {
  process.env.STRIPE_SECRET_KEY='rk_test';
  process.env.STRIPE_WEBHOOK_SECRET='whsec_test';
  process.env.APP_URL='https://atlas259.example';
  await assert.rejects(
    ()=>createResaleCheckoutSession({offerId:'offer-123',amountCents:199.5,lotId:'MOON-406-178'}),
    /valid amount/
  );
});

test('resale migration encodes acceptance, payment and idempotent settlement states', () => {
  const sql=fs.readFileSync(new URL('../supabase/migrations/0006_marketplace_resale_readiness.sql',import.meta.url),'utf8');
  assert.match(sql,/accepted_pending_payment/);
  assert.match(sql,/seller payout setup is required/);
  assert.match(sql,/process_mld_resale_checkout_completed/);
  assert.match(sql,/idx_mld_transactions_offer/);
  assert.match(sql,/stripe_transfer_id/);
  assert.match(sql,/another accepted offer is awaiting payment/);
});
