# Stripe integration plan

## Delivery override, 2026-10-31

Leo explicitly chose live-mode integration instead of creating a sandbox. This supersedes sandbox prerequisites below. Purchase throughout beta remains required, including the final 48 hours; use the documented billing-anchor/no-proration path for short remainders. Tax and unfinished lifecycle gates still block charging. Catalogue provisioned through the Stripe plugin; see [current delivery evidence](../../docs/stripe.md). No deployment or charge authorised by this override.


Confirmed with Leo on 2026-10-31. Implementation authorised; no commit, push or deployment authorised.

## Commercial terms

- Existing MRLEMOOS business account, separate sandbox for development.
- One Ludus Plus product, monthly EUR 8 base price, displayed including applicable tax.
- Local currency conversion through Adaptive Pricing, subject to account and settlement eligibility. No regional affordability discounts agreed.
- Stripe-hosted Checkout and Customer Portal.
- Explicit purchase during beta authorises recurring billing after remaining card-free days. Without purchase, never charge. Preserve the original beta expiry.
- Cancellation stops renewal, retaining access through the paid period.
- First payment failure grants no extra access after beta expiry.
- Failed renewal grants seven days of Plus from renewal due time. Cancel subscription and downgrade after seven unpaid days. Fresh checkout required to return.
- Review quotas retain UTC calendar-month accounting. Purchase unlocks 30 minus existing monthly usage; billing renewal does not reset quotas.
- Manual refunds, subject to mandatory consumer rights. No automatic prorated cancellation refunds.
- Full refund revokes paid access; partial refunds preserve it. Disputes suspend paid access; a win restores access only if entitlement remains valid.
- Preserve remaining beta access, saved reviews/conversations and free play on paid-access loss.
- Account deletion cancels billing immediately before deletion. Failed cancellation leaves deletion pending and retryable.

## Implementation and validation

- Shared server-side entitlement checks for coaching and cosmetics, combining independent beta and paid entitlement sources.
- Server-created authenticated Checkout and Portal sessions; prevent duplicate subscriptions and concurrent checkout purchases.
- Signed webhooks, durable idempotency, safe handling of duplicates and out-of-order events, reconciliation against current provider state.
- Cover purchase, beta-to-paid transition, first-payment failure, renewal recovery and seven-day expiry, cancellation, refunds, disputes, deletion and spoofed events.
- Keep keys server-side. No access granted solely from a Checkout redirect.
- Provision sandbox product and price through connected Stripe plugin before dependent implementation.
- Sandbox integration and tests precede live provisioning and deployment.

## Outstanding provisioning gates

- Only live account acct_1UWNJpBVWchHmktz currently connected. Sandbox access must be added through Stripe authorisation, then account inventory refreshed.
- Currency settlement and Adaptive Pricing eligibility unverified. EUR base currency may need reconsideration if unsupported for settlement/conversion.
- Live Stripe Tax registration lookup returned: "Stripe Tax isn't yet supported for your country." This is not proof of no tax obligations or no external registrations.
- Live charging blocked until tax obligations, calculation/collection solution and required registrations are verified. Do not enable automatic tax on assumptions.
- No product or price created in this session.

## Accepted policy clarification, 2026-10-31

Leo accepted manual review for late settlements, historical refunds, overlapping disputes and fraud warnings, preserving newer valid access. Exact billing-record retention duration remains a release gate. Local lifecycle implementation and validation evidence are in docs/stripe.md. Provider/account/tax activation is not complete.
