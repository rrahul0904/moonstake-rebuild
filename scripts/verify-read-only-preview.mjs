// Run only against the explicitly isolated, credentials-free public demo URL.
// This is a lightweight HTTP contract probe, not browser, payment or production certification.
const supplied = process.argv[2] || process.env.PREVIEW_BASE_URL;
if (!supplied) {
  console.error('PREVIEW_BASE_URL or the first URL argument is required');
  process.exit(2);
}
let base;
try { base = new URL(supplied); } catch {
  console.error('Supply a valid HTTPS preview URL');
  process.exit(2);
}
if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) {
  console.error('Preview verification requires a clean HTTPS origin without credentials');
  process.exit(2);
}
if (base.hostname === 'moonstake.org' || base.hostname.endsWith('.moonstake.org')) {
  console.error('Refusing to treat the original donor website as an owned deployment');
  process.exit(2);
}
base = base.origin;
const request = (pathname, options = {}) => fetch(new URL(pathname, base), {
  redirect: 'error', signal: AbortSignal.timeout(15_000),
  headers: { 'user-agent': 'atlas259-preview-readonly-probe/1.0', ...(options.headers || {}) },
  ...options
});
async function requireOk(pathname) {
  const res = await request(pathname);
  if (!res.ok) throw new Error(`${pathname} returned ${res.status}`);
  return res;
}
const root = await (await requireOk('/')).text();
if (!root.includes('ATLAS 259') || !root.includes('id="preview-banner"')) {
  throw new Error('Unexpected showcase HTML or absent preview marker');
}
await requireOk('/app.js');
await requireOk('/styles.css');
const health = await (await requireOk('/api/health')).json();
if (health?.ok !== true || health?.service !== 'atlas259' || health?.mode !== 'demo' || health?.readOnly !== true) {
  throw new Error('Host is not in the isolated read-only demo mode');
}
const bootstrap = await (await requireOk('/api/bootstrap')).json();
if (bootstrap?.previewReadOnly !== true || bootstrap?.paymentsMode !== 'disabled' || !Array.isArray(bootstrap.claims)) {
  throw new Error('Preview bootstrap is not safe or lacks seeded claims');
}
const bodies = await (await requireOk('/api/celestial-bodies')).json();
if (!(bodies.bodies || []).some(body => body.id === 'moon')) throw new Error('Moon catalog is absent');
await requireOk('/api/board');
for (const pathname of ['/api/claims', '/api/auth/signup', '/api/events/view', '/api/webhooks/stripe']) {
  const response = await request(pathname, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}'
  });
  if (response.status !== 403 || (await response.json())?.code !== 'PREVIEW_READ_ONLY') {
    throw new Error(`Mutation route ${pathname} did not fail closed`);
  }
}
if ((await request('/admin.html')).status !== 404) throw new Error('Admin UI must not be publicly served');
console.log(JSON.stringify({
  ok: true, base, mode: 'demo', readOnly: true, paymentsMode: 'disabled',
  seededClaimCount: bootstrap.claims.length,
  verified: ['root', 'static assets', 'health', 'bootstrap', 'catalog', 'board', 'mutation denial', 'admin UI denial'],
  exclusions: ['browser UAT', 'database integration', 'Stripe/Connect', 'production release']
}, null, 2));
