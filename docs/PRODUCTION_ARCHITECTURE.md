# Production architecture

The repository supports two operating modes.

The local entrypoint (`npm start`) keeps the dependency-free JSON datastore and demo payment flow for fast development and deterministic tests. Production can run through `npm run start:production` on a Node/container host, or through the Vercel API adapter in `api/index.mjs`. Both production paths use Supabase Auth/Postgres and Stripe Checkout.

## Paid claim state machine

1. Browser asks the server for a quote.
2. Server computes pricing; client prices are never trusted.
3. `reserve_sectors` atomically clears expired holds, rejects already-owned sectors, and creates unique sector holds.
4. Server creates a Stripe Checkout Session using the reservation total.
5. Ownership is **not** created from the browser redirect.
6. Stripe calls `/api/webhooks/stripe`; the server verifies the raw signed webhook body.
7. `process_stripe_checkout_completed` idempotently converts the still-held sectors into an active claim in one database transaction.
8. Expired or failed checkout sessions release their holds.

The primary keys on `claim_sectors.sector_id` and `sector_holds.sector_id` are the database-enforced anti-double-sale invariants.

## Auth and abuse controls

Production signup/sign-in uses Supabase Auth. Access and refresh tokens are kept in HttpOnly, SameSite=Lax cookies. The server validates access tokens against Supabase and refreshes them when needed. Supabase secret keys remain server-only.

Authentication throttling is stored in Postgres through `consume_rate_limit`, so limits are shared across Vercel/container instances rather than relying on per-process memory. Mutating browser requests are origin-checked and production responses include CSP and HSTS.

## Moderation and refunds

The operator console is available at `/admin.html` to authenticated users whose email is listed in `ADMIN_EMAILS`.

- `GET /api/admin/claims` returns the full claim inventory, including hidden/refunded claims and Stripe identifiers.
- `POST /api/admin/moderate` hides or restores a claim and records the action.
- `POST /api/admin/refund` sends a full refund to Stripe using the stored PaymentIntent and a claim-stable idempotency key. Only after Stripe accepts the refund does `record_claim_refund` persist the Stripe refund ID, timestamp, status and audit record.

## Vercel

`vercel.json` rewrites `/api/:path*` into the Vercel Node function at `api/index.mjs`. The function disables body parsing so Stripe webhook signature verification receives the raw request stream. Static assets are served from `public/`, and the checkout bridge is loaded directly by `public/index.html`.

## Deployment prerequisites

A production deployment needs one dedicated Supabase project and a Stripe sandbox/live configuration. Apply all migrations in `supabase/migrations/` in order, configure the variables from `.env.example`, register the Stripe webhook at `/api/webhooks/stripe`, and run the real integration/concurrency tests described in `IMPLEMENTATION_STATUS.md`.
