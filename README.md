# Atlas 259 — the registry of worlds

**Atlas 259** is the product brand for this clean-room celestial registry and attention marketplace. The Moon is the first live market; Mars and additional bodies follow the phased Solar System model. Moonstake.org remains the donor/reference product used for clean-room behavioral research.

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
- Move / Select modes on the canonical 720 × 360 = 259,200 Moon registry grid
- progressive grid rendering so 259,200 addressable positions do not overwhelm the canvas
- canonical MLD economics model with per-position pricing and ownership
- generalized Solar System market model for solid-body surface lots versus gas-giant/star observation inventory
- Server-authoritative pricing and premium sectors
- Landmark and brand search
- Semantic browser/agent control contract for search, focus, zoom, sector selection and structured state read-back (purchase actions intentionally excluded)
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

## Semantic lunar control

The web app exposes its canonical semantic control surface at `window.atlas259Semantic`. A temporary `window.moonstakeSemantic` alias remains only for backwards compatibility while donor-specific tests migrate. It is designed as the clean-room donor integration from the Limoni globe concept: automation addresses landmarks, claims and sectors by identity rather than screen coordinates. See `docs/LIMONI_GLOBE_DONOR.md`.


## Solar System expansion

The Moon remains the launch market. The new `src/celestial-market.mjs` layer generalizes the economic model without pretending every celestial object has sellable ground.

- solid bodies can use globally unique 720 × 360 angular lot IDs such as `MARS-360-180`
- Moon pricing and MLD resale behavior remain backward compatible
- Mars, Mercury, Venus, Ceres, Pluto, Europa and Titan are modeled as future surface markets
- Jupiter, Saturn and the Sun are explicitly non-land inventory and use a separate observation-zone model
- the launch plan is phased so adding inventory does not immediately fragment Moon liquidity
- every body has its own index; a Solar Index can aggregate launched markets
- scientific geography should come from NASA/JPL/PDS and USGS/IAU nomenclature sources

See `docs/SOLAR_SYSTEM_EXPANSION.md`.


## Brand

Working product name: **Atlas 259**  
Tagline: **The registry of worlds.**

The repository name remains `moonstake-rebuild` temporarily because it documents the clean-room donor lineage and avoids breaking deployment/review references while the new brand goes through trademark/domain clearance. New user-facing product work should use Atlas 259.
