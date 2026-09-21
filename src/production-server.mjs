import { assertSupabaseConfig } from './supabase.mjs';
import { assertStripeConfig } from './stripe.mjs';
import { handleAdminApi } from './production-admin.mjs';
import { handleAuthApi } from './production-auth.mjs';
import { json, requireTrustedOrigin } from './production-common.mjs';
import { handlePaymentApi } from './production-payments.mjs';
import { handleMarketplaceApi } from './production-marketplace.mjs';
import { handlePublicApi } from './production-public.mjs';

export async function handleProductionApi(req, res, url) {
  assertSupabaseConfig();
  assertStripeConfig();

  if (!requireTrustedOrigin(req)) {
    return json(res, 403, { error: 'Untrusted request origin' });
  }

  if (url.pathname === '/api/webhooks/stripe' || url.pathname === '/api/claims') {
    return handlePaymentApi(req, res, url);
  }
  if (url.pathname.startsWith('/api/auth/')) {
    return handleAuthApi(req, res, url);
  }
  if (url.pathname.startsWith('/api/admin/')) {
    return handleAdminApi(req, res, url);
  }
  if (url.pathname === '/api/offers' || url.pathname.startsWith('/api/offers/') || url.pathname.startsWith('/api/lots/')) {
    const marketplaceHandled = await handleMarketplaceApi(req, res, url);
    if (marketplaceHandled !== false) return marketplaceHandled;
  }

  const handled = await handlePublicApi(req, res, url);
  if (handled === false) return json(res, 404, { error: 'Not found' });
  return handled;
}
