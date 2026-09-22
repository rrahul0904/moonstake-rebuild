export function classifyStripeFinancialProtectionEvent(event) {
  const type=String(event?.type||'');
  const object=event?.data?.object || {};

  if(type==='charge.refunded'){
    const amount=Number(object.amount||0);
    const amountRefunded=Number(object.amount_refunded||0);
    const full=object.refunded===true || (amount>0 && amountRefunded>=amount);
    return {
      relevant:true,
      automatic:full,
      reason:'refund',
      paymentIntentId:String(object.payment_intent||''),
      chargeId:String(object.id||''),
      amountCents:amountRefunded,
      full,
    };
  }

  if(type==='charge.dispute.created'){
    return {
      relevant:true,
      automatic:false,
      reason:'dispute',
      paymentIntentId:String(object.payment_intent||''),
      chargeId:typeof object.charge==='string' ? object.charge : String(object?.charge?.id||''),
      amountCents:Number(object.amount||0),
      full:false,
    };
  }

  return {
    relevant:false,
    automatic:false,
    reason:null,
    paymentIntentId:'',
    chargeId:'',
    amountCents:0,
    full:false,
  };
}

export function financialProtectionActor(event) {
  return `stripe:${String(event?.type||'unknown')}:${String(event?.id||'unknown')}`;
}

export function findResaleTransactionForProtection(transactions, action) {
  const rows=Array.isArray(transactions) ? transactions : [];
  if(!action?.relevant)return null;
  return rows.find((tx)=>{
    if(tx?.kind!=='resale')return false;
    if(action.paymentIntentId && tx.stripe_payment_intent_id===action.paymentIntentId)return true;
    if(action.chargeId && tx.stripe_charge_id===action.chargeId)return true;
    return false;
  }) || null;
}

export function shouldAutomaticallyReverseProtection(action, transaction) {
  if(!action?.relevant || !transaction || transaction.kind!=='resale')return false;
  if(transaction.payout_status!=='paid' || !transaction.stripe_transfer_id)return false;
  if(action.reason==='refund')return action.full===true;
  if(action.reason==='dispute'){
    const gross=Number(transaction.gross_cents||0);
    return gross>0 && Number(action.amountCents||0)>=gross;
  }
  return false;
}
