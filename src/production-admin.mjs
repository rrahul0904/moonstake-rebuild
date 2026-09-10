import { getAdminClaim, listAdminClaims, recordClaimRefund, updateModeration } from './supabase.mjs';
import { createRefund } from './stripe.mjs';
import { adminAllowed, json, readBody, sessionUser } from './production-common.mjs';

async function requireAdmin(req, res) {
  const auth = await sessionUser(req, res);
  if (!auth || !adminAllowed(auth.user.email)) {
    json(res, 403, { error: 'Admin access required' });
    return null;
  }
  return auth;
}

export async function handleAdminApi(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/admin/claims') {
    const auth = await requireAdmin(req, res);
    if (!auth) return true;
    json(res, 200, { claims: await listAdminClaims() });
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/moderate') {
    const auth = await requireAdmin(req, res);
    if (!auth) return true;
    const body = await readBody(req);
    if (!['active', 'hidden'].includes(body.status)) {
      json(res, 400, { error: 'Invalid moderation status. Use /api/admin/refund for refunds.' });
      return true;
    }
    await updateModeration({
      claimId: String(body.claimId || ''),
      status: body.status,
      note: String(body.note || '').slice(0, 500),
      actor: auth.user.email,
    });
    json(res, 200, { ok: true });
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/refund') {
    const auth = await requireAdmin(req, res);
    if (!auth) return true;
    const body = await readBody(req);
    const claimId = String(body.claimId || '');
    const reason = String(body.reason || 'requested_by_customer');
    const note = String(body.note || '').slice(0, 500);
    const claim = await getAdminClaim(claimId);
    if (!claim) return json(res, 404, { error: 'Claim not found' });
    if (claim.status === 'refunded') {
      return json(res, 409, { error: 'Claim is already refunded', refundId: claim.stripe_refund_id || null });
    }
    if (!claim.stripe_payment_intent_id) {
      return json(res, 409, { error: 'Claim has no Stripe payment intent to refund' });
    }
    try {
      const refund = await createRefund({ claimId, paymentIntentId: claim.stripe_payment_intent_id, reason });
      await recordClaimRefund({ claimId, refundId: refund.id, actor: auth.user.email, note });
      return json(res, 200, { ok: true, refund: { id: refund.id, status: refund.status } });
    } catch (err) {
      return json(res, 409, { error: err.message });
    }
  }

  return false;
}
