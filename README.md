# Moonstake — clean-room rebuild

A working end-to-end recreation of the product model visible at `https://www.moonstake.org/`: an interactive lunar surface where startups can search lunar landmarks, select purchasable sectors, plant a brand flag, appear on a public board, and track views/click-throughs.

This repository contains original implementation code. It does **not** copy Moonstake's private source code or proprietary backend. The visible product behavior was studied from the public website and rebuilt independently.

## Run

```bash
npm test
npm start
# open http://127.0.0.1:4173
```

No npm install is required: the baseline app uses Node.js built-ins and browser APIs only.

## Current baseline

- Full-screen procedural lunar map
- Mouse/touch pan, wheel zoom, Whole Moon reset
- Move / Select interaction modes
- 64 × 32 claimable sector grid
- Real-time quote engine; standard lots start at $1
- Premium landmark/central sectors
- Landmark search
- Public brand flags and claim cards
- Account signup/sign-in/sign-out
- Persistent local datastore
- Claim conflict prevention
- Demo checkout
- Board, Explore, My Land
- View/click analytics
- Responsive desktop/mobile UI
- API/pricing tests
- Docker packaging

Production adapters for PostgreSQL/Supabase, Stripe Checkout/webhooks, moderation/admin, concurrency-safe reservations, CI/CD and production verification are being added in subsequent commits.
