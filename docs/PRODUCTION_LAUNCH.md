# Production launch path

The repository is fully runnable and testable locally. A public, multi-instance, real-money deployment requires infrastructure credentials that cannot be invented safely.

## 1. Database

Replace `src/store.mjs` with PostgreSQL/Supabase while keeping the entity shapes documented in `ARCHITECTURE.md`.

Recommended tables: `users` (or Supabase Auth), `claims`, `claim_sectors` (unique sector ID), `events`, and `payments`.

The critical invariant is a unique constraint on `claim_sectors.sector_id`, enforced inside the purchase transaction to prevent double-selling.

## 2. Payments

Replace demo checkout with Stripe Checkout:

1. quote sectors server-side;
2. reserve sectors with an expiration;
3. create Stripe Checkout Session using the quoted amount;
4. confirm ownership only from a signed Stripe webhook;
5. release reservations on expiration/payment failure;
6. make webhook handling idempotent.

Never trust a client-supplied price.

## 3. Hosting

The included Dockerfile works on any container host with a persistent volume. For Vercel, use a remote PostgreSQL/Supabase store because serverless local files are ephemeral.

## 4. Security hardening

Before accepting real payments:

- verified email authentication / rate limits
- CSRF defense for state-changing cookie-authenticated requests
- CAPTCHA or bot protection on signup/claim
- URL abuse/phishing review pipeline
- legal terms/privacy/refund policy
- CSP tuned to payment + analytics providers
- structured audit logs
- payment webhook signature verification
- admin moderation tooling

## 5. Geospatial fidelity

For scientific-map fidelity, replace the procedural surface with an approved NASA LRO WAC tile pyramid and attach real selenographic polygons to sectors. NASA's public LRO products are the correct upstream data source; verify required credit/reproduction guidance for the exact asset selected.
