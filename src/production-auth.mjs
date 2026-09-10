import { authSignIn, authSignUp, getProfile } from './supabase.mjs';
import {
  checkRateLimit,
  clearCookies,
  json,
  readBody,
  setSessionHeaders,
  signOutRequest,
  toPublicUser,
} from './production-common.mjs';

export async function handleAuthApi(req, res, url) {
  if (req.method === 'POST' && url.pathname === '/api/auth/signup') {
    if (!(await checkRateLimit(req, 'signup', 5))) {
      return json(res, 429, { error: 'Too many signup attempts. Try again later.' });
    }
    const body = await readBody(req);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const brand = String(body.brand || '').trim().slice(0, 64);
    if (!/^\S+@\S+\.\S+$/.test(email)) return json(res, 400, { error: 'Enter a valid email' });
    if (password.length < 8) return json(res, 400, { error: 'Password must be at least 8 characters' });
    if (!brand) return json(res, 400, { error: 'Brand name is required' });
    try {
      const data = await authSignUp(email, password, brand);
      if (!data?.session && !data?.access_token) {
        return json(res, 201, {
          user: toPublicUser(data.user, { brand }),
          verificationRequired: true,
        });
      }
      const session = data.session || data;
      return json(res, 201, { user: toPublicUser(data.user, { brand }) }, setSessionHeaders(session));
    } catch (err) {
      return json(res, err.status === 422 ? 409 : 400, { error: err.message });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/signin') {
    if (!(await checkRateLimit(req, 'signin', 10))) {
      return json(res, 429, { error: 'Too many sign-in attempts. Try again later.' });
    }
    const body = await readBody(req);
    try {
      const session = await authSignIn(
        String(body.email || '').trim().toLowerCase(),
        String(body.password || ''),
      );
      const profile = await getProfile(session.user.id);
      return json(res, 200, { user: toPublicUser(session.user, profile) }, setSessionHeaders(session));
    } catch {
      return json(res, 401, { error: 'Invalid email or password' });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/signout') {
    await signOutRequest(req);
    return json(res, 200, { ok: true }, { 'set-cookie': clearCookies() });
  }

  return false;
}
