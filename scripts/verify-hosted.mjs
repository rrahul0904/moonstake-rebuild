const baseArg=process.argv[2] || process.env.HOSTED_BASE_URL;
if(!baseArg){
  console.error('HOSTED_BASE_URL or first argument is required');
  process.exit(2);
}
const base=new URL(baseArg);
if(base.protocol!=='https:'){
  console.error('Hosted certification requires HTTPS');
  process.exit(2);
}
async function get(path,{json=false}={}){
  const url=new URL(path,base);
  const res=await fetch(url,{redirect:'follow',headers:{'user-agent':'atlas259-hosted-cert/1.0'}});
  const text=await res.text();
  if(!res.ok)throw new Error(`${path} returned ${res.status}: ${text.slice(0,300)}`);
  if(json){
    try{return JSON.parse(text)}catch{throw new Error(`${path} did not return JSON`)}
  }
  return text;
}
const root=await get('/');
if(!/Atlas 259/i.test(root))throw new Error('Root page does not identify Atlas 259');

const health=await get('/api/health',{json:true});
if(health?.ok!==true || health?.service!=='atlas259' || health?.mode!=='production'){
  throw new Error(`Unexpected health payload: ${JSON.stringify(health)}`);
}

const bodies=await get('/api/celestial-bodies',{json:true});
const moon=(bodies.bodies||[]).find(x=>x.id==='moon');
const earth=(bodies.bodies||[]).find(x=>x.id==='earth');
if(!moon?.enabled)throw new Error('Moon is not reported as the live body');
if(earth?.inventoryMode!=='reference-only')throw new Error('Earth must remain reference-only');

const bootstrap=await get('/api/bootstrap',{json:true});
if(!Array.isArray(bootstrap.claims))throw new Error('Bootstrap did not return claims array');
if(bootstrap.paymentsMode!=='stripe')throw new Error('Production bootstrap is not in Stripe mode');

const admin=await get('/admin.html');
if(!/Operator console/i.test(admin))throw new Error('Admin static surface is unavailable');

console.log(JSON.stringify({
  ok:true,
  base:base.origin,
  health,
  bodyCount:(bodies.bodies||[]).length,
  claimCount:bootstrap.claims.length,
},null,2));
