(() => {
  const originalFetch=window.fetch.bind(window);
  window.fetch=async (...args) => {
    const res=await originalFetch(...args);
    const url=String(args[0] instanceof Request?args[0].url:args[0]||'');
    const method=String(args[1]?.method||'GET').toUpperCase();
    if(method==='POST'&&url.includes('/api/claims')){
      try{
        const data=await res.clone().json();
        if(data?.payment?.status==='requires_action'&&data.payment.url){
          window.location.assign(data.payment.url);
          return new Promise(() => {});
        }
      }catch{}
    }
    return res;
  };

  addEventListener('DOMContentLoaded',async()=>{
    try{
      const data=await originalFetch('/api/bootstrap',{cache:'no-store'}).then(r=>r.json());
      if(data?.paymentsMode==='stripe'){
        const copy=document.querySelector('#claim-form .fineprint');
        if(copy)copy.textContent='Secure checkout is handled by Stripe. Ownership is created only after verified payment.';
        const button=document.querySelector('#claim-form button[type="submit"]');
        if(button)button.textContent='Continue to secure checkout';
      }
    }catch{}
    const state=new URLSearchParams(location.search).get('checkout');
    if(!state)return;
    const note=document.createElement('div');
    note.setAttribute('role','status');
    note.style.cssText='position:fixed;z-index:120;left:50%;bottom:88px;transform:translateX(-50%);padding:11px 16px;border-radius:999px;background:#ece9e1;color:#111;font:700 11px ui-monospace,monospace;box-shadow:0 12px 40px #000;';
    note.textContent=state==='success'?'Payment received — finalizing your lunar claim.':'Checkout cancelled — reserved sectors will be released.';
    document.body.append(note);setTimeout(()=>note.remove(),5000);
  });
})();
