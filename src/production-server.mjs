import crypto from 'node:crypto';
import { LANDMARKS, quoteSectors } from './pricing.mjs';
import {
  authSignUp, authSignIn, authRefresh, authUser, authSignOut, getProfile,
  listClaims, listUnavailableSectorIds, reserveSectors, attachCheckoutSession,
  releaseReservation, processCheckoutCompleted, processCheckoutExpired, insertEvent,
  updateModeration, assertSupabaseConfig
} from './supabase.mjs';
import { createCheckoutSession, verifyStripeSignature, assertStripeConfig } from './stripe.mjs';

const ACCESS_COOKIE='ms_access';
const REFRESH_COOKIE='ms_refresh';
const SESSION_MAX_AGE=60*60*24*30;
const authAttempts = new Map();

function securityHeaders(){return {'x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':'strict-origin-when-cross-origin','permissions-policy':'camera=(), microphone=(), geolocation=()','content-security-policy':"default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-src https://checkout.stripe.com; connect-src 'self'"}}
function json(res,status,body,headers={}){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...securityHeaders(),...headers});res.end(JSON.stringify(body))}
function parseCookies(req){const result={};for(const pair of String(req.headers.cookie||'').split(';')){const i=pair.indexOf('=');if(i>0)result[pair.slice(0,i).trim()]=decodeURIComponent(pair.slice(i+1).trim())}return result}
function cookie(name,value,maxAge=SESSION_MAX_AGE){const secure=process.env.NODE_ENV==='production'?'; Secure':'';return `${name}=${encodeURIComponent(value)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`}
function clearCookies(){return [`${ACCESS_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`,`${REFRESH_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`]}
function setSessionHeaders(session){return {'set-cookie':[cookie(ACCESS_COOKIE,session.access_token,Number(session.expires_in||3600)),cookie(REFRESH_COOKIE,session.refresh_token)]}}
function normalizeUrl(input){if(!input)return '';const value=String(input).trim();const candidate=/^https?:\/\//i.test(value)?value:`https://${value}`;const u=new URL(candidate);if(!['http:','https:'].includes(u.protocol))throw new Error('Only http(s) URLs are allowed');return u.toString()}
async function readBody(req,raw=false){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>1_000_000)throw new Error('Body too large');chunks.push(chunk)}const text=Buffer.concat(chunks).toString('utf8');if(raw)return text;return text?JSON.parse(text):{}}
function clientIp(req){return String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim()}
function checkRateLimit(req,key,limit=10,windowMs=10*60*1000){const id=`${key}:${clientIp(req)}`;const now=Date.now();const state=authAttempts.get(id)||{count:0,resetAt:now+windowMs};if(now>state.resetAt){state.count=0;state.resetAt=now+windowMs}state.count++;authAttempts.set(id,state);return state.count<=limit}
function requireTrustedOrigin(req){if(!['POST','PUT','PATCH','DELETE'].includes(req.method))return true;const origin=req.headers.origin;if(!origin)return true;const app=process.env.APP_URL;try{return new URL(origin).origin===new URL(app).origin}catch{return false}}
function toPublicUser(user,profile){return user?{id:user.id,email:user.email,brand:profile?.brand||user.user_metadata?.brand||'',createdAt:profile?.created_at||user.created_at}:null}

async function sessionUser(req,res){
  const cookies=parseCookies(req);let access=cookies[ACCESS_COOKIE];const refresh=cookies[REFRESH_COOKIE];
  if(!access)return null;
  try{const user=await authUser(access);const profile=await getProfile(user.id);return {user,profile,public:toPublicUser(user,profile)}}catch(err){
    if(!refresh)return null;
    try{const session=await authRefresh(refresh);access=session.access_token;const user=await authUser(access);const profile=await getProfile(user.id);res.setHeader('set-cookie',setSessionHeaders(session)['set-cookie']);return {user,profile,public:toPublicUser(user,profile)}}catch{return null}
  }
}

function claimStats(rows){const claims=(rows||[]).map(r=>({id:r.id,userId:r.user_id,brand:r.brand,tagline:r.tagline||'',url:r.url||'',sectors:r.sectors||[],amount:Number(r.amount_cents||0)/100,currency:r.currency||'USD',createdAt:r.created_at,views:Number(r.views||0),clicks:Number(r.clicks||0),status:r.status}));return {claims,offices:claims.length,index:100,onBoard:claims.length,views:claims.reduce((s,c)=>s+c.views,0),clickThroughs:claims.reduce((s,c)=>s+c.clicks,0),claimedSectors:claims.reduce((s,c)=>s+c.sectors.length,0)}}
function boardFromClaims(claims){return claims.map(c=>({id:c.id,brand:c.brand,tagline:c.tagline,url:c.url,sectors:c.sectors.length,views:c.views,clicks:c.clicks,ctr:c.views?c.clicks/c.views:0,createdAt:c.createdAt})).sort((a,b)=>(b.views+b.clicks*3+b.sectors*2)-(a.views+a.clicks*3+a.sectors*2))}
function adminAllowed(email){const allowed=String(process.env.ADMIN_EMAILS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);return allowed.includes(String(email||'').toLowerCase())}

export async function handleProductionApi(req,res,url){
  assertSupabaseConfig();assertStripeConfig();
  if(!requireTrustedOrigin(req))return json(res,403,{error:'Untrusted request origin'});

  if(req.method==='POST'&&url.pathname==='/api/webhooks/stripe'){
    const raw=await readBody(req,true);if(!verifyStripeSignature(raw,req.headers['stripe-signature']))return json(res,400,{error:'Invalid Stripe signature'});
    const event=JSON.parse(raw);const object=event?.data?.object||{};const reservationId=object?.metadata?.reservation_id||object?.client_reference_id;
    if((event.type==='checkout.session.completed'&&object.payment_status==='paid'||event.type==='checkout.session.async_payment_succeeded')&&reservationId){await processCheckoutCompleted({eventId:event.id,reservationId,sessionId:object.id,paymentIntentId:object.payment_intent})}
    else if((event.type==='checkout.session.expired'||event.type==='checkout.session.async_payment_failed')&&reservationId){await processCheckoutExpired({eventId:event.id,reservationId})}
    return json(res,200,{received:true});
  }

  if(req.method==='GET'&&url.pathname==='/api/bootstrap'){
    const [rows,auth]=await Promise.all([listClaims(),sessionUser(req,res)]);const s=claimStats(rows);return json(res,200,{user:auth?.public||null,stats:{offices:s.offices,index:s.index,onBoard:s.onBoard,views:s.views,clickThroughs:s.clickThroughs,claimedSectors:s.claimedSectors},claims:s.claims,landmarks:LANDMARKS,paymentsMode:'stripe'});
  }
  if(req.method==='GET'&&url.pathname==='/api/board'){const s=claimStats(await listClaims());return json(res,200,{board:boardFromClaims(s.claims)})}
  if(req.method==='GET'&&url.pathname==='/api/explore'){const q=String(url.searchParams.get('q')||'').trim().toLowerCase();const s=claimStats(await listClaims());return json(res,200,{landmarks:LANDMARKS.filter(x=>!q||`${x.name} ${x.subtitle}`.toLowerCase().includes(q)),brands:s.claims.filter(x=>!q||`${x.brand} ${x.tagline}`.toLowerCase().includes(q))})}
  if(req.method==='GET'&&url.pathname==='/api/my-land'){const auth=await sessionUser(req,res);if(!auth)return json(res,401,{error:'Sign in required'});const s=claimStats(await listClaims());return json(res,200,{claims:s.claims.filter(c=>c.userId===auth.user.id)})}

  if(req.method==='POST'&&url.pathname==='/api/auth/signup'){
    if(!checkRateLimit(req,'signup',5))return json(res,429,{error:'Too many signup attempts. Try again later.'});const body=await readBody(req);const email=String(body.email||'').trim().toLowerCase();const password=String(body.password||'');const brand=String(body.brand||'').trim().slice(0,64);if(!/^\S+@\S+\.\S+$/.test(email))return json(res,400,{error:'Enter a valid email'});if(password.length<8)return json(res,400,{error:'Password must be at least 8 characters'});if(!brand)return json(res,400,{error:'Brand name is required'});
    try{const data=await authSignUp(email,password,brand);if(!data?.session&&!data?.access_token)return json(res,201,{user:toPublicUser(data.user,{brand}),verificationRequired:true});const session=data.session||data;return json(res,201,{user:toPublicUser(data.user,{brand})},setSessionHeaders(session))}catch(err){return json(res,err.status===422?409:400,{error:err.message})}
  }
  if(req.method==='POST'&&url.pathname==='/api/auth/signin'){
    if(!checkRateLimit(req,'signin',10))return json(res,429,{error:'Too many sign-in attempts. Try again later.'});const body=await readBody(req);try{const session=await authSignIn(String(body.email||'').trim().toLowerCase(),String(body.password||''));const profile=await getProfile(session.user.id);return json(res,200,{user:toPublicUser(session.user,profile)},setSessionHeaders(session))}catch{return json(res,401,{error:'Invalid email or password'})}
  }
  if(req.method==='POST'&&url.pathname==='/api/auth/signout'){const cookies=parseCookies(req);if(cookies[ACCESS_COOKIE])await authSignOut(cookies[ACCESS_COOKIE]);return json(res,200,{ok:true},{'set-cookie':clearCookies()})}

  if(req.method==='POST'&&url.pathname==='/api/quote'){const body=await readBody(req);const ids=Array.isArray(body.sectors)?body.sectors:[];try{return json(res,200,quoteSectors(ids,new Set(await listUnavailableSectorIds())))}catch(err){return json(res,400,{error:err.message})}}

  if(req.method==='POST'&&url.pathname==='/api/claims'){
    const auth=await sessionUser(req,res);if(!auth)return json(res,401,{error:'Sign in required'});const body=await readBody(req);const sectors=Array.isArray(body.sectors)?body.sectors:[];const brand=String(body.brand||'').trim().slice(0,64);const tagline=String(body.tagline||'').trim().slice(0,140);if(!brand)return json(res,400,{error:'Brand name is required'});let claimUrl='';try{claimUrl=normalizeUrl(body.url)}catch(err){return json(res,400,{error:err.message})}
    let reservationId;try{const quote=quoteSectors(sectors,new Set(await listUnavailableSectorIds()));if(!quote.count)return json(res,409,{error:'Select at least one available sector'});if(quote.unavailable.length)return json(res,409,{error:'One or more selected sectors were just claimed or reserved'});reservationId=await reserveSectors({userId:auth.user.id,brand,tagline,url:claimUrl,sectors:quote.lines.map(x=>x.id),amountCents:quote.total*100});const checkout=await createCheckoutSession({reservationId,amountCents:quote.total*100,sectorCount:quote.count,brand});await attachCheckoutSession({reservationId,sessionId:checkout.id,userId:auth.user.id});return json(res,201,{reservation:{id:reservationId,sectors:quote.lines.map(x=>x.id),amount:quote.total,currency:'USD'},payment:{mode:'stripe',status:'requires_action',url:checkout.url,sessionId:checkout.id}})}catch(err){if(reservationId)await releaseReservation(reservationId).catch(()=>{});return json(res,409,{error:err.message})}
  }

  if(req.method==='POST'&&(url.pathname==='/api/events/view'||url.pathname==='/api/events/click')){const body=await readBody(req);const claimId=String(body.claimId||'');const claims=claimStats(await listClaims()).claims;if(!claims.some(c=>c.id===claimId))return json(res,404,{error:'Claim not found'});const kind=url.pathname.endsWith('/click')?'click':'view';const fp=crypto.createHash('sha256').update(`${clientIp(req)}|${req.headers['user-agent']||''}`).digest('hex').slice(0,32);await insertEvent({claimId,kind,fingerprint:fp});return json(res,201,{ok:true})}

  if(req.method==='POST'&&url.pathname==='/api/admin/moderate'){const auth=await sessionUser(req,res);if(!auth||!adminAllowed(auth.user.email))return json(res,403,{error:'Admin access required'});const body=await readBody(req);if(!['active','hidden','refunded'].includes(body.status))return json(res,400,{error:'Invalid moderation status'});await updateModeration({claimId:String(body.claimId||''),status:body.status,note:String(body.note||'').slice(0,500),actor:auth.user.email});return json(res,200,{ok:true})}

  return json(res,404,{error:'Not found'});
}
