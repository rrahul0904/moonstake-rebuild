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
    const amount=Number(object.amount||0);
    const chargeAmount=Number(object?.charge?.amount||object?.metadata?.charge_amount||0);
    const full=Boolean(object.is_charge_refundable===false) || (chargeAmount>0 && amount>=chargeAmount);
    return {
      relevant:true,
      automatic:full,
      reason:'dispute',
      paymentIntentId:String(object.payment_intent||''),
      chargeId:typeof object.charge==='string' ? object.charge : String(object?.charge?.id||''),
      amountCents:amount,
      full,
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
