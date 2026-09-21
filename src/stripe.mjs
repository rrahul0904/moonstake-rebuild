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
