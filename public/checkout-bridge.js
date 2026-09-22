(() => {
  addEventListener('DOMContentLoaded',async()=>{
    try{
      const data=await fetch('/api/bootstrap',{cache:'no-store'}).then(r=>r.json());
      if(data?.paymentsMode==='stripe'){
        const copy=document.querySelector('#claim-form .fineprint');
        if(copy)copy.textContent='Secure checkout is handled by Stripe. Ownership is created only after verified payment.';
        const button=document.querySelector('#claim-form button[type="submit"]');
        if(button)button.textContent='Continue to secure checkout';
      }
    }catch{}

    const params=new URLSearchParams(location.search);
    const checkout=params.get('checkout');
    const resale=params.get('resale');
    const state=checkout||resale;
    if(!state)return;

    const note=document.createElement('div');
    note.setAttribute('role','status');
    note.style.cssText='position:fixed;z-index:120;left:50%;bottom:88px;transform:translateX(-50%);padding:11px 16px;border-radius:999px;background:#ece9e1;color:#111;font:700 11px ui-monospace,monospace;box-shadow:0 12px 40px #000;';
    if(resale){
      note.textContent=state==='success'
        ? 'Resale payment received — ownership finalizes from the verified Stripe webhook.'
        : 'Resale checkout cancelled — ownership is unchanged.';
    }else{
      note.textContent=state==='success'
        ? 'Payment received — ownership finalizes from the verified Stripe webhook.'
        : 'Checkout cancelled — reserved positions will be released.';
    }
    document.body.append(note);
    setTimeout(()=>note.remove(),6000);
  });
})();
