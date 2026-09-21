import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readDb, mutateDb } from './store.mjs';
import { LANDMARKS, quoteSectors } from './pricing.mjs';
import { launchPlan } from './celestial-market.mjs';
import { moonIndexFromGmvCents } from './market-model.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(here, '../public');
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '127.0.0.1';
const SESSION_COOKIE = 'ms_session';

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function json(res, status, body, headers = {}) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers
  });
  res.end(JSON.stringify(body));
}

function securityHeaders() {
  return {
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()'
  };
}

function parseCookies(req) {
  const result = {};
  for (const pair of String(req.headers.cookie || '').split(';')) {
    const idx = pair.indexOf('=');
    if (idx > 0) result[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
  }
  return result;
}

function publicUser(user) {
  if (!user) return null;
  return { id: user.id, email: user.email, brand: user.brand, createdAt: user.createdAt };
}

function currentUser(req, db = readDb()) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return null;
  const session = db.sessions.find((s) => s.token === token && Date.parse(s.expiresAt) > Date.now());
  if (!session) return null;
  return db.users.find((u) => u.id === session.userId) || null;
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1_000_000) throw new Error('Body too large');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString('utf8');
  return JSON.parse(raw);
}

function normalizeUrl(input) {
  if (!input) return '';
  const value = String(input).trim();
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  const url = new URL(candidate);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only http(s) URLs are allowed');
  return url.toString();
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const digest = crypto.pbkdf2Sync(password, salt, 160_000, 32, 'sha256').toString('hex');
  return { salt, digest };
}

function verifyPassword(password, user) {
  const { digest } = hashPassword(password, user.passwordSalt);
  const a = Buffer.from(digest, 'hex');
  const b = Buffer.from(user.passwordHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function stats(db) {
  const claimEventCounts = new Map();
  for (const event of db.events) {
    const row = claimEventCounts.get(event.claimId) || { views: 0, clicks: 0 };
    if (event.type === 'view') row.views++;
    if (event.type === 'click') row.clicks++;
    claimEventCounts.set(event.claimId, row);
  }
  const claimedSectors = db.claims.reduce((sum, claim) => sum + claim.sectors.length, 0);
  const gmvCents = db.claims.reduce((sum, claim) => sum + Math.round(Number(claim.amount || 0) * 100), 0);
  return {
    offices: db.claims.length,
    index: moonIndexFromGmvCents(gmvCents),
    onBoard: db.claims.length,
    views: db.events.filter((e) => e.type === 'view').length,
    clickThroughs: db.events.filter((e) => e.type === 'click').length,
    claimedSectors,
    claims: db.claims.map((claim) => ({ ...claim, ...(claimEventCounts.get(claim.id) || { views: 0, clicks: 0 }) }))
  };
}

function board(db) {
  return stats(db).claims
    .map((claim) => ({
      id: claim.id,
      brand: claim.brand,
      tagline: claim.tagline,
      url: claim.url,
      sectors: claim.sectors.length,
      views: claim.views,
      clicks: claim.clicks,
      ctr: claim.views ? claim.clicks / claim.views : 0,
      createdAt: claim.createdAt
    }))
    .sort((a, b) => (b.views + b.clicks * 3 + b.sectors * 2) - (a.views + a.clicks * 3 + a.sectors * 2));
}

function createSession(db, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.sessions.push({
    token,
    userId,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  });
  return token;
}

function sessionHeader(token) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`;
}

function clearSessionHeader() {
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

async function handleApi(req, res, url) {
  const db = readDb();
  if (req.method === 'GET' && url.pathname === '/api/celestial-bodies') {
    return json(res, 200, {
      version: 1,
      currentBody: 'moon',
      bodies: launchPlan(),
      disclaimer: 'Registry placements are digital/commemorative positions and do not convey legal title to celestial territory or resources.'
    }, securityHeaders());
  }

  if (req.method === 'GET' && url.pathname === '/api/bootstrap') {
    const s = stats(db);
    return json(res, 200, {
      user: publicUser(currentUser(req, db)),
      stats: { offices: s.offices, index: s.index, onBoard: s.onBoard, views: s.views, clickThroughs: s.clickThroughs, claimedSectors: s.claimedSectors },
      claims: s.claims,
      landmarks: LANDMARKS,
      paymentsMode: process.env.PAYMENTS_MODE || 'demo'
    }, securityHeaders());
  }

  if (req.method === 'GET' && url.pathname === '/api/board') {
    return json(res, 200, { board: board(db) }, securityHeaders());
  }

  if (req.method === 'GET' && url.pathname === '/api/explore') {
    const q = String(url.searchParams.get('q') || '').trim().toLowerCase();
    const landmarks = LANDMARKS.filter((item) => !q || `${item.name} ${item.subtitle}`.toLowerCase().includes(q));
    const brands = stats(db).claims.filter((item) => !q || `${item.brand} ${item.tagline}`.toLowerCase().includes(q));
    return json(res, 200, { landmarks, brands }, securityHeaders());
  }

  if (req.method === 'GET' && url.pathname === '/api/my-land') {
    const user = currentUser(req, db);
    if (!user) return json(res, 401, { error: 'Sign in required' }, securityHeaders());
    const mine = stats(db).claims.filter((claim) => claim.userId === user.id);
    return json(res, 200, { claims: mine }, securityHeaders());
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/signup') {
    const body = await readBody(req);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const brand = String(body.brand || '').trim().slice(0, 64);
    if (!/^\S+@\S+\.\S+$/.test(email)) return json(res, 400, { error: 'Enter a valid email' }, securityHeaders());
    if (password.length < 8) return json(res, 400, { error: 'Password must be at least 8 characters' }, securityHeaders());
    if (!brand) return json(res, 400, { error: 'Brand name is required' }, securityHeaders());
    let payload;
    let token;
    try {
      payload = mutateDb((mutable) => {
        if (mutable.users.some((u) => u.email === email)) throw new Error('An account already exists for that email');
        const id = `usr_${crypto.randomUUID()}`;
        const hashed = hashPassword(password);
        const user = { id, email, brand, passwordSalt: hashed.salt, passwordHash: hashed.digest, createdAt: new Date().toISOString() };
        mutable.users.push(user);
        token = createSession(mutable, id);
        return publicUser(user);
      });
    } catch (err) {
      return json(res, 409, { error: err.message }, securityHeaders());
    }
    return json(res, 201, { user: payload }, { ...securityHeaders(), 'set-cookie': sessionHeader(token) });
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/signin') {
    const body = await readBody(req);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const user = db.users.find((u) => u.email === email);
    if (!user || !verifyPassword(password, user)) return json(res, 401, { error: 'Invalid email or password' }, securityHeaders());
    let token;
    mutateDb((mutable) => { token = createSession(mutable, user.id); });
    return json(res, 200, { user: publicUser(user) }, { ...securityHeaders(), 'set-cookie': sessionHeader(token) });
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/signout') {
    const token = parseCookies(req)[SESSION_COOKIE];
    if (token) mutateDb((mutable) => { mutable.sessions = mutable.sessions.filter((s) => s.token !== token); });
    return json(res, 200, { ok: true }, { ...securityHeaders(), 'set-cookie': clearSessionHeader() });
  }

  if (req.method === 'POST' && url.pathname === '/api/quote') {
    const body = await readBody(req);
    const ids = Array.isArray(body.sectors) ? body.sectors : [];
    const claimed = new Set(db.claims.flatMap((claim) => claim.sectors));
    try {
      return json(res, 200, quoteSectors(ids, claimed), securityHeaders());
    } catch (err) {
      return json(res, 400, { error: err.message }, securityHeaders());
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/claims') {
    const user = currentUser(req, db);
    if (!user) return json(res, 401, { error: 'Sign in required' }, securityHeaders());
    const body = await readBody(req);
    const sectors = Array.isArray(body.sectors) ? body.sectors : [];
    const brand = String(body.brand || '').trim().slice(0, 64);
    const tagline = String(body.tagline || '').trim().slice(0, 140);
    if (!brand) return json(res, 400, { error: 'Brand name is required' }, securityHeaders());
    let claimUrl = '';
    try { claimUrl = normalizeUrl(body.url); } catch (err) { return json(res, 400, { error: err.message }, securityHeaders()); }
    try {
      const claim = mutateDb((mutable) => {
        const claimed = new Set(mutable.claims.flatMap((item) => item.sectors));
        const quote = quoteSectors(sectors, claimed);
        if (!quote.count) throw new Error('Select at least one available sector');
        if (quote.unavailable.length) throw new Error('One or more selected sectors were just claimed');
        const created = {
          id: `claim_${crypto.randomUUID()}`,
          userId: user.id,
          brand,
          tagline,
          url: claimUrl,
          sectors: quote.lines.map((line) => line.id),
          amount: quote.total,
          currency: quote.currency,
          paymentMode: process.env.PAYMENTS_MODE || 'demo',
          createdAt: new Date().toISOString()
        };
        mutable.claims.push(created);
        return created;
      });
      return json(res, 201, { claim, payment: { mode: process.env.PAYMENTS_MODE || 'demo', status: 'succeeded' } }, securityHeaders());
    } catch (err) {
      return json(res, 409, { error: err.message }, securityHeaders());
    }
  }

  if (req.method === 'POST' && (url.pathname === '/api/events/view' || url.pathname === '/api/events/click')) {
    const body = await readBody(req);
    const claimId = String(body.claimId || '');
    const claim = db.claims.find((c) => c.id === claimId);
    if (!claim) return json(res, 404, { error: 'Claim not found' }, securityHeaders());
    const type = url.pathname.endsWith('/click') ? 'click' : 'view';
    mutateDb((mutable) => mutable.events.push({ id: `evt_${crypto.randomUUID()}`, type, claimId, createdAt: new Date().toISOString() }));
    return json(res, 201, { ok: true }, securityHeaders());
  }

  return json(res, 404, { error: 'Not found' }, securityHeaders());
}

function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  const candidate = path.resolve(publicDir, `.${pathname}`);
  if (!candidate.startsWith(publicDir) || !fs.existsSync(candidate) || fs.statSync(candidate).isDirectory()) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', ...securityHeaders() });
    return res.end('Not found');
  }
  const ext = path.extname(candidate).toLowerCase();
  res.writeHead(200, {
    'content-type': mime[ext] || 'application/octet-stream',
    'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
    ...securityHeaders()
  });
  fs.createReadStream(candidate).pipe(res);
}

export const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    return serveStatic(req, res, url);
  } catch (err) {
    console.error(err);
    return json(res, 500, { error: 'Internal server error' }, securityHeaders());
  }
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(PORT, HOST, () => console.log(`Atlas 259 donor rebuild running at http://${HOST}:${PORT}`));
}
