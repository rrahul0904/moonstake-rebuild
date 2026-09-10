# Implementation status

## Implemented and locally verified

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
- Admin moderation endpoint and audit logging
- Production/browser checkout bridge
- Docker packaging
- GitHub Actions CI
- Terms, privacy and refund-policy surfaces
- 8 automated tests passing locally, including Stripe signature tampering/staleness tests
- Node syntax checks passing for local and production entrypoints

## Still incomplete before 100% production launch

1. Provision a **dedicated Moonstake Supabase project**. Existing unrelated projects should not be reused.
2. Apply `supabase/migrations/0001_production.sql` to that project and run Supabase security/performance advisors. Fix any findings.
3. Configure Supabase production auth settings: email verification, redirect URLs and production site URL.
4. Connect a Stripe sandbox, obtain a restricted server key and webhook signing secret, and register `/api/webhooks/stripe`.
5. Run a real Stripe sandbox purchase end-to-end and verify reservation → payment → webhook → claim ownership.
6. Run concurrent-purchase tests against the real Postgres project to prove the same sector cannot be sold twice.
7. Implement **actual Stripe refund execution**. The current moderation state can mark a claim `refunded`, but it intentionally does not yet send a refund request to Stripe.
8. Deploy the production process to a public host, configure production secrets and connect a domain.
9. Run production browser/mobile smoke tests and abuse/security checks.
10. Replace or augment the procedural lunar texture with an approved high-resolution NASA LRO WAC source if exact scientific-map fidelity is a launch requirement.
11. Have final Terms/Privacy/Refund wording reviewed for the launch entity/jurisdiction.

## Completion definition

The repository is no longer just a demo: the core production architecture is implemented. It should **not** be described as 100% complete until the external production integrations above are provisioned and verified with real sandbox traffic.
