import { moonIndexFromGmvCents } from './market-model.mjs';
import crypto from 'node:crypto';
import {
  authRefresh,
  authSignOut,
  authUser,
  consumeRateLimit,
  getProfile,
} from './supabase.mjs';

const ACCESS_COOKIE = 'ms_access';
const REFRESH_COOKIE = 'ms_refresh';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

export function securityHeaders() {
  return {
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    'content-security-policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-src https://checkout.stripe.com; connect-src 'self'",
    ...(process.env.NODE_ENV === 'production'
      ? { 'strict-transport-security': 'max-age=31536000; includeSubDomains' }
      : {}),
  };
}

export function json(res, status, body, headers = {}) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...securityHeaders(),
    ...headers,
  });
  res.end(JSON.stringify(body));
}

export function parseCookies(req) {
  const result = {};
  for (const pair of String(req.headers.cookie || '').split(';')) {
    const i = pair.indexOf('=');
    if (i > 0) result[pair.slice(0, i).trim()] = decodeURIComponent(pair.slice(i + 1).trim());
  }
  return result;
}

function cookie(name, value, maxAge = SESSION_MAX_AGE) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${name}=${encodeURIComponent(value)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`;
}

export function clearCookies() {
  return [
    `${ACCESS_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`,
    `${REFRESH_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`,
  ];
}

export function setSessionHeaders(session) {
  return {
    'set-cookie': [
      cookie(ACCESS_COOKIE, session.access_token, Number(session.expires_in || 3600)),
      cookie(REFRESH_COOKIE, session.refresh_token),
    ],
  };
}

export function normalizeUrl(input) {
  if (!input) return '';
  const value = String(input).trim();
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  const u = new URL(candidate);
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Only http(s) URLs are allowed');
  return u.toString();
}

export async function readBody(req, raw = false) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1_000_000) throw new Error('Body too large');
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (raw) return text;
  return text ? JSON.parse(text) : {};
}

export function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown')
    .split(',')[0]
    .trim();
}

export async function checkRateLimit(req, key, limit = 10, windowSeconds = 600) {
  const keyHash = crypto
    .createHash('sha256')
    .update(`${clientIp(req)}|${req.headers['user-agent'] || ''}`)
    .digest('hex');
  return Boolean(await consumeRateLimit({ bucket: key, keyHash, limit, windowSeconds }));
}

export function requireTrustedOrigin(req) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return true;
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(process.env.APP_URL).origin;
  } catch {
    return false;
  }
}

export function toPublicUser(user, profile) {
  return user
    ? {
        id: user.id,
        email: user.email,
        brand: profile?.brand || user.user_metadata?.brand || '',
        createdAt: profile?.created_at || user.created_at,
      }
    : null;
}

export async function sessionUser(req, res) {
  const cookies = parseCookies(req);
  let access = cookies[ACCESS_COOKIE];
  const refresh = cookies[REFRESH_COOKIE];
  if (!access) return null;

  try {
    const user = await authUser(access);
    const profile = await getProfile(user.id);
    return { user, profile, public: toPublicUser(user, profile) };
  } catch {
    if (!refresh) return null;
    try {
      const session = await authRefresh(refresh);
      access = session.access_token;
      const user = await authUser(access);
      const profile = await getProfile(user.id);
      res.setHeader('set-cookie', setSessionHeaders(session)['set-cookie']);
      return { user, profile, public: toPublicUser(user, profile) };
    } catch {
      return null;
    }
  }
}

export async function signOutRequest(req) {
  const cookies = parseCookies(req);
  if (cookies[ACCESS_COOKIE]) await authSignOut(cookies[ACCESS_COOKIE]);
}

export function claimStats(rows) {
  const claims = (rows || []).map((r) => ({
    id: r.id,
    userId: r.user_id,
    bodyId: r.body_id || 'moon',
    labelType: 'atlas-label',
    brand: r.brand,
    tagline: r.tagline || '',
    url: r.url || '',
    sectors: r.sectors || [],
    amount: Number(r.amount_cents || 0) / 100,
    currency: r.currency || 'USD',
    createdAt: r.created_at,
    views: Number(r.views || 0),
    clicks: Number(r.clicks || 0),
    status: r.status,
  }));
  const gmvCents = claims.reduce((sum, claim) => sum + Math.round(claim.amount * 100), 0);
  return {
    claims,
    offices: claims.length,
    index: moonIndexFromGmvCents(gmvCents),
    onBoard: claims.length,
    views: claims.reduce((s, c) => s + c.views, 0),
    clickThroughs: claims.reduce((s, c) => s + c.clicks, 0),
    claimedSectors: claims.reduce((s, c) => s + c.sectors.length, 0),
  };
}

export function boardFromClaims(claims) {
  return claims
    .map((c) => ({
      id: c.id,
      brand: c.brand,
      tagline: c.tagline,
      url: c.url,
      sectors: c.sectors.length,
      views: c.views,
      clicks: c.clicks,
      ctr: c.views ? c.clicks / c.views : 0,
      createdAt: c.createdAt,
    }))
    .sort(
      (a, b) =>
        b.views + b.clicks * 3 + b.sectors * 2 -
        (a.views + a.clicks * 3 + a.sectors * 2),
    );
}

export function adminAllowed(email) {
  const allowed = String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(String(email || '').toLowerCase());
}
