# Atlas 259 — phased implementation and deployment program

Tracking: [Issue #6](https://github.com/rrahul0904/moonstake-rebuild/issues/6). Base evidence: draft PR #4, `feat/solar-system-market` at `aa9c5fd8d67e8e73b80fd59884c2e059f7f6bdf1`, [CI 35742135529](https://github.com/rrahul0904/moonstake-rebuild/actions/runs/35742135529) (77 tests passed, 0 failed on that SHA). This file is a delivery plan and readiness ledger, not a declaration of release.

## Guardrails

- Distinguish original Moonstake source behavior from Atlas 259 owned clean-room implementation. No copied private code, media or privileged information. Digital registry/advertising placements never imply legal ownership of lunar or planetary territory.
- Do not deploy an account-taking, payment-enabled JSON-file demo. An anonymous showcase is read-only, seeded, and has no registration or checkout. No user-entered information is retained.
- Keep real payments, seller transfers and production integrations disabled until evidence-backed certification. Do not use live Stripe keys or customer data in a preview.
- Keep the stacked review lineage (PR #2 → #3 → #4); implement independent increments in draft branches, test at exact head, and merge only after review. Never equate 77 unit tests with browser or deployment verification.
- A deploy is done only when a host returns an actual HTTPS URL and external probes + browser evidence tie that URL to an exact git SHA. A `vercel.json`, Dockerfile, workflow or public original site is not a deployment receipt.

## Phases, dependencies, acceptance and current state

| Phase | Deliverable | Acceptance gate | Status on 2026-09-28 |
| --- | --- | --- | --- |
| 0 — baseline | Source/PR/test/hosting inventory, issue and safety boundaries | Exact SHA, CI and blockers linked | Baseline recorded; PR #4 draft, not merged |
| 1 — showcase | Seeded Moon/Worlds/Board/Explore, clearly labeled read-only HTTP and UI contract | Non-GET methods fail closed, GET public surfaces work, integration tests pass | Implemented on stacked draft PR #7; automated 80/80 test suite and syntax checks passed on first implementation head; final exact-head CI and actual browser UAT tracked separately |
| 2 — isolated hosting | Separate preview host, configured read-only local mode, external health/browser certification | URL + SHA + deployment result + browser checks, no payments | Blocked: Vercel deploy action unavailable; Railway free-plan resource provisioning limit |
| 3 — durable production data/auth | Dedicated Supabase, migrations, advisor findings, auth/admin, RLS, reservation races | Migration receipts, security findings resolved, two-buyer race proves unique ownership | Code paths exist; live external evidence pending |
| 4 — primary payment | Stripe test-mode Checkout, signed webhooks, claim/refund/reconciliation | Paid/cancelled/expired/replayed/concurrent test transaction receipts | Code paths exist; real sandbox certification pending |
| 5 — resale & payouts | Connected-seller onboarding, resale, transfer, reversal, failures and dispute handling | Stripe Connect sandbox receipts and financial ledger reconciliation | Code paths exist; external certification pending |
| 6 — product & data QA | Body-aware catalog, authoritative licensed geography, map/analytics, WCAG/mobile, new donor features as separately scoped | Provenance and mobile/desktop browser acceptance | Partial implemented; authoritative ingestion / UAT pending |
| 7 — launch | Domain, alerting, rollback, retention/deletion, legal/commercial and privacy release review | Signed launch checklist and exact-head production evidence | Not started |

## Delivery sequence

1. Land the read-only preview guard as a **stacked draft PR**. Preserve default local developer behavior; enable with `ATLAS_PREVIEW_READ_ONLY=true`. Force the preview payment status to `disabled` in the public bootstrap and deny mutation on the server, regardless of client behavior.
2. Verify using an ephemeral test datastore, including denial of signup, quote/claim, watchlist, events and other POST requests; no seeded-data changes. Add a hosted HTTPS read-only smoke probe separate from production's Stripe-mode verifier.
3. Configure dedicated hosting only once available. For the container entrypoint use `npm start`, `BACKEND_MODE=local`, `PAYMENTS_MODE=disabled`, `ATLAS_PREVIEW_READ_ONLY=true`; restrict write access, use synthetic seed, do not expose production auth/admin. If hosting needs multiple replicas or persistence, use the production database path instead of assuming a local JSON file is safe.
4. After public preview is certified, commission a dedicated Supabase staging project and tackle Phase 3 onward in small, evidence-backed PRs.
5. Keep a separate issue for the observed mineral-finding game. It is not inherited from the historical implementation and should not block the read-only showcase.

## External blocker register

- **Vercel:** connected project inventory did not show an Atlas 259 project; connected deploy action returned `Tool deploy_to_vercel not found`. Existing release workflow requires separate Vercel project/org/token credentials and the production app's Supabase/Stripe configuration.
- **Railway:** new preview project creation returned `Free plan resource provision limit exceeded`. Existing unrelated `earth-v11-preview` and `AiApply` projects must not be overwritten or deleted to bypass quota.
- **Payments:** no production/sandbox integration receipt is attached to PR #4; test success alone does not authorize live charges.

Update this file and Issue #6 only with evidence as each phase is completed.
