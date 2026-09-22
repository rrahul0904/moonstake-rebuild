# Atlas 259 payments and seller payouts

Atlas 259 has two materially different money flows. They must not be treated as the same integration.

## 1. Primary registry purchase

A primary purchase is a customer buying a new Atlas 259 digital registry / advertising placement directly from the platform.

Production flow:

1. Client selects canonical registry positions.
2. Server calculates the authoritative per-position prices.
3. Database creates a temporary reservation and stores each position's quoted price.
4. Server creates a Stripe Checkout Session using the reservation total.
5. Customer pays on Stripe Checkout.
6. Atlas 259 verifies the signed Stripe webhook.
7. The webhook finalizes the claim atomically.
8. Each canonical position receives a first-sale transaction row with its own last-paid amount.
9. The reservation is consumed.
10. The operator console can see the claim, PaymentIntent and refund state.

The browser redirect is never payment proof. Ownership is finalized from the verified webhook.

### Required production checks

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `APP_URL`
- signed webhook verification
- idempotent Checkout Session creation
- reservation collision testing
- verified Checkout completion
- expired Checkout releases reservation
- refund from operator console
- Stripe live account has charges enabled
- Stripe business profile accurately describes Atlas 259
- production domain is present in the Stripe business profile

## 2. Secondary-market resale

A resale is a marketplace transaction. The buyer pays through Atlas 259 and an existing holder receives proceeds.

Atlas economics:

- last paid = P
- minimum offer = P + $1
- suggested offer = max(P + $1, P × 1.10)
- accepted price = O
- gain = O - P
- seller proceeds = P + 60% of gain
- Atlas 259 fee = 40% of gain

Example:

- previous price: $10
- accepted offer: $20
- gain: $10
- seller proceeds: $16
- Atlas 259 fee: $4

### Stripe architecture

Do not implement seller payouts as manual bank transfers from the platform owner's bank account.

Use **Stripe Connect** and represent each seller who wants to receive resale proceeds as a connected account.

Preferred Atlas 259 settlement path:

1. Seller completes Connect onboarding before an offer can be accepted for cash settlement.
2. Buyer pays Atlas 259.
3. Verified webhook records successful payment.
4. Atlas 259 settlement ledger calculates seller proceeds and platform fee.
5. Transfer seller proceeds to the seller's eligible connected account.
6. Record Stripe transfer/payout identifiers.
7. Track `payout_status`: pending → paid or failed.
8. Ownership transfer and payment settlement are idempotent and auditable.
9. Failed payouts do not silently disappear; they appear in the operator console.

Atlas 259 now implements **Separate Charges and Transfers** behind a fail-closed feature gate:

- `STRIPE_CONNECT_ENABLED=true` is required before seller onboarding or transfers can execute.
- Sellers use Stripe Express connected accounts with the transfers capability requested.
- Stripe-hosted Account Links collect onboarding requirements.
- Atlas syncs `details_submitted`, transfer capability, payout capability and outstanding requirement count into `seller_payout_profiles`.
- Sellers cannot accept a cash resale offer until the stored account state is transfer-ready.
- A verified resale Checkout webhook records ownership first, then attempts the seller transfer.
- The transfer is tied to the PaymentIntent's latest source charge through `source_transaction`.
- Transfer creation uses a transaction-scoped Stripe idempotency key.
- Payout failures remain on the transaction ledger and can be retried from the operator console.
- Paid transfers can be fully reversed by an operator for a recorded `refund`, `dispute`, or `correction` reason.
- A payout failure never rolls back or duplicates verified ownership settlement.

Repository implementation is not production activation. Stripe Connect must still be enabled for the platform account and certified in a sandbox with a real connected test seller before resale launch.

## Stripe account readiness

An individual / sole-proprietor Stripe account can potentially process the platform's own primary sales when Stripe has approved the account for the activity and the required capabilities are active.

However, Atlas 259 must not go live merely because a Stripe account exists. Before launch verify:

- business/profile information matches Atlas 259
- website/domain is live and accurate
- required Stripe terms are accepted
- identity/business verification is complete
- `charges_enabled = true`
- `payouts_enabled = true` where platform payouts are required
- card-payment capability is active
- Connect/transfers capability is enabled before seller payouts
- statement descriptor/support details are appropriate
- refund policy and customer-support contact are published

Do not commit Stripe account IDs, secret keys, personal addresses, bank details, tax IDs, identity documents or account-specific verification data to this public repository.

## Refunds, disputes and chargebacks

Primary purchase refunds are supported through the operator console.

Repository behavior now covers:

- payout failure persistence and operator retry
- transfer reversal for refund/dispute/correction after a paid seller transfer
- idempotent ownership settlement independent from payout execution

Still required before resale launch certification:

- sandbox evidence for refund before seller transfer
- sandbox evidence for refund after seller transfer + reversal
- negative connected-account balance behavior
- automatic dispute/chargeback event handling
- written ownership policy for a post-settlement refund/dispute
- moderation/takedown refund policy

The registry ledger must never imply that a successful UI state means money has settled unless Stripe confirms the relevant event.

## Taxes and reporting

Before broad marketplace launch, obtain appropriate tax/legal review for:

- sales tax / digital-product treatment
- platform marketplace reporting
- connected-account tax forms
- seller payout reporting
- restricted jurisdictions and sanctions
- consumer refund/disclosure requirements

Atlas 259 should market registry visibility, collecting, sponsorship, identity and discovery — not expected financial returns.


## Connect activation checklist

The Connect code path is deliberately disabled by default.

Before setting `STRIPE_CONNECT_ENABLED=true` in a hosted environment:

1. Complete the Stripe Connect platform profile and verification.
2. Confirm Express connected accounts and transfers are supported for intended seller countries.
3. Configure the hosted Atlas 259 domain and support/business information.
4. Apply database migrations through `0010_stripe_connect_reconciliation.sql`.
5. Create a sandbox seller through the Atlas 259 seller-onboarding UI.
6. Complete Stripe-hosted onboarding and verify `transfers_enabled` is synchronized.
7. Execute a test-mode resale from offer → acceptance → Checkout → signed webhook → ownership transfer → seller transfer.
8. Verify the transaction stores PaymentIntent, source charge, transfer ID and `payout_status=paid`.
9. Exercise operator retry using a controlled failed-transfer case.
10. Exercise a sandbox transfer reversal and verify the reversal ID/audit row.
11. Run browser/mobile UAT and the hosted preview certification workflow.
12. Only then consider enabling the same flow in live mode.

Never enable the flag merely because repository tests are green.
