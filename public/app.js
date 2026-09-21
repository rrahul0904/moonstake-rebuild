import {
  SEMANTIC_API_VERSION,
  buildSemanticSnapshot,
  clampSemanticZoom,
  parseSectorId,
  searchSemanticEntities
} from './semantic-contract.js';

const canvas = document.querySelector('#moon-canvas');
const ctx = canvas.getContext('2d');
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const GRID = { cols: 720, rows: 360, totalLots: 259200 };
const state = {
  dpr: Math.min(devicePixelRatio || 1, 2),
  zoom: 1,
  panX: 0,
  panY: 0,
  mode: 'move',
  dragging: false,
  dragStart: null,
  selected: new Set(),
  claims: [],
  landmarks: [],
  user: null,
  stats: null,
  quote: { count: 0, total: 0, unavailable: [] },
  hoveredSector: null,
  activeClaim: null,
  authMode: 'signin',
  pendingClaimAfterAuth: false,
  moon: null
};

const api = async (path, options = {}) => {
  const res = await fetch(path, {
    ...options,
    headers: options.body ? { 'content-type': 'application/json', ...(options.headers || {}) } : options.headers
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
};

function seededRandom(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ t >>> 15, 1 | t);
    r ^= r + Math.imul(r ^ r >>> 7, 61 | r);
    return ((r ^ r >>> 14) >>> 0) / 4294967296;
  };
}

function buildMoonTexture() {
  const size = 1200;
  const off = document.createElement('canvas');
  off.width = size; off.height = size;
  const c = off.getContext('2d');
  const g = c.createRadialGradient(size * .39, size * .32, 30, size * .5, size * .5, size * .5);
  g.addColorStop(0, '#f1f0ea'); g.addColorStop(.55, '#b6b5af'); g.addColorStop(.86, '#777772'); g.addColorStop(1, '#242424');
  c.fillStyle = g; c.beginPath(); c.arc(size/2,size/2,size*.49,0,Math.PI*2); c.fill();

  const rand = seededRandom(19690720);
  c.save(); c.beginPath(); c.arc(size/2,size/2,size*.487,0,Math.PI*2); c.clip();
  for (let i=0;i<520;i++) {
    const angle = rand()*Math.PI*2;
    const radius = Math.sqrt(rand())*size*.475;
    const x = size/2 + Math.cos(angle)*radius;
    const y = size/2 + Math.sin(angle)*radius;
    const r = 2 + Math.pow(rand(),3)*58;
    const alpha = .025 + rand()*.11;
    c.beginPath(); c.arc(x,y,r,0,Math.PI*2); c.fillStyle = `rgba(20,20,20,${alpha})`; c.fill();
    c.beginPath(); c.arc(x-r*.12,y-r*.16,r*.78,0,Math.PI*2); c.strokeStyle = `rgba(255,255,255,${alpha*.7})`; c.lineWidth=Math.max(1,r*.08); c.stroke();
  }
  const maria = [
    [.37,.39,.20,.13,-.25],[.56,.39,.22,.14,.18],[.62,.54,.18,.11,-.25],[.43,.56,.15,.12,.3],[.30,.53,.10,.08,.3]
  ];
  for (const [x,y,rx,ry,rot] of maria) {
    c.save(); c.translate(size*x,size*y); c.rotate(rot); c.scale(rx,ry); c.beginPath(); c.arc(0,0,size,0,Math.PI*2); c.restore();
    c.fillStyle='rgba(30,30,30,.18)'; c.fill();
  }
  c.restore();
  state.moon = off;
  const texture = new Image();
  texture.decoding = 'async';
  texture.onload = () => { state.moon = texture; draw(); };
  texture.onerror = () => { /* procedural fallback is already active */ };
  texture.src = '/moon-texture.png';
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.floor(rect.width * state.dpr);
  canvas.height = Math.floor(rect.height * state.dpr);
  ctx.setTransform(state.dpr,0,0,state.dpr,0,0);
  draw();
}

function moonGeometry() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const base = Math.min(w * .88, h * 1.08);
  const size = base * state.zoom;
  return { cx: w/2 + state.panX, cy: h/2 + state.panY + 20, size, r:size/2 };
}

function sectorRect(x,y) {
  const m = moonGeometry();
  const left = m.cx - m.r, top = m.cy - m.r;
  return { x: left + (x/GRID.cols)*m.size, y: top + (y/GRID.rows)*m.size, w:m.size/GRID.cols, h:m.size/GRID.rows };
}

function screenToSector(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const x = clientX - rect.left, y = clientY - rect.top;
  const m = moonGeometry();
  if (Math.hypot(x-m.cx,y-m.cy) > m.r) return null;
  const gx = Math.floor(((x-(m.cx-m.r))/m.size)*GRID.cols);
  const gy = Math.floor(((y-(m.cy-m.r))/m.size)*GRID.rows);
  if (gx<0||gy<0||gx>=GRID.cols||gy>=GRID.rows) return null;
  return { x:gx, y:gy, id:`MOON-${String(gx).padStart(3,'0')}-${String(gy).padStart(3,'0')}` };
}

function displayCoords(id){
  const value=String(id||'').toUpperCase();
  let match=/^MOON-(\d{3})-(\d{3})$/.exec(value);
  if(match)return {x:Number(match[1]),y:Number(match[2]),kind:'moon-lot'};
  match=/^S-(\d{2})-(\d{2})$/.exec(value);
  if(match){
    const legacyX=Number(match[1]),legacyY=Number(match[2]);
    return {
      x:Math.min(GRID.cols-1,Math.floor(((legacyX+.5)/64)*GRID.cols)),
      y:Math.min(GRID.rows-1,Math.floor(((legacyY+.5)/32)*GRID.rows)),
      kind:'legacy-sector'
    };
  }
  return null;
}

function sectorClaim(id) { return state.claims.find(c => c.sectors.includes(id)); }

function draw() {
  const w=canvas.clientWidth,h=canvas.clientHeight;
  ctx.clearRect(0,0,w,h);
  const bg=ctx.createRadialGradient(w*.5,h*.48,0,w*.5,h*.48,Math.max(w,h)*.72);
  bg.addColorStop(0,'#171717');bg.addColorStop(.55,'#090909');bg.addColorStop(1,'#030303');ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
  const m=moonGeometry();
  if (state.moon) ctx.drawImage(state.moon,m.cx-m.r,m.cy-m.r,m.size,m.size);

  ctx.save(); ctx.beginPath();ctx.arc(m.cx,m.cy,m.r,0,Math.PI*2);ctx.clip();
  if (state.zoom >= 2.15) {
    const left=m.cx-m.r,top=m.cy-m.r,cellW=m.size/GRID.cols,cellH=m.size/GRID.rows;
    const minX=Math.max(0,Math.floor((0-left)/cellW)-1),maxX=Math.min(GRID.cols,Math.ceil((w-left)/cellW)+1);
    const minY=Math.max(0,Math.floor((0-top)/cellH)-1),maxY=Math.min(GRID.rows,Math.ceil((h-top)/cellH)+1);
    const step=state.zoom>=4.6?1:state.zoom>=3.2?2:5;
    ctx.strokeStyle = state.zoom >= 4.6 ? 'rgba(255,255,255,.13)' : 'rgba(255,255,255,.075)';
    ctx.lineWidth=1;
    for(let x=Math.ceil(minX/step)*step;x<=maxX;x+=step){const px=left+x*cellW;ctx.beginPath();ctx.moveTo(px,m.cy-m.r);ctx.lineTo(px,m.cy+m.r);ctx.stroke()}
    for(let y=Math.ceil(minY/step)*step;y<=maxY;y+=step){const py=top+y*cellH;ctx.beginPath();ctx.moveTo(m.cx-m.r,py);ctx.lineTo(m.cx+m.r,py);ctx.stroke()}
  }
  for (const claim of state.claims) {
    for (const id of claim.sectors) {
      const pos=displayCoords(id);if(!pos)continue;const r=sectorRect(pos.x,pos.y);
      ctx.fillStyle='rgba(7,7,7,.44)';ctx.fillRect(r.x+.5,r.y+.5,Math.max(1,r.w-1),Math.max(1,r.h-1));
      ctx.strokeStyle='rgba(255,255,255,.72)';ctx.lineWidth=Math.max(1,Math.min(2,state.zoom*.8));ctx.strokeRect(r.x+1,r.y+1,Math.max(0,r.w-2),Math.max(0,r.h-2));
    }
  }
  for (const id of state.selected) {
    const pos=displayCoords(id);if(!pos)continue;const r=sectorRect(pos.x,pos.y);
    ctx.fillStyle='rgba(216,255,132,.32)';ctx.fillRect(r.x,r.y,r.w,r.h);ctx.strokeStyle='#d7ff86';ctx.lineWidth=2;ctx.strokeRect(r.x+1,r.y+1,Math.max(0,r.w-2),Math.max(0,r.h-2));
  }
  if(state.hoveredSector && state.zoom>=1.15){const r=sectorRect(state.hoveredSector.x,state.hoveredSector.y);ctx.strokeStyle='rgba(255,255,255,.9)';ctx.lineWidth=1;ctx.strokeRect(r.x+.5,r.y+.5,r.w-1,r.h-1)}
  ctx.restore();

  if (state.zoom >= 1.05) {
    for (const landmark of state.landmarks) {
      const r=sectorRect(landmark.lotX??landmark.x,landmark.lotY??landmark.y);const x=r.x+r.w/2,y=r.y+r.h/2;
      if(Math.hypot(x-m.cx,y-m.cy)>m.r) continue;
      ctx.fillStyle='#f2efe6';ctx.beginPath();ctx.arc(x,y,2.4,0,Math.PI*2);ctx.fill();
      if(state.zoom>1.55){ctx.font='9px ui-monospace,monospace';ctx.fillStyle='rgba(255,255,255,.72)';ctx.fillText(landmark.name,x+7,y+3)}
    }
  }
}

function clampPan() {
  const m=moonGeometry();const max=Math.max(0,m.r*.72);state.panX=Math.max(-max,Math.min(max,state.panX));state.panY=Math.max(-max,Math.min(max,state.panY));
}

function zoomAt(delta, clientX=canvas.clientWidth/2, clientY=canvas.clientHeight/2) {
  const old=state.zoom;const next=Math.max(.72,Math.min(5.5,old*delta));if(next===old)return;
  const rect=canvas.getBoundingClientRect();const px=clientX-rect.left,py=clientY-rect.top;
  const m=moonGeometry();const wx=(px-m.cx)/old,wy=(py-m.cy)/old;
  state.zoom=next;const nm=moonGeometry();state.panX += (px-(nm.cx+wx*next));state.panY += (py-(nm.cy+wy*next));clampPan();draw();
}

function setMode(mode){state.mode=mode;$('#mode-move').classList.toggle('active',mode==='move');$('#mode-select').classList.toggle('active',mode==='select');canvas.classList.toggle('selecting',mode==='select');$('#map-hint-text').textContent=mode==='select'?'Click registry positions to add or remove them':'Drag to move · click a place to zoom in · scroll to zoom'}

function updateStats(){if(!state.stats)return;const items=[['Offices',state.stats.offices],['Index',state.stats.index],['On the board',state.stats.onBoard],['Views',state.stats.views],['Click-throughs',state.stats.clickThroughs]];$('#desktop-stats').innerHTML=items.map(([label,value])=>`<div class="stat"><span>${Number(value).toLocaleString()}</span><small>${label}</small></div>`).join('')}

async function updateQuote(){
  if(!state.selected.size){state.quote={count:0,total:0,unavailable:[]};renderSelection();return}
  try{state.quote=await api('/api/quote',{method:'POST',body:JSON.stringify({sectors:[...state.selected]})});if(state.quote.unavailable?.length){for(const id of state.quote.unavailable)state.selected.delete(id);draw()}}catch(e){toast(e.message)}renderSelection();
}
function renderSelection(){const q=state.quote;$('#sector-count').textContent=`${state.selected.size} position${state.selected.size===1?'':'s'}`;$('#selection-price').textContent=state.selected.size?`${q.total||0}`:'—';$('#claim-btn').textContent=`Register for ${q.total||0}`;$('#claim-btn').disabled=!state.selected.size||!!q.unavailable?.length}

async function bootstrap(){
  const data=await api('/api/bootstrap');Object.assign(state,{claims:data.claims,landmarks:data.landmarks,user:data.user,stats:data.stats});renderAuthState();updateStats();draw();setTimeout(()=>$('#boot').classList.add('done'),450)
}

function renderAuthState(){const btn=$('#signin-btn');if(state.user){btn.textContent=state.user.brand||'Account';btn.title=state.user.email}else{btn.textContent='Sign in';btn.title=''}}
function showModal(id){$('#modal-backdrop').classList.remove('hidden');$(id).classList.remove('hidden')}
function closeModals(){$('#modal-backdrop').classList.add('hidden');$$('.modal').forEach(m=>m.classList.add('hidden'));$('#auth-error').classList.add('hidden');$('#claim-error').classList.add('hidden')}
function toast(message){const t=$('#toast');t.textContent=message;t.classList.remove('hidden');clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.add('hidden'),2600)}

function setAuthMode(mode){state.authMode=mode;const signup=mode==='signup';$('#auth-signin-tab').classList.toggle('active',!signup);$('#auth-signup-tab').classList.toggle('active',signup);$('#brand-field').classList.toggle('hidden',!signup);$('#auth-title').textContent=signup?'Create your Atlas 259 account':'Sign in to register a position';$('#auth-password').autocomplete=signup?'new-password':'current-password'}
function openAuth(){setAuthMode('signin');showModal('#auth-modal')}
function openClaim(){if(!state.selected.size)return;if(!state.user){state.pendingClaimAfterAuth=true;openAuth();return}$('#claim-brand').value=state.user.brand||'';$('#claim-tagline').value='';$('#claim-url').value='';$('#claim-summary').textContent=`${state.selected.size} registry position${state.selected.size===1?'':'s'} · demo checkout`;$('#claim-total').textContent=`$${state.quote.total}`;showModal('#claim-modal')}

async function refresh(){const data=await api('/api/bootstrap');state.claims=data.claims;state.stats=data.stats;state.user=data.user;updateStats();renderAuthState();draw()}

function positionFlagCard(claim,id){
  state.activeClaim=claim;const first=id||claim.sectors[0];const pos=displayCoords(first);if(!pos)return;const r=sectorRect(pos.x,pos.y);const card=$('#flag-card');
  card.innerHTML=`<button class="flag-close" aria-label="Close">×</button><h3>${escapeHtml(claim.brand)}</h3><p>${escapeHtml(claim.tagline||'A registry marker on the Moon.')}</p><div class="flag-meta"><span>${claim.sectors.length} sector${claim.sectors.length===1?'':'s'}</span><span>${claim.views||0} views · ${claim.clicks||0} clicks</span></div>${claim.url?`<a href="${escapeAttr(claim.url)}" target="_blank" rel="noopener noreferrer">Visit ${escapeHtml(claim.brand)} ↗</a>`:''}`;
  const left=Math.min(canvas.clientWidth-285,Math.max(12,r.x+14));const top=Math.min(canvas.clientHeight-250,Math.max(92,r.y-36));card.style.left=`${left}px`;card.style.top=`${top}px`;card.classList.remove('hidden');card.querySelector('.flag-close').onclick=()=>card.classList.add('hidden');const link=card.querySelector('a');if(link)link.addEventListener('click',()=>api('/api/events/click',{method:'POST',body:JSON.stringify({claimId:claim.id})}).catch(()=>{}));api('/api/events/view',{method:'POST',body:JSON.stringify({claimId:claim.id})}).then(refresh).catch(()=>{});
}

function escapeHtml(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function escapeAttr(v){return escapeHtml(v)}

function focusSector(x,y,targetZoom=2.6){
  state.zoom=targetZoom;const m=moonGeometry();const desiredX=canvas.clientWidth/2,desiredY=canvas.clientHeight/2+30;const r=sectorRect(x,y);state.panX += desiredX-(r.x+r.w/2);state.panY += desiredY-(r.y+r.h/2);clampPan();draw();
}

async function showPanel(tab){
  const panel=$('#side-panel');panel.classList.remove('hidden');$$('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
  if(tab==='board'){ $('#panel-kicker').textContent='THE BOARD';$('#panel-title').textContent='Brands on the Moon';const data=await api('/api/board');$('#panel-content').innerHTML=data.board.length?data.board.map((row,i)=>`<div class="board-row" data-claim="${row.id}"><span class="rank">${String(i+1).padStart(2,'0')}</span><div class="row-copy"><strong>${escapeHtml(row.brand)}</strong><small>${escapeHtml(row.tagline||'No tagline yet')}</small></div><div class="row-metrics">${row.views} <small>views · ${row.clicks} clicks</small></div></div>`).join(''):'<div class="panel-empty">No brands are on the board yet.</div>';$$('[data-claim]').forEach(el=>el.onclick=()=>{const c=state.claims.find(x=>x.id===el.dataset.claim);if(c){const pos=displayCoords(c.sectors[0]);if(pos){focusSector(pos.x,pos.y);positionFlagCard(c);}}})}
  if(tab==='explore'){ $('#panel-kicker').textContent='EXPLORE';$('#panel-title').textContent='Landmarks & flags';const data=await api('/api/explore');$('#panel-content').innerHTML=`<div class="panel-section">${data.landmarks.map(l=>`<div class="land-row" data-landmark="${l.id}"><span class="rank">◎</span><div class="row-copy"><strong>${escapeHtml(l.name)}</strong><small>${escapeHtml(l.subtitle)}</small></div><div class="row-metrics">${l.lat.toFixed(1)}°<small>${l.lon.toFixed(1)}°</small></div></div>`).join('')}</div>`;$$('[data-landmark]').forEach(el=>el.onclick=()=>{const l=state.landmarks.find(x=>x.id===el.dataset.landmark);if(l){focusSector(l.x,l.y,3.2);panel.classList.add('hidden');setTabActive('plot')}})}
  if(tab==='land'){ $('#panel-kicker').textContent='MY LAND';$('#panel-title').textContent=state.user?state.user.brand:'Your place on the Moon';if(!state.user){$('#panel-content').innerHTML='<div class="panel-empty">Sign in to see every sector you own, plus views and click-throughs.<div class="panel-cta"><button id="panel-signin" class="claim-btn">Sign in</button></div></div>';$('#panel-signin').onclick=openAuth;return}try{const data=await api('/api/my-land');$('#panel-content').innerHTML=data.claims.length?data.claims.map(c=>`<div class="mine-row" data-mine="${c.id}"><span class="rank">⚑</span><div class="row-copy"><strong>${escapeHtml(c.brand)}</strong><small>${c.sectors.length} sectors · $${c.amount} claimed</small></div><div class="row-metrics">${c.views||0}<small>views · ${c.clicks||0} clicks</small></div></div>`).join(''):'<div class="panel-empty">You have not claimed land yet. Close this panel, select some sectors, and plant your first flag.</div>';$$('[data-mine]').forEach(el=>el.onclick=()=>{const c=state.claims.find(x=>x.id===el.dataset.mine);if(c){const [,x,y]=c.sectors[0].split('-');focusSector(+x,+y);positionFlagCard(c)}})}catch(e){$('#panel-content').innerHTML=`<div class="panel-empty">${escapeHtml(e.message)}</div>`}}
}
function setTabActive(tab){$$('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab))}

canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);state.dragging=true;state.dragStart={x:e.clientX,y:e.clientY,panX:state.panX,panY:state.panY};canvas.classList.add('dragging')});
canvas.addEventListener('pointermove',e=>{const sector=screenToSector(e.clientX,e.clientY);state.hoveredSector=sector;if(sector){const claim=sectorClaim(sector.id);$('#tooltip').textContent=claim?`${sector.id} · ${claim.brand}`:`${sector.id} · available`;$('#tooltip').style.left=`${e.clientX+12}px`;$('#tooltip').style.top=`${e.clientY+12}px`;$('#tooltip').classList.remove('hidden')}else $('#tooltip').classList.add('hidden');if(state.dragging&&state.mode==='move'){state.panX=state.dragStart.panX+(e.clientX-state.dragStart.x);state.panY=state.dragStart.panY+(e.clientY-state.dragStart.y);clampPan()}draw()});
canvas.addEventListener('pointerup',async e=>{const moved=Math.hypot(e.clientX-state.dragStart.x,e.clientY-state.dragStart.y);state.dragging=false;canvas.classList.remove('dragging');if(moved>5)return;const sector=screenToSector(e.clientX,e.clientY);if(!sector)return;if(state.mode==='move'){const claim=sectorClaim(sector.id);if(claim)positionFlagCard(claim,sector.id);else zoomAt(1.45,e.clientX,e.clientY)}else{const claim=sectorClaim(sector.id);if(claim){positionFlagCard(claim,sector.id);toast('That sector is already claimed');return}if(state.selected.has(sector.id))state.selected.delete(sector.id);else state.selected.add(sector.id);draw();await updateQuote()}});
canvas.addEventListener('pointerleave',()=>{$('#tooltip').classList.add('hidden');state.hoveredSector=null;draw()});
canvas.addEventListener('wheel',e=>{e.preventDefault();zoomAt(e.deltaY<0?1.13:.885,e.clientX,e.clientY)},{passive:false});

$('#mode-move').onclick=()=>setMode('move');$('#mode-select').onclick=()=>setMode('select');$('#zoom-in').onclick=()=>zoomAt(1.28);$('#zoom-out').onclick=()=>zoomAt(.78);$('#whole-moon').onclick=()=>{state.zoom=1;state.panX=0;state.panY=0;draw()};$('#buy-lots').onclick=()=>{setMode('select');if(state.zoom<1.45)zoomAt(1.6)};$('#clear-selection').onclick=()=>{state.selected.clear();state.quote={count:0,total:0,unavailable:[]};renderSelection();draw()};$('#claim-btn').onclick=openClaim;$('#how-btn').onclick=()=>showModal('#how-modal');$('#signin-btn').onclick=async()=>{if(!state.user)return openAuth();const panel=$('#side-panel');if(panel.classList.contains('hidden'))showPanel('land');else{await api('/api/auth/signout',{method:'POST'});await refresh();toast('Signed out')}};$('#modal-backdrop').onclick=closeModals;$$('[data-close-modal]').forEach(b=>b.onclick=closeModals);$('#auth-signin-tab').onclick=()=>setAuthMode('signin');$('#auth-signup-tab').onclick=()=>setAuthMode('signup');$('#panel-close').onclick=()=>{$('#side-panel').classList.add('hidden');setTabActive('plot')};$$('.tab').forEach(b=>b.onclick=()=>{if(b.dataset.tab==='plot'){$('#side-panel').classList.add('hidden');setTabActive('plot')}else showPanel(b.dataset.tab)});

$('#auth-form').addEventListener('submit',async e=>{e.preventDefault();const error=$('#auth-error');error.classList.add('hidden');const body={email:$('#auth-email').value,password:$('#auth-password').value,brand:$('#auth-brand').value};try{const data=await api(state.authMode==='signup'?'/api/auth/signup':'/api/auth/signin',{method:'POST',body:JSON.stringify(body)});state.user=data.user;renderAuthState();closeModals();toast(`Welcome ${state.user.brand}`);if(state.pendingClaimAfterAuth){state.pendingClaimAfterAuth=false;setTimeout(openClaim,150)}}catch(err){error.textContent=err.message;error.classList.remove('hidden')}});

$('#claim-form').addEventListener('submit',async e=>{e.preventDefault();const error=$('#claim-error');error.classList.add('hidden');try{const data=await api('/api/claims',{method:'POST',body:JSON.stringify({brand:$('#claim-brand').value,tagline:$('#claim-tagline').value,url:$('#claim-url').value,sectors:[...state.selected]})});closeModals();state.selected.clear();state.quote={count:0,total:0,unavailable:[]};renderSelection();await refresh();const claim=state.claims.find(c=>c.id===data.claim.id)||data.claim;positionFlagCard(claim);toast('Registry position added on the Moon')}catch(err){error.textContent=err.message;error.classList.remove('hidden')}});

const search=$('#search');search.addEventListener('input',()=>{const q=search.value.trim().toLowerCase();const box=$('#search-results');if(!q){box.classList.add('hidden');return}const landmarks=state.landmarks.filter(l=>`${l.name} ${l.subtitle}`.toLowerCase().includes(q)).slice(0,5);const brands=state.claims.filter(c=>`${c.brand} ${c.tagline}`.toLowerCase().includes(q)).slice(0,5);const rows=[...landmarks.map(l=>({kind:'landmark',id:l.id,title:l.name,sub:l.subtitle})),...brands.map(c=>({kind:'claim',id:c.id,title:c.brand,sub:c.tagline||'Brand flag'}))];box.innerHTML=rows.length?rows.map(r=>`<button class="search-result" data-kind="${r.kind}" data-id="${r.id}"><span>${escapeHtml(r.title)}</span><small>${escapeHtml(r.sub)}</small></button>`).join(''):'<button class="search-result" disabled><span>No results</span><small>Try Tycho or Apollo 11</small></button>';box.classList.remove('hidden');$$('.search-result[data-id]').forEach(btn=>btn.onclick=()=>{box.classList.add('hidden');search.value=btn.querySelector('span').textContent;if(btn.dataset.kind==='landmark'){const l=state.landmarks.find(x=>x.id===btn.dataset.id);focusSector(l.lotX??l.x,l.lotY??l.y,3.3)}else{const c=state.claims.find(x=>x.id===btn.dataset.id);const pos=displayCoords(c.sectors[0]);if(pos){focusSector(pos.x,pos.y,3);positionFlagCard(c)}}})});document.addEventListener('click',e=>{if(!e.target.closest('.search-wrap'))$('#search-results').classList.add('hidden')});

function semanticSnapshot(){
  return buildSemanticSnapshot({
    zoom: state.zoom,
    panX: state.panX,
    panY: state.panY,
    mode: state.mode,
    selected: state.selected,
    quote: state.quote,
    stats: state.stats,
    activeClaim: state.activeClaim,
    user: state.user
  });
}

function semanticSearch(query){
  return searchSemanticEntities(query,{landmarks:state.landmarks,claims:state.claims});
}

function semanticFocus(target){
  const value=String(target||'').trim();
  if(!value)throw new Error('Provide a landmark, brand, claim id, or sector id');
  if(/^(?:MOON-\d{3}-\d{3}|S-\d{2}-\d{2})$/i.test(value)){
    const sector=parseSectorId(value,GRID);
    focusSector(sector.x,sector.y,Math.max(state.zoom,2.6));
    return semanticSnapshot();
  }
  const normalized=value.toLowerCase();
  const directClaim=state.claims.find(c=>c.id===value);
  const match=directClaim
    ? {kind:'claim',id:directClaim.id}
    : semanticSearch(value).find(item=>String(item.title||'').toLowerCase()===normalized)||semanticSearch(value)[0];
  if(!match)throw new Error(`No Moonstake result found for "${value}"`);
  if(match.kind==='landmark'){
    const landmark=state.landmarks.find(item=>item.id===match.id);
    focusSector(landmark.lotX??landmark.x,landmark.lotY??landmark.y,3.3);
  }else{
    const claim=state.claims.find(item=>item.id===match.id);
    if(!claim)throw new Error('Claim is no longer available');
    const pos=displayCoords(claim.sectors[0]);if(!pos)throw new Error('Claim position is invalid');
    focusSector(pos.x,pos.y,3);
    positionFlagCard(claim);
  }
  return semanticSnapshot();
}

function semanticZoomTo(value){
  state.zoom=clampSemanticZoom(value);
  clampPan();
  draw();
  return semanticSnapshot();
}

async function semanticSelectSector(id,{append=true}={}){
  const sector=parseSectorId(id,GRID);
  const claim=sectorClaim(sector.id);
  if(claim)throw new Error(`${sector.id} is already claimed by ${claim.brand}`);
  setMode('select');
  if(!append)state.selected.clear();
  state.selected.add(sector.id);
  focusSector(sector.x,sector.y,Math.max(state.zoom,2.6));
  draw();
  await updateQuote();
  return semanticSnapshot();
}

function semanticClearSelection(){
  state.selected.clear();
  state.quote={count:0,total:0,unavailable:[]};
  renderSelection();
  draw();
  return semanticSnapshot();
}

function semanticResetView(){
  state.zoom=1;
  state.panX=0;
  state.panY=0;
  setMode('move');
  draw();
  return semanticSnapshot();
}

const semanticApi=Object.freeze({
  version:SEMANTIC_API_VERSION,
  snapshot:semanticSnapshot,
  search:semanticSearch,
  focus:semanticFocus,
  zoomTo:semanticZoomTo,
  selectSector:semanticSelectSector,
  clearSelection:semanticClearSelection,
  resetView:semanticResetView
});
window.atlas259Semantic=semanticApi;
window.moonstakeSemantic=semanticApi; // temporary backwards-compatible donor alias

document.dispatchEvent(new CustomEvent('atlas259:semantic-ready',{detail:{version:SEMANTIC_API_VERSION}}));
document.dispatchEvent(new CustomEvent('moonstake:semantic-ready',{detail:{version:SEMANTIC_API_VERSION,deprecated:true}}));

buildMoonTexture();addEventListener('resize',resize);resize();renderSelection();bootstrap().catch(err=>{console.error(err);$('#boot').innerHTML=`<strong>ATLAS 259</strong><span>Could not open the Moon registry.</span><button class="ghost-btn" onclick="location.reload()">Try again</button>`});
