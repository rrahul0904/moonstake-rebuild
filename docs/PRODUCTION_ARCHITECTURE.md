# Production architecture

The repository supports two backends.

`BACKEND_MODE=local` keeps the dependency-free JSON datastore and demo payment flow for local development and tests. Production is run through `npm run start:production`, which activates Supabase Auth/Postgres plus Stripe Checkout.

## Paid claim state machine

1. Browser asks the server for a quote.
2. Server computes pricing; client prices are never trusted.
3. `reserve_sectors` atomically clears expired holds, rejects already-owned sectors, and creates unique sector holds.
4. Server creates a Stripe Checkout Session using the reservation total.
5. Ownership is **not** created from the browser redirect.
6. Stripe calls `/api/webhooks/stripe`; the server verifies the signed webhook body.
7. `process_stripe_checkout_completed` idempotently converts the still-held sectors into an active claim in one database transaction.
8. Expired or failed checkout sessions release their holds.

The primary keys on `claim_sectors.sector_id` and `sector_holds.sector_id` are the database-enforced anti-double-sale invariants.

## Auth

Production signup/sign-in uses Supabase Auth. Access and refresh tokens are kept in HttpOnly, SameSite=Lax cookies. The server validates the access token against Supabase and refreshes it when needed. Supabase secret keys are server-only and must never use a public environment variable.

## Moderation

`POST /api/admin/moderate` can set claims to `active`, `hidden`, or `refunded`. It is restricted to authenticated emails listed in `ADMIN_EMAILS` and records an audit log. A `refunded` moderation state does not itself issue a Stripe refund; refund execution remains a separate launch control.

## Deployment prerequisites

A production deployment needs one dedicated Supabase project and a Stripe sandbox/live account. Apply `supabase/migrations/0001_production.sql`, configure the environment variables from `.env.example`, and point the Stripe webhook to `/api/webhooks/stripe`.
