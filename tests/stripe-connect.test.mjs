import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSellerConnectedAccount,
  createSellerOnboardingLink,
  createSellerTransfer,
  normalizeSellerAccountStatus,
  reverseSellerTransfer,
  stripeConnectEnabled,
} from '../src/stripe.mjs';

function withConnectEnv(fn){
  return async()=>{
    const keys=['STRIPE_CONNECT_ENABLED','STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','APP_URL'];
    const old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
    process.env.STRIPE_CONNECT_ENABLED='true';
    process.env.STRIPE_SECRET_KEY='sk_test_atlas';
    process.env.STRIPE_WEBHOOK_SECRET='whsec_test';
    process.env.APP_URL='https://atlas259.example';
    try{return await fn();}
    finally{
      for(const key of keys){
        if(old[key]===undefined)delete process.env[key];
        else process.env[key]=old[key];
      }
    }
  };
}

test('Stripe Connect is fail-closed unless explicitly enabled',()=>{
  assert.equal(stripeConnectEnabled({}),false);
  assert.equal(stripeConnectEnabled({STRIPE_CONNECT_ENABLED:'false'}),false);
  assert.equal(stripeConnectEnabled({STRIPE_CONNECT_ENABLED:'true'}),true);
});

test('seller account status requires active transfers before Atlas marks payouts ready',()=>{
  assert.deepEqual(normalizeSellerAccountStatus({
    id:'acct_123',
    details_submitted:true,
    payouts_enabled:true,
    capabilities:{transfers:'active'},
    requirements:{currently_due:[]},
  }),{
    stripeAccountId:'acct_123',
    onboardingStatus:'enabled',
    transfersEnabled:true,
    payoutsEnabled:true,
    detailsSubmitted:true,
    requirementsDueCount:0,
  });
  assert.equal(normalizeSellerAccountStatus({
    id:'acct_123',
    details_submitted:true,
    capabilities:{transfers:'inactive'},
    requirements:{currently_due:['external_account']},
  }).onboardingStatus,'restricted');
});

test('seller Express account requests transfer capability with stable user idempotency',withConnectEnv(async()=>{
  const original=globalThis.fetch;
  let captured;
  globalThis.fetch=async(url,options)=>{
    captured={url,options,body:Object.fromEntries(options.body.entries())};
    return new Response(JSON.stringify({id:'acct_seller',capabilities:{transfers:'pending'}}),{
      status:200,headers:{'content-type':'application/json'}
    });
  };
  try{
    const account=await createSellerConnectedAccount({userId:'user-123',email:'seller@example.com'});
    assert.equal(account.id,'acct_seller');
    assert.equal(captured.url,'https://api.stripe.com/v1/accounts');
    assert.equal(captured.body.type,'express');
    assert.equal(captured.body['capabilities[transfers][requested]'],'true');
    assert.equal(captured.body['metadata[atlas_user_id]'],'user-123');
    assert.equal(captured.options.headers['idempotency-key'],'atlas259-seller-user-123');
  }finally{globalThis.fetch=original}
}));

test('seller onboarding uses Stripe-hosted Account Links on Atlas return URLs',withConnectEnv(async()=>{
  const original=globalThis.fetch;
  let captured;
  globalThis.fetch=async(url,options)=>{
    captured={url,body:Object.fromEntries(options.body.entries())};
    return new Response(JSON.stringify({url:'https://connect.stripe.test/onboard',expires_at:123}),{
      status:200,headers:{'content-type':'application/json'}
    });
  };
  try{
    const link=await createSellerOnboardingLink({accountId:'acct_seller'});
    assert.equal(link.url,'https://connect.stripe.test/onboard');
    assert.equal(captured.url,'https://api.stripe.com/v1/account_links');
    assert.equal(captured.body.type,'account_onboarding');
    assert.equal(captured.body.account,'acct_seller');
    assert.equal(captured.body.return_url,'https://atlas259.example/?seller_onboarding=return');
    assert.equal(captured.body.refresh_url,'https://atlas259.example/?seller_onboarding=refresh');
  }finally{globalThis.fetch=original}
}));

test('resale transfer is tied to PaymentIntent latest charge and idempotent transaction key',withConnectEnv(async()=>{
  const original=globalThis.fetch;
  const calls=[];
  globalThis.fetch=async(url,options={})=>{
    calls.push({url,options,body:options.body?Object.fromEntries(options.body.entries()):null});
    if(String(url).includes('/payment_intents/')){
      return new Response(JSON.stringify({id:'pi_paid',latest_charge:'ch_source'}),{
        status:200,headers:{'content-type':'application/json'}
      });
    }
    return new Response(JSON.stringify({id:'tr_seller'}),{
      status:200,headers:{'content-type':'application/json'}
    });
  };
  try{
    const result=await createSellerTransfer({
      transactionId:'tx-123',
      amountCents:1600,
      destinationAccountId:'acct_seller',
      paymentIntentId:'pi_paid',
      transferGroup:'atlas259-resale-tx-123',
    });
    assert.equal(result.transfer.id,'tr_seller');
    assert.equal(result.chargeId,'ch_source');
    const transferCall=calls[1];
    assert.equal(transferCall.url,'https://api.stripe.com/v1/transfers');
    assert.equal(transferCall.body.source_transaction,'ch_source');
    assert.equal(transferCall.body.destination,'acct_seller');
    assert.equal(transferCall.body.amount,'1600');
    assert.equal(transferCall.options.headers['idempotency-key'],'atlas259-resale-transfer-tx-123');
  }finally{globalThis.fetch=original}
}));

test('transfer reversal is full by default and has a stable reason-scoped key',withConnectEnv(async()=>{
  const original=globalThis.fetch;
  let captured;
  globalThis.fetch=async(url,options)=>{
    captured={url,options,body:Object.fromEntries(options.body.entries())};
    return new Response(JSON.stringify({id:'trr_refund'}),{
      status:200,headers:{'content-type':'application/json'}
    });
  };
  try{
    const reversal=await reverseSellerTransfer({transactionId:'tx-123',transferId:'tr_seller',reason:'refund'});
    assert.equal(reversal.id,'trr_refund');
    assert.equal(captured.url,'https://api.stripe.com/v1/transfers/tr_seller/reversals');
    assert.equal(captured.body.reason,undefined);
    assert.equal(captured.body['metadata[reason]'],'refund');
    assert.equal(captured.options.headers['idempotency-key'],'atlas259-transfer-reversal-tx-123-refund');
  }finally{globalThis.fetch=original}
}));
