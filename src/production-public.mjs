import crypto from 'node:crypto';
import { LANDMARKS, quoteSectors } from './pricing.mjs';
import { launchPlan } from './celestial-market.mjs';
import { getMldMarketSummary, insertEvent, listClaims, listMoonIndexHistory, listRecentMldActivity, listRegistryBodyMarketSummaries, listRegistryPositionsForOwner, listUnavailableSectorIds, recordMldLotEvent } from './supabase.mjs';
import { boardFromClaims, claimStats, clientIp, json, readBody, sessionUser } from './production-common.mjs';

export async function handlePublicApi(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/health') {
    return json(res, 200, { ok: true, service: 'atlas259', mode: 'production', time: new Date().toISOString() });
  }

  if (req.method === 'GET' && url.pathname === '/api/celestial-bodies') {
    const summaries=await listRegistryBodyMarketSummaries().catch(()=>[]);
    const byBody=new Map((summaries||[]).map(row=>[row.body_id,row]));
    return json(res,200,{
      version:2,
      currentBody:'moon',
      bodies:launchPlan().map(body=>{
        const market=byBody.get(body.id);
        return {
          ...body,
          market:{
            ownedPositions:Number(market?.owned_positions||0),
            grossMarketVolumeCents:Number(market?.gross_market_volume_cents||0),
            platformRevenueCents:Number(market?.platform_revenue_cents||0),
            transactionCount:Number(market?.transaction_count||0),
          }
        };
      }),
      disclaimer:'Registry placements are digital/commemorative positions and do not convey legal title to celestial territory or resources.'
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/bootstrap') {
    const [rows, auth, marketSummary] = await Promise.all([
      listClaims(),
      sessionUser(req, res),
      getMldMarketSummary().catch(() => null),
    ]);
    const s = claimStats(rows);
    return json(res, 200, {
      user: auth?.public || null,
      stats: {
        offices: s.offices,
        index: marketSummary ? Number(marketSummary.moon_index) : s.index,
        onBoard: s.onBoard,
        views: s.views,
        clickThroughs: s.clickThroughs,
        claimedSectors: s.claimedSectors,
      },
      claims: s.claims,
      landmarks: LANDMARKS,
      paymentsMode: 'stripe',
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/activity') {
    const limit=Math.max(1,Math.min(100,Number(url.searchParams.get('limit'))||30));
    return json(res,200,{activity:await listRecentMldActivity(limit)});
  }

  if (req.method === 'GET' && url.pathname === '/api/index-history') {
    const limit=Math.max(1,Math.min(500,Number(url.searchParams.get('limit'))||120));
    return json(res,200,{
      body:'moon',
      formulaVersion:'moon-index-v1',
      points:await listMoonIndexHistory(limit),
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/board') {
    const s = claimStats(await listClaims());
    return json(res, 200, { board: boardFromClaims(s.claims) });
  }

  if (req.method === 'GET' && url.pathname === '/api/explore') {
    const q = String(url.searchParams.get('q') || '').trim().toLowerCase();
    const s = claimStats(await listClaims());
    return json(res, 200, {
      landmarks: LANDMARKS.filter((x) => !q || `${x.name} ${x.subtitle}`.toLowerCase().includes(q)),
      brands: s.claims.filter((x) => !q || `${x.brand} ${x.tagline}`.toLowerCase().includes(q)),
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/my-land') {
    const auth=await sessionUser(req,res);
    if(!auth)return json(res,401,{error:'Sign in required'});
    const s=claimStats(await listClaims());
    const claims=s.claims.filter((c)=>c.userId===auth.user.id);
    const positions=await listRegistryPositionsForOwner(auth.user.id).catch(()=>[]);
    return json(res,200,{claims,positions});
  }

  if (req.method === 'GET' && url.pathname === '/api/portfolio') {
    const auth=await sessionUser(req,res);
    if(!auth)return json(res,401,{error:'Sign in required'});
    const requestedBody=String(url.searchParams.get('body')||'').trim().toLowerCase();
    const positions=await listRegistryPositionsForOwner(auth.user.id,requestedBody);
    const s=claimStats(await listClaims());
    const claims=s.claims.filter((c)=>c.userId===auth.user.id && (!requestedBody || c.bodyId===requestedBody));
    const grouped={};
    for(const body of launchPlan()){
      const bodyPositions=positions.filter((p)=>p.body_id===body.id);
      const bodyClaims=claims.filter((claim)=>claim.bodyId===body.id);
      if(bodyPositions.length||bodyClaims.length){
        grouped[body.id]={
          bodyId:body.id,
          bodyName:body.name,
          positions:bodyPositions,
          claims:bodyClaims,
          positionCount:bodyPositions.length,
        };
      }
    }
    return json(res,200,{requestedBody:requestedBody||null,worlds:grouped});
  }

  if (req.method === 'POST' && url.pathname === '/api/quote') {
    const body = await readBody(req);
    const ids = Array.isArray(body.sectors) ? body.sectors : [];
    try {
      return json(res, 200, quoteSectors(ids, new Set(await listUnavailableSectorIds())));
    } catch (err) {
      return json(res, 400, { error: err.message });
    }
  }

  if (req.method === 'POST' && (url.pathname === '/api/events/view' || url.pathname === '/api/events/click')) {
    const body = await readBody(req);
    const claimId = String(body.claimId || '');
    const lotId = String(body.lotId || '').toUpperCase();
    const claims = claimStats(await listClaims()).claims;
    const claim = claims.find((c) => c.id === claimId);
    if (!claim) return json(res, 404, { error: 'Claim not found' });
    if (lotId && !claim.sectors.includes(lotId)) return json(res, 400, { error: 'Registry position does not belong to claim' });
    const kind = url.pathname.endsWith('/click') ? 'click' : 'view';
    const fingerprint = crypto
      .createHash('sha256')
      .update(`${clientIp(req)}|${req.headers['user-agent'] || ''}`)
      .digest('hex')
      .slice(0, 32);
    await Promise.all([
      insertEvent({ claimId, kind, fingerprint }),
      /^MOON-\d{3}-\d{3}$/.test(lotId) ? recordMldLotEvent({ lotId, kind }) : Promise.resolve(false),
    ]);
    return json(res, 201, { ok: true, lotTracked: /^MOON-\d{3}-\d{3}$/.test(lotId) });
  }

  return false;
}
