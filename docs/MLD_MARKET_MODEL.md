# MLD 259,200-lot marketplace model

Moonstake is a **billboard on a real lunar map, not a legal claim to lunar real estate**.

## Inventory

- 720 longitude columns × 360 latitude rows = **259,200 addressable lots**.
- Lot IDs are stable: `L-000-000` through `L-719-359`.
- The database is sparse: it stores owned lots, offers, transactions and metrics rather than pre-creating 259,200 rows.
- The renderer should progressively reveal lot boundaries at useful zoom levels instead of drawing all 259,200 cells every frame.

## Primary pricing

Standard ground starts at **$1**. Named ground costs more.

The first deterministic pricing bands are:

| Ground | Primary price |
| --- | ---: |
| Standard | $1 |
| Named-ground vicinity | $5 |
| Landmark ring | $10 |
| Landmark core | $25 |

Initial named locations include Apollo 11, Tycho, Copernicus, Aristarchus, Plato, Shackleton and Orientale. Pricing remains server-authoritative.

A first sale is entirely an **MLD fee** because there is no prior owner.

## Offers and resales

For an owned lot with last-paid price **P**:

- Hard minimum offer = **P + $1**.
- Suggested offer = **max(P + $1, P × 1.10)**.
- An accepted offer transfers the lot only through a verified paid settlement.

For accepted resale price **O**:

- Gain = **O − P**.
- Seller receives **P + 60% × gain**.
- MLD receives the remaining **40% of the gain**.

Example: last paid $10, accepted at $20.

- Seller stake returned: $10
- Seller share of gain: $6
- Seller payout: **$16**
- MLD fee: **$4**

The transaction ledger stores gross price, previous price, gain, seller payout and MLD fee independently so the split is auditable.

## Moon Index

The Moon Index is a transparent cumulative board-activity index:

`Moon Index = 100 + 100 × cumulative board GMV / $259,200`

That means:

- empty/new board = **100.00**
- $2,592 cumulative GMV adds 1 index point
- one full theoretical pass where all 259,200 lots sell at $1 = **200.00**

Resales continue increasing the index because new money has hit the board. The index does not represent an investment return, security price or appraisal.

## Lot analytics

Each owned lot tracks:

- views
- outbound clicks
- click-through rate (CTR)

These metrics support the actual product value: advertising/discovery performance.

## Production settlement boundary

Migration `0004_mld_market.sql` creates the server-side ledger and atomic ownership/offer settlement functions.

A resale should not be called production-complete until:

1. Stripe Checkout/PaymentIntent collection is connected to the selected offer.
2. A verified Stripe webhook calls the paid-settlement RPC exactly once.
3. Seller payouts are wired through an appropriate payout mechanism (for example Stripe Connect) and the ledger's `payout_status` is reconciled.
4. Concurrent offer acceptance and replay/idempotency tests pass.
5. Browser UAT proves lot price, minimum offer, suggested offer, views/clicks and Moon Index rendering.

The economic model is implemented now; external money movement remains a release-certification dependency.
