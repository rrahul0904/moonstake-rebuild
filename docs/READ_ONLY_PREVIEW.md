# Atlas 259 — isolated read-only preview runbook

This runbook is for the **synthetic public showcase only**. It is not the paid registry backend, not a Stripe sandbox certification, and not a production launch. See [DELIVERY_PLAN.md](DELIVERY_PLAN.md) and [Issue #6](https://github.com/rrahul0904/moonstake-rebuild/issues/6).

## Source

- Deploy the exact reviewed head of `feat/read-only-hosted-preview` (stacked on `feat/solar-system-market`). Record its complete SHA and avoid silently switching to `main`.
- Node 22, `npm start` (runs `src/server.mjs`). Dockerfile supports the same entrypoint.
- The Vercel API adapter and `npm run start:production` are separate **Supabase/Stripe** paths and must NOT be used to claim a credentials-free demo. Use an isolated Node/container host for this preview.

## Required environment

```dotenv
NODE_ENV=production
ATLAS_PREVIEW_READ_ONLY=true
PAYMENTS_MODE=disabled
BACKEND_MODE=local
HOST=0.0.0.0
# PORT is provided by the host (4173 is the local fallback).
# MOONSTAKE_DB_PATH can point to an isolated ephemeral demo file; only synthetic seed data is used.
```

Do not add Stripe, Supabase, Connect or production authentication secrets to this preview. Do not allow real customer registration or payment. The HTTP guard returns 403 `PREVIEW_READ_ONLY` for every mutating `/api/` method, including signup, claims, events, offers, admin writes and webhook calls. The public bootstrap reports `paymentsMode: "disabled"`, and `/admin.html` is not served.

The seeded JSON file is an internal demo fixture, **not a shared multi-replica data store**. Use one preview replica and no durable user writes. Never point it at an unrelated project's database or persistent volume.

## Host provisioning blocker (recorded 2026-09-28)

The connected Railway workspace rejected creating an additional project due to its free-plan resource provisioning limit. The Vercel deploy action was unavailable in the connected app; a separate Atlas 259 Vercel project was not visible. Do not delete, replace or redeploy the existing Earth or AiApply projects to bypass quota. Once isolated hosting capacity exists, create an entirely new preview service from the repository and branch above.

## External certification (must be actual HTTPS)

```bash
npm test
npm run check
npm run verify:preview -- https://<dedicated-preview-url>
```

The external probe checks the named Atlas 259 page and marker, static assets, read-only `/api/health`, synthetic bootstrap and disabled payments, Moon catalog/board, mutation denial and admin UI denial. It rejects the original Moonstake donor site as a deployment target. It does not certify the visual UI, payment flow, production security or persistence.

Then record actual desktop/mobile browser evidence: first load, map draw, pan/zoom, search, Board, Explore, Worlds, preview banner visible, sign-in/buy/offer controls disabled, no console errors, and HTTP denial for forced writes. Include exact head SHA, deployment identifier, tested URL, host, UTC timestamp, screenshots/results and rollback reference in Issue #6 and PR #7. A successful build without the URL and checks is not a deployment receipt.

## Rollback and release boundary

A preview failure should leave the payment-enabled production mode untouched. Disable/publicly unassign the isolated preview URL or revert it to its prior passing artifact; do not promote a preview to a paid release. Advance to dedicated Supabase and Stripe staging only under Phases 3–5 with their own credentials, migrations and integration evidence.
