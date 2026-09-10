import crypto from 'node:crypto';
import { LANDMARKS, quoteSectors } from './pricing.mjs';
import { insertEvent, listClaims, listUnavailableSectorIds } from './supabase.mjs';
import { boardFromClaims, claimStats, clientIp, json, readBody, sessionUser } from './production-common.mjs';

export async function handlePublicApi(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/health') {
    return json(res, 200, { ok: true, service: 'moonstake', mode: 'production', time: new Date().toISOString() });
  }

  if (req.method === 'GET' && url.pathname === '/api/bootstrap') {
    const [rows, auth] = await Promise.all([listClaims(), sessionUser(req, res)]);
    const s = claimStats(rows);
    return json(res, 200, {
      user: auth?.public || null,
      stats: {
        offices: s.offices,
        index: s.index,
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
    const auth = await sessionUser(req, res);
    if (!auth) return json(res, 401, { error: 'Sign in required' });
    const s = claimStats(await listClaims());
    return json(res, 200, { claims: s.claims.filter((c) => c.userId === auth.user.id) });
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
    const claims = claimStats(await listClaims()).claims;
    if (!claims.some((c) => c.id === claimId)) return json(res, 404, { error: 'Claim not found' });
    const kind = url.pathname.endsWith('/click') ? 'click' : 'view';
    const fingerprint = crypto
      .createHash('sha256')
      .update(`${clientIp(req)}|${req.headers['user-agent'] || ''}`)
      .digest('hex')
      .slice(0, 32);
    await insertEvent({ claimId, kind, fingerprint });
    return json(res, 201, { ok: true });
  }

  return false;
}
