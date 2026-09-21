import { offerGuidance } from './market-model.mjs';
import {
  acceptMldOffer,
  attachMldOfferCheckout,
  createMldOffer,
  getMldLot,
  getMldLotMetrics,
  getMldOffer,
  getSellerPayoutReadiness,
  listReceivedMldOffers,
  listSentMldOffers,
  listMldLotTransactions,
  withdrawMldOffer,
} from './supabase.mjs';
import { createResaleCheckoutSession } from './stripe.mjs';
import { json, readBody, sessionUser } from './production-common.mjs';

const LOT_RE=/^MOON-(\d{3})-(\d{3})$/;

function validLotId(value) {
  const id=String(value||'').trim().toUpperCase();
  const match=LOT_RE.exec(id);
  if(!match) return null;
  const x=Number(match[1]),y=Number(match[2]);
  return x<720&&y<360?id:null;
}

export async function handleMarketplaceApi(req,res,url) {
  const marketMatch=/^\/api\/lots\/([^/]+)\/market$/.exec(url.pathname);
  if(req.method==='GET'&&marketMatch){
    const lotId=validLotId(decodeURIComponent(marketMatch[1]));
    if(!lotId)return json(res,400,{error:'Invalid Moon registry position'});
    const [lot,metrics,history]=await Promise.all([getMldLot(lotId),getMldLotMetrics(lotId),listMldLotTransactions(lotId)]);
    if(!lot)return json(res,404,{error:'This position has not had a primary sale yet'});
    const guidance=offerGuidance(Number(lot.last_paid_cents));
    return json(res,200,{
      lot:{
        id:lot.lot_id,
        lastPaidCents:Number(lot.last_paid_cents),
        purchaseCount:Number(lot.purchase_count),
        views:Number(metrics?.views||0),
        clicks:Number(metrics?.clicks||0),
        updatedAt:lot.updated_at,
      },
      offer:{
        minimumCents:guidance.minimumCents,
        suggestedCents:guidance.suggestedCents,
      },
      history
    });
  }

  if(req.method==='GET'&&url.pathname==='/api/offers/mine'){
    const auth=await sessionUser(req,res);
    if(!auth)return json(res,401,{error:'Sign in required'});
    const [sent,received,payout]=await Promise.all([
      listSentMldOffers(auth.user.id),
      listReceivedMldOffers(auth.user.id),
      getSellerPayoutReadiness(auth.user.id),
    ]);
    return json(res,200,{sent,received,payout});
  }

  if(req.method==='POST'&&url.pathname==='/api/offers'){
    const auth=await sessionUser(req,res);
    if(!auth)return json(res,401,{error:'Sign in required'});
    const body=await readBody(req);
    const lotId=validLotId(body.lotId);
    const amountCents=Number(body.amountCents);
    if(!lotId)return json(res,400,{error:'Invalid Moon registry position'});
    if(!Number.isInteger(amountCents))return json(res,400,{error:'Offer amount must be whole cents'});
    const lot=await getMldLot(lotId);
    if(!lot)return json(res,404,{error:'Offers can only be made on already-held positions'});
    const guidance=offerGuidance(Number(lot.last_paid_cents));
    if(amountCents<guidance.minimumCents){
      return json(res,400,{error:`Offer must be at least $${(guidance.minimumCents/100).toFixed(2)}`,minimumCents:guidance.minimumCents,suggestedCents:guidance.suggestedCents});
    }
    try{
      const offerId=await createMldOffer({lotId,buyerUserId:auth.user.id,amountCents,expiresHours:168});
      return json(res,201,{offer:await getMldOffer(offerId)});
    }catch(err){
      return json(res,409,{error:err.message});
    }
  }

  const withdraw=/^\/api\/offers\/([^/]+)\/withdraw$/.exec(url.pathname);
  if(req.method==='POST'&&withdraw){
    const auth=await sessionUser(req,res);
    if(!auth)return json(res,401,{error:'Sign in required'});
    try{
      await withdrawMldOffer({offerId:withdraw[1],buyerUserId:auth.user.id});
      return json(res,200,{ok:true});
    }catch(err){return json(res,409,{error:err.message});}
  }

  const accept=/^\/api\/offers\/([^/]+)\/accept$/.exec(url.pathname);
  if(req.method==='POST'&&accept){
    const auth=await sessionUser(req,res);
    if(!auth)return json(res,401,{error:'Sign in required'});
    try{
      await acceptMldOffer({offerId:accept[1],sellerUserId:auth.user.id,paymentWindowHours:24});
      return json(res,200,{offer:await getMldOffer(accept[1])});
    }catch(err){return json(res,409,{error:err.message});}
  }

  const checkout=/^\/api\/offers\/([^/]+)\/checkout$/.exec(url.pathname);
  if(req.method==='POST'&&checkout){
    const auth=await sessionUser(req,res);
    if(!auth)return json(res,401,{error:'Sign in required'});
    const offer=await getMldOffer(checkout[1]);
    if(!offer)return json(res,404,{error:'Offer not found'});
    if(offer.buyer_user_id!==auth.user.id)return json(res,403,{error:'Only the offer buyer can pay this accepted offer'});
    if(offer.status!=='accepted_pending_payment')return json(res,409,{error:'Offer is not awaiting payment'});
    if(new Date(offer.payment_due_at).getTime()<=Date.now())return json(res,409,{error:'Offer payment window expired'});
    try{
      const session=await createResaleCheckoutSession({
        offerId:offer.id,
        amountCents:Number(offer.amount_cents),
        lotId:offer.lot_id,
      });
      await attachMldOfferCheckout({offerId:offer.id,buyerUserId:auth.user.id,sessionId:session.id});
      return json(res,201,{payment:{mode:'stripe',status:'requires_action',url:session.url,sessionId:session.id},offerId:offer.id});
    }catch(err){return json(res,409,{error:err.message});}
  }

  return false;
}
