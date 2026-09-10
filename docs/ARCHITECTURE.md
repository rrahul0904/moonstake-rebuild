# Architecture

## Runtime

- Browser: semantic HTML + CSS + ES modules + Canvas 2D
- Server: Node.js `http` module
- Persistence: atomic JSON-file store
- Auth: PBKDF2 password hashes; random HttpOnly session cookie
- Payments: demo adapter (`PAYMENTS_MODE=demo`)

## API

- `GET /api/bootstrap` — user, KPIs, claims, landmarks
- `GET /api/board` — ranked public board
- `GET /api/explore?q=` — landmark and brand search
- `GET /api/my-land` — authenticated owner inventory
- `POST /api/auth/signup`
- `POST /api/auth/signin`
- `POST /api/auth/signout`
- `POST /api/quote`
- `POST /api/claims`
- `POST /api/events/view`
- `POST /api/events/click`

## Data entities

### User
`id, email, brand, passwordSalt, passwordHash, createdAt`

### Session
`token, userId, createdAt, expiresAt`

### Claim
`id, userId, brand, tagline, url, sectors[], amount, currency, paymentMode, createdAt`

### Event
`id, type(view|click), claimId, createdAt`

## Map engine

The lunar disk is generated in a deterministic off-screen canvas using radial shading, crater fields, and maria. A screen-space grid overlays the disk after zooming. Pointer coordinates are transformed into sector coordinates; claims and current selection are rendered as overlays.
