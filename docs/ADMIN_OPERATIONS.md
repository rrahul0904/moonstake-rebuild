# Atlas 259 operator console

The operator console is served at:

`/admin.html`

Access is restricted server-side to authenticated emails listed in `ADMIN_EMAILS`.

## Claims tab

Tracks primary registry purchases and moderation state.

Visible fields include:

- brand
- user ID
- paid amount
- registry-position IDs
- views
- clicks
- claim status
- Stripe Checkout Session ID
- Stripe PaymentIntent ID
- Stripe refund ID
- outbound URL

Operator actions:

- hide a claim
- restore a hidden claim
- open the advertised site
- issue a full Stripe refund for an eligible paid claim

## Users tab

Provides an account-level view from Supabase Auth joined with claim activity.

Visible fields include:

- user ID
- email
- brand/profile label
- signup time
- most recent sign-in
- email confirmation time
- number of claims
- number of active claims
- gross paid amount
- aggregate views
- aggregate clicks

This view is intended for operations/support, not public exposure.

## Marketplace tab

Tracks secondary-market economics from the MLD marketplace ledger.

Summary metrics:

- marketplace GMV
- Atlas registry/marketplace fees
- pending offers
- pending payouts
- current Moon Index
- owned positions / total Moon positions

Transaction detail:

- registry position
- transaction type
- gross amount
- platform fee
- seller proceeds
- buyer user ID
- seller user ID
- Stripe PaymentIntent
- payout status
- timestamp

Offer detail:

- registry position
- offer ID
- buyer ID
- offer amount
- status
- timestamp

## Still required before the console is launch-complete

- Stripe Connect connected-account status per seller
- transfer ID and payout ID
- failed-payout reason
- disputes and chargebacks
- refund/transfer-reversal state
- fraud/risk flags
- moderation notes/history
- per-lot analytics instead of claim-only aggregate metrics
- world/body filters
- Moon/Solar Index history chart
- admin audit-log viewer
- CSV/export capability
- role-based admin permissions beyond a single allowlisted-admin class

## Security rules

- Never trust a client-side admin flag.
- Every admin API endpoint must call the server-side admin authorization check.
- Supabase secret/service credentials remain server-only.
- Stripe secret and webhook secret remain server-only.
- The public repository must not contain production secrets or personal account verification data.
- Destructive financial actions must be idempotent and auditable.
