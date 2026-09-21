const SUPABASE_URL = () => String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const PUBLISHABLE = () => process.env.SUPABASE_PUBLISHABLE_KEY || '';
const SECRET = () => process.env.SUPABASE_SECRET_KEY || '';

export function assertSupabaseConfig() {
  if (!SUPABASE_URL() || !PUBLISHABLE() || !SECRET()) {
    throw new Error('Supabase production mode requires SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY');
  }
}

async function request(path, { method='GET', body, headers={}, key='secret', accessToken, raw=false } = {}) {
  assertSupabaseConfig();
  const apiKey = key === 'publishable' ? PUBLISHABLE() : SECRET();
  const finalHeaders = { apikey: apiKey, ...headers };
  if (accessToken) finalHeaders.authorization = `Bearer ${accessToken}`;
  if (body !== undefined && !(body instanceof URLSearchParams)) finalHeaders['content-type'] = 'application/json';
  const res = await fetch(`${SUPABASE_URL()}${path}`, {
    method,
    headers: finalHeaders,
    body: body === undefined ? undefined : body instanceof URLSearchParams ? body : JSON.stringify(body)
  });
  const text = await res.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  if (!res.ok) {
    const message = data?.msg || data?.message || data?.error_description || data?.error || `Supabase request failed (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    err.payload = data;
    throw err;
  }
  return raw ? { res, data } : data;
}

export async function authSignUp(email, password, brand) {
  const data = await request('/auth/v1/signup', { method:'POST', key:'publishable', body:{ email, password, data:{ brand } } });
  if (data?.user?.id) {
    await request('/rest/v1/profiles', {
      method:'POST',
      headers:{ Prefer:'resolution=merge-duplicates,return=representation' },
      body:{ id:data.user.id, brand }
    });
  }
  return data;
}

export async function authSignIn(email, password) {
  return request('/auth/v1/token?grant_type=password', { method:'POST', key:'publishable', body:{ email, password } });
}

export async function authRefresh(refreshToken) {
  return request('/auth/v1/token?grant_type=refresh_token', { method:'POST', key:'publishable', body:{ refresh_token: refreshToken } });
}

export async function authUser(accessToken) {
  return request('/auth/v1/user', { key:'publishable', accessToken });
}

export async function authSignOut(accessToken) {
  try { await request('/auth/v1/logout', { method:'POST', key:'publishable', accessToken }); } catch { /* cookie clearing remains authoritative for app */ }
}

export async function getProfile(userId) {
  const rows = await request(`/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=id,brand,created_at`);
  return rows?.[0] || null;
}

export async function listClaims() {
  return request('/rest/v1/claim_directory?select=*');
}

export async function listUnavailableSectorIds() {
  const now = encodeURIComponent(new Date().toISOString());
  const [claimed, held] = await Promise.all([
    request('/rest/v1/claim_sectors?select=sector_id'),
    request(`/rest/v1/sector_holds?select=sector_id&expires_at=gt.${now}`)
  ]);
  return [...new Set([...(claimed || []).map(x => x.sector_id), ...(held || []).map(x => x.sector_id)])];
}

export async function reserveSectors({ userId, brand, tagline, url, sectors, pricesCents, amountCents, ttlSeconds=2100 }) {
  const canonical = (sectors || []).every((id) => /^MOON-\d{3}-\d{3}$/.test(String(id)));
  if (canonical) {
    if (!Array.isArray(pricesCents) || pricesCents.length !== sectors.length) {
      throw new Error('Canonical registry reservations require a per-position price ledger');
    }
    return request('/rest/v1/rpc/reserve_registry_positions', { method:'POST', body:{
      p_user_id:userId, p_brand:brand, p_tagline:tagline, p_url:url || null,
      p_position_ids:sectors, p_price_cents:pricesCents, p_amount_cents:amountCents, p_ttl_seconds:ttlSeconds
    }});
  }
  return request('/rest/v1/rpc/reserve_sectors', { method:'POST', body:{
    p_user_id:userId, p_brand:brand, p_tagline:tagline, p_url:url || null,
    p_sector_ids:sectors, p_amount_cents:amountCents, p_ttl_seconds:ttlSeconds
  }});
}

export async function attachCheckoutSession({ reservationId, sessionId, userId }) {
  return request('/rest/v1/rpc/attach_checkout_session', { method:'POST', body:{
    p_reservation_id:reservationId, p_session_id:sessionId, p_user_id:userId
  }});
}

export async function releaseReservation(reservationId) {
  return request('/rest/v1/rpc/release_reservation', { method:'POST', body:{ p_reservation_id:reservationId } });
}

export async function processCheckoutCompleted({ eventId, reservationId, sessionId, paymentIntentId }) {
  return request('/rest/v1/rpc/process_stripe_checkout_completed', { method:'POST', body:{
    p_event_id:eventId, p_reservation_id:reservationId, p_session_id:sessionId, p_payment_intent:paymentIntentId || null
  }});
}

export async function processCheckoutExpired({ eventId, reservationId }) {
  return request('/rest/v1/rpc/process_stripe_checkout_expired', { method:'POST', body:{ p_event_id:eventId, p_reservation_id:reservationId } });
}

export async function insertEvent({ claimId, kind, fingerprint='' }) {
  return request('/rest/v1/events', { method:'POST', headers:{ Prefer:'return=minimal' }, body:{ claim_id:claimId, kind, fingerprint } });
}

export async function updateModeration({ claimId, status, note, actor }) {
  return request('/rest/v1/rpc/moderate_claim', { method:'POST', body:{ p_claim_id:claimId, p_status:status, p_note:note || '', p_actor:actor } });
}

export async function listAdminClaims() {
  return request('/rest/v1/claim_admin_directory?select=*&order=created_at.desc');
}

export async function getAdminClaim(claimId) {
  const rows = await request(`/rest/v1/claim_admin_directory?id=eq.${encodeURIComponent(claimId)}&select=*`);
  return rows?.[0] || null;
}

export async function recordClaimRefund({ claimId, refundId, actor, note='' }) {
  return request('/rest/v1/rpc/record_claim_refund', { method:'POST', body:{
    p_claim_id:claimId, p_refund_id:refundId, p_actor:actor, p_note:note
  }});
}

export async function consumeRateLimit({ bucket, keyHash, limit, windowSeconds }) {
  return request('/rest/v1/rpc/consume_rate_limit', { method:'POST', body:{
    p_bucket:bucket, p_key_hash:keyHash, p_limit:limit, p_window_seconds:windowSeconds
  }});
}


export async function getMldMarketSummary() {
  const rows = await request('/rest/v1/mld_market_summary?select=*');
  return rows?.[0] || null;
}


export async function listAuthUsers() {
  const data = await request('/auth/v1/admin/users?page=1&per_page=1000');
  return Array.isArray(data?.users) ? data.users : [];
}


export async function listMldTransactions(limit=250) {
  const safe = Math.max(1, Math.min(1000, Number(limit) || 250));
  return request(`/rest/v1/mld_transactions?select=*&order=created_at.desc&limit=${safe}`);
}

export async function listMldOffers(limit=250) {
  const safe = Math.max(1, Math.min(1000, Number(limit) || 250));
  return request(`/rest/v1/mld_offers?select=*&order=created_at.desc&limit=${safe}`);
}


export async function getMldLot(lotId) {
  const rows = await request(`/rest/v1/mld_lots?lot_id=eq.${encodeURIComponent(lotId)}&select=lot_id,owner_user_id,last_paid_cents,purchase_count,updated_at`);
  return rows?.[0] || null;
}

export async function getMldLotMetrics(lotId) {
  const rows = await request(`/rest/v1/mld_lot_directory?lot_id=eq.${encodeURIComponent(lotId)}&select=*`);
  return rows?.[0] || null;
}

export async function createMldOffer({ lotId, buyerUserId, amountCents, expiresHours=168 }) {
  return request('/rest/v1/rpc/mld_create_offer', { method:'POST', body:{
    p_lot_id:lotId, p_buyer_user_id:buyerUserId, p_amount_cents:amountCents, p_expires_hours:expiresHours
  }});
}

export async function withdrawMldOffer({ offerId, buyerUserId }) {
  return request('/rest/v1/rpc/mld_withdraw_offer', { method:'POST', body:{
    p_offer_id:offerId, p_buyer_user_id:buyerUserId
  }});
}

export async function acceptMldOffer({ offerId, sellerUserId, paymentWindowHours=24 }) {
  return request('/rest/v1/rpc/mld_accept_offer', { method:'POST', body:{
    p_offer_id:offerId, p_seller_user_id:sellerUserId, p_payment_window_hours:paymentWindowHours
  }});
}

export async function attachMldOfferCheckout({ offerId, buyerUserId, sessionId }) {
  return request('/rest/v1/rpc/mld_attach_offer_checkout', { method:'POST', body:{
    p_offer_id:offerId, p_buyer_user_id:buyerUserId, p_session_id:sessionId
  }});
}

export async function processMldResaleCheckoutCompleted({ eventId, offerId, sessionId, paymentIntentId }) {
  return request('/rest/v1/rpc/process_mld_resale_checkout_completed', { method:'POST', body:{
    p_event_id:eventId, p_offer_id:offerId, p_session_id:sessionId, p_payment_intent_id:paymentIntentId || null
  }});
}

export async function processMldResaleCheckoutExpired({ eventId, offerId, sessionId }) {
  return request('/rest/v1/rpc/process_mld_resale_checkout_expired', { method:'POST', body:{
    p_event_id:eventId, p_offer_id:offerId, p_session_id:sessionId
  }});
}

export async function getMldOffer(offerId) {
  const rows = await request(`/rest/v1/mld_offer_directory?id=eq.${encodeURIComponent(offerId)}&select=*`);
  return rows?.[0] || null;
}

export async function listSentMldOffers(userId) {
  return request(`/rest/v1/mld_offer_directory?buyer_user_id=eq.${encodeURIComponent(userId)}&select=*&order=created_at.desc`);
}

export async function listReceivedMldOffers(userId) {
  return request(`/rest/v1/mld_offer_directory?seller_user_id=eq.${encodeURIComponent(userId)}&select=*&order=created_at.desc`);
}

export async function getSellerPayoutReadiness(userId) {
  const rows = await request(`/rest/v1/seller_payout_readiness?user_id=eq.${encodeURIComponent(userId)}&select=*`);
  return rows?.[0] || {
    user_id:userId,
    owned_lots:0,
    stripe_account_id:null,
    onboarding_status:'not_started',
    transfers_enabled:false,
    payouts_enabled:false,
    details_submitted:false,
    requirements_due_count:0,
    last_stripe_sync_at:null,
    resale_payout_ready:false
  };
}


export async function recordMldLotEvent({ lotId, kind }) {
  return request('/rest/v1/rpc/mld_record_lot_event', { method:'POST', body:{
    p_lot_id:lotId, p_kind:kind
  }});
}


export async function listMldLotTransactions(lotId, limit=25) {
  const safe=Math.max(1,Math.min(100,Number(limit)||25));
  return request(`/rest/v1/mld_transactions?lot_id=eq.${encodeURIComponent(lotId)}&select=id,kind,gross_cents,previous_paid_cents,gain_cents,seller_payout_cents,mld_fee_cents,created_at&order=created_at.desc&limit=${safe}`);
}
