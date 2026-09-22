import {
  createSellerConnectedAccount,
  createSellerOnboardingLink,
  createSellerTransfer,
  normalizeSellerAccountStatus,
  retrieveSellerConnectedAccount,
  reverseSellerTransfer,
  stripeConnectEnabled,
} from './stripe.mjs';
import {
  getMldTransaction,
  getSellerPayoutProfile,
  recordMldTransferReversal,
  updateMldTransactionPayout,
  upsertSellerPayoutProfile,
} from './supabase.mjs';

export function connectAvailability() {
  return {
    enabled: stripeConnectEnabled(),
    mode: stripeConnectEnabled() ? 'connect' : 'disabled',
  };
}

export async function syncSellerPayoutProfile({ userId }) {
  const existing=await getSellerPayoutProfile(userId);
  if(!existing?.stripe_account_id){
    return existing || {
      user_id:userId,
      stripe_account_id:null,
      onboarding_status:'not_started',
      transfers_enabled:false,
      payouts_enabled:false,
      details_submitted:false,
      requirements_due_count:0,
    };
  }
  if(!stripeConnectEnabled())return existing;
  const account=await retrieveSellerConnectedAccount(existing.stripe_account_id);
  const status=normalizeSellerAccountStatus(account);
  return upsertSellerPayoutProfile({
    userId,
    ...status,
  });
}

export async function beginSellerOnboarding({ userId, email }) {
  if(!stripeConnectEnabled()){
    const err=new Error('Seller payout onboarding is not enabled in this environment');
    err.code='STRIPE_CONNECT_DISABLED';
    throw err;
  }

  let profile=await getSellerPayoutProfile(userId);
  let accountId=profile?.stripe_account_id || null;

  if(!accountId){
    const account=await createSellerConnectedAccount({
      userId,
      email,
      country:process.env.STRIPE_CONNECT_DEFAULT_COUNTRY || 'US',
    });
    const status=normalizeSellerAccountStatus(account);
    profile=await upsertSellerPayoutProfile({userId,...status});
    accountId=account.id;
  }else{
    profile=await syncSellerPayoutProfile({userId});
  }

  if(profile?.transfers_enabled){
    return { ready:true, profile, onboardingUrl:null };
  }

  const link=await createSellerOnboardingLink({accountId});
  return {
    ready:false,
    profile,
    onboardingUrl:link.url,
    expiresAt:link.expires_at || null,
  };
}

export async function settleResalePayout(transactionId) {
  const tx=await getMldTransaction(transactionId);
  if(!tx)throw new Error('Resale transaction not found');
  if(tx.kind!=='resale')throw new Error('Only resale transactions have seller payouts');
  if(tx.payout_status==='paid' && tx.stripe_transfer_id){
    return { status:'paid', transaction:tx, idempotent:true };
  }
  if(tx.payout_status==='reversed')throw new Error('Reversed payout cannot be re-sent');
  if(!stripeConnectEnabled()){
    return { status:'pending', transaction:tx, gated:true };
  }

  const profile=await syncSellerPayoutProfile({userId:tx.seller_user_id});
  if(!profile?.stripe_account_id || !profile?.transfers_enabled){
    const message='Seller Stripe account is not transfer-ready';
    await updateMldTransactionPayout({transactionId,status:'failed',error:message});
    throw new Error(message);
  }

  try{
    const {transfer,chargeId}=await createSellerTransfer({
      transactionId,
      amountCents:Number(tx.seller_payout_cents),
      destinationAccountId:profile.stripe_account_id,
      paymentIntentId:tx.stripe_payment_intent_id,
      transferGroup:tx.transfer_group,
    });
    const updated=await updateMldTransactionPayout({
      transactionId,
      chargeId,
      transferId:transfer.id,
      status:'paid',
    });
    return {status:'paid',transaction:updated,transferId:transfer.id,chargeId};
  }catch(err){
    await updateMldTransactionPayout({
      transactionId,
      status:'failed',
      error:err.message,
    }).catch(()=>{});
    throw err;
  }
}

export async function reverseResalePayout({ transactionId, reason, actor }) {
  const tx=await getMldTransaction(transactionId);
  if(!tx)throw new Error('Resale transaction not found');
  if(tx.kind!=='resale')throw new Error('Only resale transactions can reverse seller transfers');
  if(tx.payout_status==='reversed' && tx.stripe_transfer_reversal_id){
    return {status:'reversed',transaction:tx,idempotent:true};
  }
  if(tx.payout_status!=='paid' || !tx.stripe_transfer_id){
    throw new Error('Seller transfer has not been paid');
  }
  const reversal=await reverseSellerTransfer({
    transactionId,
    transferId:tx.stripe_transfer_id,
    reason,
  });
  await recordMldTransferReversal({
    transactionId,
    reversalId:reversal.id,
    reason,
    actor,
  });
  return {
    status:'reversed',
    reversalId:reversal.id,
    transaction:await getMldTransaction(transactionId),
  };
}
