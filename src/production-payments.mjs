import { quoteSectors } from './pricing.mjs';
import {
  attachCheckoutSession,
  listRegistryTransactions,
  listUnavailableSectorIds,
  processCheckoutCompleted,
  processCheckoutExpired,
  processMldResaleCheckoutCompleted,
  processMldResaleCheckoutExpired,
  releaseReservation,
  reserveSectors,
} from './supabase.mjs';
import { createCheckoutSession, verifyStripeSignature } from './stripe.mjs';
import { reverseResalePayout, settleResalePayout } from './production-payouts.mjs';
import {
  classifyStripeFinancialProtectionEvent,
  financialProtectionActor,
  findResaleTransactionForProtection,
  shouldAutomaticallyReverseProtection,
} from './financial-protection.mjs';
import { json, normalizeUrl, readBody, sessionUser } from './production-common.mjs';

export async function handlePaymentApi(req, res, url) {
  if (req.method === 'POST' && url.pathname === '/api/webhooks/stripe') {
    const raw = await readBody(req, true);
    if (!verifyStripeSignature(raw, req.headers['stripe-signature'])) {
      return json(res, 400, { error: 'Invalid Stripe signature' });
    }
    const event = JSON.parse(raw);
    const object = event?.data?.object || {};

    const protection=classifyStripeFinancialProtectionEvent(event);
    if(protection.relevant){
      const transactions=await listRegistryTransactions({limit:1000});
      const transaction=findResaleTransactionForProtection(transactions,protection);
      if(transaction && shouldAutomaticallyReverseProtection(protection,transaction)){
        try{
          await reverseResalePayout({
            transactionId:transaction.id,
            reason:protection.reason,
            actor:financialProtectionActor(event),
          });
        }catch(err){
          console.error('Atlas 259 automatic seller transfer reversal failed:',err.message);
          return json(res,500,{received:false,error:'Automatic seller transfer reversal failed'});
        }
      }else if(transaction){
        console.warn(
          `Atlas 259 financial protection requires operator review: ${event.type} transaction=${transaction.id} amount=${protection.amountCents}`,
        );
      }else{
        console.warn(`Atlas 259 financial protection event did not match a resale transaction: ${event.type} ${event.id}`);
      }
      return json(res,200,{received:true});
    }

    const isResale = object?.metadata?.transaction_type === 'resale';
    const offerId = object?.metadata?.offer_id;
    const reservationId = object?.metadata?.reservation_id || (!isResale ? object?.client_reference_id : null);

    if (
      isResale &&
      offerId &&
      ((event.type === 'checkout.session.completed' && object.payment_status === 'paid') ||
        event.type === 'checkout.session.async_payment_succeeded')
    ) {
      const transactionId=await processMldResaleCheckoutCompleted({
        eventId:event.id,
        offerId,
        sessionId:object.id,
        paymentIntentId:object.payment_intent,
      });
      if(transactionId){
        settleResalePayout(transactionId).catch((err)=>{
          console.error('Atlas 259 seller payout deferred:',err.message);
        });
      }
    } else if (
      isResale &&
      offerId &&
      (event.type === 'checkout.session.expired' || event.type === 'checkout.session.async_payment_failed')
    ) {
      await processMldResaleCheckoutExpired({ eventId:event.id, offerId, sessionId:object.id });
    } else if (
      ((event.type === 'checkout.session.completed' && object.payment_status === 'paid') ||
        event.type === 'checkout.session.async_payment_succeeded') &&
      reservationId
    ) {
      await processCheckoutCompleted({
        eventId: event.id,
        reservationId,
        sessionId: object.id,
        paymentIntentId: object.payment_intent,
      });
    } else if (
      (event.type === 'checkout.session.expired' || event.type === 'checkout.session.async_payment_failed') &&
      reservationId
    ) {
      await processCheckoutExpired({ eventId: event.id, reservationId });
    }
    return json(res, 200, { received: true });
  }

  if (req.method === 'POST' && url.pathname === '/api/claims') {
    const auth = await sessionUser(req, res);
    if (!auth) return json(res, 401, { error: 'Sign in required' });

    const body = await readBody(req);
    const sectors = Array.isArray(body.sectors) ? body.sectors : [];
    const brand = String(body.brand || '').trim().slice(0, 64);
    const tagline = String(body.tagline || '').trim().slice(0, 140);
    if (!brand) return json(res, 400, { error: 'Brand name is required' });

    let claimUrl = '';
    try {
      claimUrl = normalizeUrl(body.url);
    } catch (err) {
      return json(res, 400, { error: err.message });
    }

    let reservationId;
    try {
      const quote = quoteSectors(sectors, new Set(await listUnavailableSectorIds()));
      if (!quote.count) return json(res, 409, { error: 'Select at least one available sector' });
      if (quote.unavailable.length) {
        return json(res, 409, { error: 'One or more selected sectors were just claimed or reserved' });
      }
      reservationId = await reserveSectors({
        userId: auth.user.id,
        brand,
        tagline,
        url: claimUrl,
        sectors: quote.lines.map((x) => x.id),
        pricesCents: quote.lines.map((x) => x.priceCents),
        amountCents: quote.totalCents,
      });
      const checkout = await createCheckoutSession({
        reservationId,
        amountCents: quote.totalCents,
        sectorCount: quote.count,
        brand,
      });
      await attachCheckoutSession({ reservationId, sessionId: checkout.id, userId: auth.user.id });
      return json(res, 201, {
        reservation: {
          id: reservationId,
          sectors: quote.lines.map((x) => x.id),
          amount: quote.total,
          currency: 'USD',
        },
        payment: {
          mode: 'stripe',
          status: 'requires_action',
          url: checkout.url,
          sessionId: checkout.id,
        },
      });
    } catch (err) {
      if (reservationId) await releaseReservation(reservationId).catch(() => {});
      return json(res, 409, { error: err.message });
    }
  }

  return false;
}
