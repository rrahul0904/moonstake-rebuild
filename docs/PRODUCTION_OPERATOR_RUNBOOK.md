# Moonstake production operator runbook

This runbook is intentionally free of account IDs, emails, keys, webhook secrets, project refs, and other credentials.

## 1. Preflight

Before provisioning or deploying, export the production environment variables listed in `.env.example` and run:

```bash
npm test
npm run check
npm run preflight
```

`npm run preflight` validates that production URLs are HTTPS, modern Supabase publishable/secret key formats are used, Stripe secrets have the expected shape, and at least one admin email is configured. It never prints secret values.

## 2. Supabase

Create a dedicated Moonstake project. Do not reuse an unrelated application database.

If project creation is blocked by a free-project quota, resolve it outside the application code by one of these operator actions:

- pause/delete an unused existing project only after confirming it is safe to do so;
- upgrade the Supabase organization plan; or
- use a separate organization with available capacity.

After the project exists, apply migrations in order:

```text
supabase/migrations/0001_production.sql
supabase/migrations/0002_admin_refunds.sql
supabase/migrations/0003_distributed_rate_limits.sql
```

Then run Supabase security and performance advisors and remediate applicable findings before deployment.

Configure Auth with email verification, the production site URL, and only the required redirect URLs.

## 3. Stripe sandbox

Use sandbox/test credentials for release verification. Prefer a restricted `rk_test_...` server key with only the permissions Moonstake needs.

Register the production API path `/api/webhooks/stripe` and store its `whsec_...` signing secret only in the hosting environment. Do not commit any Stripe keys.

Verify at least these events:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`

Run one successful purchase and one cancelled/expired checkout. Confirm that ownership is created only from a verified paid webhook.

## 4. Concurrency certification

Against the real Postgres project, start two checkouts for the same sector at the same time. Exactly one reservation must succeed. Repeat after hold expiry and verify the sector becomes available again.

## 5. Vercel

Deploy from the GitHub repository. Configure production environment variables from `.env.example`; never copy secrets into repository files.

Before assigning a production domain, verify:

- `/api/health` returns 200;
- signup/sign-in/sign-out work;
- quote and Checkout redirect work;
- signed Stripe webhooks finalize claims;
- Board, Explore, My Land and analytics load;
- `/admin.html` requires an authorized admin and can hide/restore/refund claims;
- terms, privacy and refund pages load;
- desktop and mobile smoke tests pass.

## 6. Go-live gate

Do not describe the release as production-complete until Supabase, Stripe sandbox, concurrency, Vercel deployment and browser smoke tests have all passed on the deployed environment.
