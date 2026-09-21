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

For a marketplace where the platform receives the charge first and may need controlled settlement timing, evaluate **Separate Charges and Transfers** as the default implementation. Final charge type should be confirmed against the production Connect configuration and supported seller countries before launch.

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

Before resale launch, add explicit behavior for:

- refund before seller transfer
- refund after seller transfer
- negative connected-account balance
- dispute/chargeback after transfer
- transfer reversal where supported
- payout failure
- ownership rollback policy
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
