# Moonstake — clean-room rebuild

A working clean-room recreation of the product model visible at `https://www.moonstake.org/`: an interactive lunar surface where startups can search lunar landmarks, select purchasable sectors, plant a brand flag, appear on a public board, and track views/click-throughs.

This repository contains original implementation code. It does **not** copy Moonstake's private source code or proprietary backend. The visible product behavior was studied from the public website and rebuilt independently.

## Run locally

```bash
npm test
npm run check
npm start
# open http://127.0.0.1:4173
```

No npm install is required: the application uses Node.js built-ins and browser APIs only.

## Production mode

The repo now includes a production backend path using Supabase Auth/Postgres plus Stripe Checkout.

```bash
cp .env.example .env
# populate the production variables documented in .env.example
npm run start:production
```

Before starting production mode, apply `supabase/migrations/0001_production.sql` to a dedicated Supabase project and configure the Stripe webhook endpoint at `/api/webhooks/stripe`.

The paid ownership state machine is reservation → Stripe Checkout → signed webhook → atomic claim finalization. Browser redirects never create ownership directly, and sector uniqueness is enforced in Postgres to prevent double-selling.

## Implemented product surface

- Full-screen lunar map and responsive desktop/mobile UI
- Mouse/touch pan, wheel zoom, Whole Moon reset
- Move / Select modes and 64 × 32 claimable sector grid
- Server-authoritative pricing and premium sectors
- Landmark and brand search
- Public brand flags and claim cards
- Board, Explore, My Land and analytics
- Local demo auth/data mode for zero-credential development
- Supabase Auth production adapter with HttpOnly access/refresh cookies
- Supabase/Postgres production schema with RLS
- Atomic sector holds and claim finalization RPCs
- Stripe Checkout creation with idempotency keys
- Signed Stripe webhook verification and replay protection
- Checkout expiry / delayed-payment handling
- Admin moderation endpoint and audit log
- CI syntax/tests, Docker packaging and production docs
- Terms, privacy and refund-policy launch surfaces

## What is still external / unverified

The code is present, but a public launch is **not** called complete until a dedicated Supabase project is provisioned, the migration is applied and advisor-clean, Stripe sandbox/live credentials and webhook are connected, a production host/domain is deployed, and real sandbox payment + concurrent-purchase E2E tests pass. See `docs/IMPLEMENTATION_STATUS.md` and `docs/PRODUCTION_ARCHITECTURE.md`.
