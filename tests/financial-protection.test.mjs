import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyStripeFinancialProtectionEvent,
  financialProtectionActor,
  findResaleTransactionForProtection,
  shouldAutomaticallyReverseProtection,
} from '../src/financial-protection.mjs';

const paidResale={
  id:'tx_1',
  kind:'resale',
  gross_cents:5000,
  payout_status:'paid',
  stripe_transfer_id:'tr_123',
  stripe_payment_intent_id:'pi_123',
  stripe_charge_id:'ch_123',
};

test('full charge refund is eligible for automatic seller transfer reversal',()=>{
  const action=classifyStripeFinancialProtectionEvent({
    id:'evt_refund',
    type:'charge.refunded',
    data:{object:{id:'ch_123',payment_intent:'pi_123',amount:5000,amount_refunded:5000,refunded:true}},
  });
  assert.equal(action.relevant,true);
  assert.equal(action.reason,'refund');
  assert.equal(action.full,true);
  assert.equal(shouldAutomaticallyReverseProtection(action,paidResale),true);
});

test('partial charge refund never triggers a full seller transfer reversal',()=>{
  const action=classifyStripeFinancialProtectionEvent({
    type:'charge.refunded',
    data:{object:{id:'ch_123',payment_intent:'pi_123',amount:5000,amount_refunded:1000,refunded:false}},
  });
  assert.equal(action.full,false);
  assert.equal(shouldAutomaticallyReverseProtection(action,paidResale),false);
});

test('full dispute is determined against the authoritative Atlas transaction gross',()=>{
  const full=classifyStripeFinancialProtectionEvent({
    type:'charge.dispute.created',
    data:{object:{id:'dp_1',charge:'ch_123',payment_intent:'pi_123',amount:5000}},
  });
  const partial=classifyStripeFinancialProtectionEvent({
    type:'charge.dispute.created',
    data:{object:{id:'dp_2',charge:'ch_123',payment_intent:'pi_123',amount:2000}},
  });
  assert.equal(shouldAutomaticallyReverseProtection(full,paidResale),true);
  assert.equal(shouldAutomaticallyReverseProtection(partial,paidResale),false);
});

test('financial protection matches a resale by PaymentIntent or source charge',()=>{
  const rows=[{...paidResale,id:'tx_other',stripe_payment_intent_id:'pi_other',stripe_charge_id:'ch_other'},paidResale];
  const byPi=findResaleTransactionForProtection(rows,{relevant:true,paymentIntentId:'pi_123',chargeId:''});
  const byCharge=findResaleTransactionForProtection(rows,{relevant:true,paymentIntentId:'',chargeId:'ch_123'});
  assert.equal(byPi.id,'tx_1');
  assert.equal(byCharge.id,'tx_1');
});

test('unpaid or already failed seller payouts are never auto-reversed',()=>{
  const action={relevant:true,reason:'refund',full:true,amountCents:5000};
  assert.equal(shouldAutomaticallyReverseProtection(action,{...paidResale,payout_status:'pending'}),false);
  assert.equal(shouldAutomaticallyReverseProtection(action,{...paidResale,payout_status:'failed'}),false);
  assert.equal(shouldAutomaticallyReverseProtection(action,{...paidResale,stripe_transfer_id:null}),false);
});

test('Stripe actor preserves event identity for reversal audit',()=>{
  assert.equal(
    financialProtectionActor({type:'charge.dispute.created',id:'evt_123'}),
    'stripe:charge.dispute.created:evt_123',
  );
});
