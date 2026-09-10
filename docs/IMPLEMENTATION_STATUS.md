# Implementation status

## Implemented and verified in code

- Research-backed product surface inventory
- Full lunar map UI, pan/zoom and responsive behavior
- Lunar landmark/brand search
- Sector selection and server-authoritative pricing
- Board, Explore, My Land and view/click analytics
- Local signup/sign-in/session flow
- Local persistent datastore and demo checkout
- Supabase Auth production adapter
- HttpOnly production access/refresh-token cookies
- Supabase/Postgres production schema with RLS
- Atomic sector reservation and database-level anti-double-sale constraints
- Stripe Checkout session creation with idempotency keys
- Signed Stripe webhook verification
- Webhook replay protection through `stripe_events`
- Paid claim finalization only after verified payment
- Checkout expiry and delayed-payment success/failure handling
- Full Stripe refund execution with a stable idempotency key
- Refund persistence (`stripe_refund_id`, `refunded_at`) and audit logging
- Admin claim inventory, hide/restore controls and refund operator console at `/admin.html`
- Distributed Postgres-backed signup/sign-in rate limiting
- Strict origin checks, SameSite cookies, CSP and production HSTS
- Production health endpoint
- Dedicated Node/container production entrypoint
- Vercel-native API adapter with raw body parsing disabled for signed webhooks
- Vercel routing configuration
- Production API split into small, independently syntax-checked auth/public/payment/admin/common modules
- Docker packaging
- GitHub Actions CI
- Terms, privacy and refund-policy launch surfaces
- 11 automated tests passing locally
- Syntax checks passing for local server, production modules, Vercel adapter and browser scripts

## Still incomplete before 100% production launch

1. Provision a **dedicated Moonstake Supabase project**. Existing unrelated projects should not be reused.
2. Apply migrations `0001_production.sql`, `0002_admin_refunds.sql` and `0003_distributed_rate_limits.sql` to that project.
3. Run Supabase security and performance advisors against the real schema and fix every applicable finding.
4. Configure Supabase production Auth: email verification, site URL and redirect allow-list.
5. Connect a Stripe sandbox/live account, configure a restricted server key and register `/api/webhooks/stripe` with its signing secret.
6. Run a real Stripe sandbox purchase end-to-end and prove reservation → Checkout → signed webhook → claim ownership.
7. Run concurrent-purchase tests against the real Postgres project to prove two buyers cannot own the same sector.
8. Deploy the GitHub project to Vercel, set production secrets and verify `/api/health`, static assets, auth and webhook routing.
9. Attach the production domain/DNS and run desktop/mobile production browser smoke tests.
10. Add an external bot/abuse challenge if launch traffic requires stronger automated abuse prevention than distributed rate limiting plus manual moderation.
11. Replace/augment the procedural lunar texture with an approved high-resolution NASA LRO WAC source if scientific-map fidelity is a launch requirement.
12. Have final Terms/Privacy/Refund wording reviewed for the actual launch entity and jurisdiction.

## Completion definition

The product and its production adapters are now substantially implemented. It should **not** be described as 100% complete until the external Supabase, Stripe, Vercel and domain integrations are provisioned and verified with real sandbox traffic and concurrency tests.
