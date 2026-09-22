import crypto from 'node:crypto';

const STRIPE_API = 'https://api.stripe.com/v1';

export function assertStripeConfig() {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET || !process.env.APP_URL) {
    throw new Error('Stripe production mode requires STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET and APP_URL');
  }
}

function randomLetters(length=8) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  const bytes = crypto.randomBytes(length);
  return [...bytes].map(b => alphabet[b % alphabet.length]).join('');
}

export async function createCheckoutSession({ reservationId, amountCents, sectorCount, brand }) {
  assertStripeConfig();
  const base = String(process.env.APP_URL).replace(/\/$/, '');
  const form = new URLSearchParams();
  form.set('mode','payment');
  form.set('success_url', `${base}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`);
  form.set('cancel_url', `${base}/?checkout=cancelled`);
  form.set('client_reference_id', reservationId);
  form.set('line_items[0][price_data][currency]','usd');
  form.set('line_items[0][price_data][unit_amount]', String(amountCents));
  form.set('line_items[0][price_data][product_data][name]', `${sectorCount} Atlas 259 Moon registry position${sectorCount === 1 ? '' : 's'}`);
  form.set('line_items[0][price_data][product_data][description]', `Brand placement for ${brand}`);
  form.set('line_items[0][quantity]','1');
  form.set('metadata[reservation_id]', reservationId);
  form.set('metadata[brand]', brand.slice(0, 64));
  form.set('integration_identifier', `atlas259_checkout_${randomLetters(8)}`);
  form.set('expires_at', String(Math.floor(Date.now()/1000) + 30 * 60));

  const res = await fetch(`${STRIPE_API}/checkout/sessions`, {
    method:'POST',
    headers:{
      authorization:`Bearer ${process.env.STRIPE_SECRET_KEY}`,
      'content-type':'application/x-www-form-urlencoded',
      'idempotency-key':`atlas259-reservation-${reservationId}`
    },
    body:form
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Stripe checkout creation failed (${res.status})`);
  if (!data?.id || !data?.url) throw new Error('Stripe checkout response did not include id/url');
  return data;
}

export async function createRefund({ claimId, paymentIntentId, reason='requested_by_customer' }) {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('Stripe refund requires STRIPE_SECRET_KEY');
  if (!claimId || !paymentIntentId) throw new Error('Stripe refund requires claim and payment intent IDs');
  const allowed = new Set(['duplicate','fraudulent','requested_by_customer']);
  if (!allowed.has(reason)) throw new Error('Invalid Stripe refund reason');
  const form = new URLSearchParams();
  form.set('payment_intent', paymentIntentId);
  form.set('reason', reason);
  form.set('metadata[claim_id]', claimId);
  const res = await fetch(`${STRIPE_API}/refunds`, {
    method:'POST',
    headers:{
      authorization:`Bearer ${process.env.STRIPE_SECRET_KEY}`,
      'content-type':'application/x-www-form-urlencoded',
      'idempotency-key':`atlas259-refund-${claimId}`
    },
    body:form
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Stripe refund failed (${res.status})`);
  if (!data?.id || !['pending','succeeded'].includes(data.status)) throw new Error('Stripe did not accept the refund');
  return data;
}

export function verifyStripeSignature(rawBody, signatureHeader, secret=process.env.STRIPE_WEBHOOK_SECRET, toleranceSeconds=300, nowSeconds=Math.floor(Date.now()/1000)) {
  if (!secret || !signatureHeader) return false;
  const parts = String(signatureHeader).split(',').map(x => x.trim());
  const timestamp = Number(parts.find(x => x.startsWith('t='))?.slice(2));
  const signatures = parts.filter(x => x.startsWith('v1=')).map(x => x.slice(3));
  if (!Number.isFinite(timestamp) || !signatures.length || Math.abs(nowSeconds - timestamp) > toleranceSeconds) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  return signatures.some(sig => {
    try {
      const actual = Buffer.from(sig, 'hex');
      return actual.length === expectedBuf.length && crypto.timingSafeEqual(actual, expectedBuf);
    } catch { return false; }
  });
}


export async function createResaleCheckoutSession({ offerId, amountCents, lotId }) {
  assertStripeConfig();
  if (!offerId || !lotId || !Number.isInteger(Number(amountCents)) || Number(amountCents) < 200) {
    throw new Error('Resale checkout requires offer, lot and valid amount');
  }
  const base = String(process.env.APP_URL).replace(/\/$/, '');
  const form = new URLSearchParams();
  form.set('mode','payment');
  form.set('success_url', `${base}/?resale=success&offer_id=${encodeURIComponent(offerId)}&session_id={CHECKOUT_SESSION_ID}`);
  form.set('cancel_url', `${base}/?resale=cancelled&offer_id=${encodeURIComponent(offerId)}`);
  form.set('client_reference_id', offerId);
  form.set('line_items[0][price_data][currency]','usd');
  form.set('line_items[0][price_data][unit_amount]', String(amountCents));
  form.set('line_items[0][price_data][product_data][name]', `Atlas 259 resale · ${lotId}`);
  form.set('line_items[0][price_data][product_data][description]', 'Accepted offer for a digital Moon registry/advertising position; not legal lunar real estate.');
  form.set('line_items[0][quantity]','1');
  form.set('metadata[transaction_type]','resale');
  form.set('metadata[offer_id]', offerId);
  form.set('metadata[lot_id]', lotId);
  form.set('integration_identifier', `atlas259_resale_${randomLetters(8)}`);
  form.set('expires_at', String(Math.floor(Date.now()/1000) + 30 * 60));

  const res = await fetch(`${STRIPE_API}/checkout/sessions`, {
    method:'POST',
    headers:{
      authorization:`Bearer ${process.env.STRIPE_SECRET_KEY}`,
      'content-type':'application/x-www-form-urlencoded',
      'idempotency-key':`atlas259-resale-offer-${offerId}`
    },
    body:form
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Stripe resale checkout creation failed (${res.status})`);
  if (!data?.id || !data?.url) throw new Error('Stripe resale checkout response did not include id/url');
  return data;
}


export function stripeConnectEnabled(env=process.env) {
  return String(env.STRIPE_CONNECT_ENABLED || '').toLowerCase() === 'true';
}

export function assertStripeConnectEnabled() {
  assertStripeConfig();
  if (!stripeConnectEnabled()) {
    const err = new Error('Stripe Connect seller payouts are not enabled for this environment');
    err.code = 'STRIPE_CONNECT_DISABLED';
    throw err;
  }
}

async function stripeFormRequest(path, { method='POST', form, idempotencyKey } = {}) {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('Stripe secret key is required');
  const headers = {
    authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
    'content-type': 'application/x-www-form-urlencoded',
  };
  if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
  const res = await fetch(`${STRIPE_API}${path}`, {
    method,
    headers,
    body: form,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Stripe request failed (${res.status})`);
  return data;
}

export async function createSellerConnectedAccount({ userId, email, country='US' }) {
  assertStripeConnectEnabled();
  if (!userId || !email) throw new Error('Seller account creation requires user ID and email');
  const form = new URLSearchParams();
  form.set('type','express');
  form.set('country',String(country || 'US').toUpperCase());
  form.set('email',email);
  form.set('capabilities[transfers][requested]','true');
  form.set('metadata[atlas_user_id]',userId);
  form.set('metadata[product]','atlas259_marketplace');
  const account = await stripeFormRequest('/accounts', {
    form,
    idempotencyKey:`atlas259-seller-${userId}`,
  });
  if (!account?.id) throw new Error('Stripe connected account response did not include an ID');
  return account;
}

export async function retrieveSellerConnectedAccount(accountId) {
  assertStripeConnectEnabled();
  if (!/^acct_/.test(String(accountId || ''))) throw new Error('Invalid Stripe connected account ID');
  const res = await fetch(`${STRIPE_API}/accounts/${encodeURIComponent(accountId)}`, {
    headers:{ authorization:`Bearer ${process.env.STRIPE_SECRET_KEY}` }
  });
  const data=await res.json();
  if(!res.ok)throw new Error(data?.error?.message || `Stripe account retrieval failed (${res.status})`);
  return data;
}

export async function createSellerOnboardingLink({ accountId }) {
  assertStripeConnectEnabled();
  if (!/^acct_/.test(String(accountId || ''))) throw new Error('Invalid Stripe connected account ID');
  const base=String(process.env.APP_URL).replace(/\/$/,'');
  const form=new URLSearchParams();
  form.set('account',accountId);
  form.set('refresh_url',`${base}/?seller_onboarding=refresh`);
  form.set('return_url',`${base}/?seller_onboarding=return`);
  form.set('type','account_onboarding');
  const link=await stripeFormRequest('/account_links',{form});
  if(!link?.url)throw new Error('Stripe Account Link response did not include a URL');
  return link;
}

export function normalizeSellerAccountStatus(account) {
  const due=Array.isArray(account?.requirements?.currently_due) ? account.requirements.currently_due.length : 0;
  const transfersEnabled=account?.capabilities?.transfers === 'active';
  const payoutsEnabled=Boolean(account?.payouts_enabled);
  const detailsSubmitted=Boolean(account?.details_submitted);
  let onboardingStatus='not_started';
  if(transfersEnabled) onboardingStatus='enabled';
  else if(detailsSubmitted && due>0) onboardingStatus='restricted';
  else if(account?.id) onboardingStatus='pending';
  return {
    stripeAccountId:account?.id || null,
    onboardingStatus,
    transfersEnabled,
    payoutsEnabled,
    detailsSubmitted,
    requirementsDueCount:due,
  };
}

export async function retrievePaymentIntent(paymentIntentId) {
  assertStripeConnectEnabled();
  if(!/^pi_/.test(String(paymentIntentId||'')))throw new Error('Invalid Stripe PaymentIntent ID');
  const res=await fetch(`${STRIPE_API}/payment_intents/${encodeURIComponent(paymentIntentId)}`,{
    headers:{authorization:`Bearer ${process.env.STRIPE_SECRET_KEY}`}
  });
  const data=await res.json();
  if(!res.ok)throw new Error(data?.error?.message || `Stripe PaymentIntent retrieval failed (${res.status})`);
  return data;
}

export async function createSellerTransfer({
  transactionId,
  amountCents,
  destinationAccountId,
  paymentIntentId,
  transferGroup,
}) {
  assertStripeConnectEnabled();
  if(!transactionId)throw new Error('Transfer requires transaction ID');
  if(!Number.isInteger(Number(amountCents)) || Number(amountCents)<=0)throw new Error('Transfer amount must be positive whole cents');
  if(!/^acct_/.test(String(destinationAccountId||'')))throw new Error('Transfer requires a connected destination account');
  const intent=await retrievePaymentIntent(paymentIntentId);
  const chargeId=typeof intent.latest_charge==='string' ? intent.latest_charge : intent.latest_charge?.id;
  if(!/^ch_/.test(String(chargeId||'')))throw new Error('PaymentIntent does not expose a transferable latest charge');

  const form=new URLSearchParams();
  form.set('amount',String(amountCents));
  form.set('currency','usd');
  form.set('destination',destinationAccountId);
  form.set('source_transaction',chargeId);
  if(transferGroup)form.set('transfer_group',transferGroup);
  form.set('metadata[atlas_transaction_id]',transactionId);
  form.set('metadata[product]','atlas259_resale');
  const transfer=await stripeFormRequest('/transfers',{
    form,
    idempotencyKey:`atlas259-resale-transfer-${transactionId}`,
  });
  if(!transfer?.id)throw new Error('Stripe transfer response did not include an ID');
  return { transfer, chargeId };
}

export async function reverseSellerTransfer({ transactionId, transferId, reason }) {
  assertStripeConnectEnabled();
  if(!transactionId || !/^tr_/.test(String(transferId||'')))throw new Error('Transfer reversal requires transaction and transfer IDs');
  if(!['refund','dispute','correction'].includes(reason))throw new Error('Invalid transfer reversal reason');
  const form=new URLSearchParams();
  form.set('metadata[atlas_transaction_id]',transactionId);
  form.set('metadata[reason]',reason);
  const reversal=await stripeFormRequest(`/transfers/${encodeURIComponent(transferId)}/reversals`,{
    form,
    idempotencyKey:`atlas259-transfer-reversal-${transactionId}-${reason}`,
  });
  if(!reversal?.id)throw new Error('Stripe transfer reversal response did not include an ID');
  return reversal;
}
