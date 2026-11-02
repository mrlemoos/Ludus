# Stripe review packs

## Current offer

The current offer is a one-time pack of 10 AI coach reviews for EUR 4.99. The pack never expires. It does not unlock Plus, cosmetics, or recurring service access. Browser Stockfish analysis remains free and unlimited.

The connected Stripe account readback supplied on 2026-11-01 shows:

| Resource                    | ID                               | Readback                                                |
| --------------------------- | -------------------------------- | ------------------------------------------------------- |
| Product                     | `ludus_coach_reviews_10`         | Active one-time review pack                             |
| Price                       | `price_1UWweXBVWchHmktzXDsCNIaA` | EUR 4.99 (499 cents), one-time, inclusive tax behaviour |
| Former subscription product | `ludus_plus`                     | Archived; recurring offer retired                       |

No Checkout session or charge was created. On 2026-11-01, the repository owner read the live Stripe account's subscriptions using the old monthly Price, `status=all`, `limit=100`; Stripe returned no subscriptions and `has_more=false`. No active Ludus monthly subscriptions exist in that account. Archiving the old product did not cancel or alter any customer subscription. Do not cancel subscriptions as part of this product change.

Stripe may show an inclusive tax behaviour on the Price, but this is not evidence of tax registration, correct tax treatment or collection. The product owner reported that the Stripe account has charges and payouts disabled, card capability inactive and verification requirements past due. Stripe Tax country lookup did not report the country as supported. Confirm current account state and tax treatment before enabling purchases.

## Runtime gates

Store `STRIPE_API_KEY` and `STRIPE_WEBHOOK_SECRET` as separate Cloudflare Worker secrets. Never put them in source or browser variables. A purchase requires all three feature flags to be true and the review-pack Price ID to be configured:

- `STRIPE_BILLING_ENABLED`
- `STRIPE_TAX_READY`
- `STRIPE_LIFECYCLE_READY`

The repository owner confirmed the flags remain false. Leave them false until account verification, tax handling, consumer disclosures, refund operations and payment-data retention are ready. A flag is a release gate, not evidence that a requirement passed.

## Routes and fulfilment

- Authenticated `GET /api/billing` returns the current offer availability and review-credit balance.
- Authenticated, same-origin `POST /api/billing/review-pack/checkout` creates a Stripe-hosted one-time Checkout Session and returns its URL. The Worker fixes the Price, customer, locale and return URLs.
- `POST /api/billing/webhook` validates the bounded original request body and Stripe signature. It rejects test-mode events.
- Paid credits are granted only after the Worker retrieves and verifies a live, completed, paid session, matching customer, currency, amount, Price and quantity. The browser redirect never grants credits.
- Incomplete payment sessions do not grant credits. Checkout retries reuse the durable attempt and provider idempotency key. Uncertain attempts require reconciliation before another attempt.

Handled risk events include full or partial refunds, disputes and early-fraud warnings. A full refund or lost dispute removes unused affected credits. A partial refund or open dispute freezes unused affected credits for manual review. Winning a dispute releases the freeze unless another risk remains. A freeze never reaches credits from another pack.

Unused packs are refunded on request. Refunds are processed manually. Requests for partly used packs receive individual manual review. Preserve mandatory consumer rights. The support contact for these requests must be published before charging is enabled; do not invent an email address. Stripe dispute events also freeze the affected pack's unused balance while the dispute remains open.

## Legacy subscription implementation

Subscription, portal and paid-period code remains for legacy reconciliation and deletion cleanup. It is not the current product offer and does not grant coach credits or premium cosmetics. Do not present Plus pricing or a subscription purchase flow in the app. The old product is archived; no cancellation or customer migration was performed by the review-pack change.

Legacy infrastructure and lifecycle evidence recorded before 2026-11-01 remains in Git history. This file no longer treats that implementation as the active catalogue. The old subscription Price was EUR 800/month and used ID `price_1UWeBDBVWchHmktzPeGqPM30`; the portal configuration was `bpc_1UWeBnBVWchHmktzjD7skdf0`. These resources are historical and must not be used for new purchases.

## Validation boundary

Local verification on 2026-11-01 passed: TypeScript, 305 unit tests, production build, local migration 0012 and all 44 Chromium journeys. Hosted Checkout navigation uses a browser fixture; payment and webhook tests use mocked provider responses and signed fixtures. Stripe catalogue configuration and readback are live; no live Checkout Session or charge was created. No commit, push, remote migration or deployment was performed.

Mocked local tests can check route authentication, idempotency, webhook validation and credit updates. They do not prove live Checkout, a real payment, live webhook delivery, tax calculation, consumer-law compliance or deployment. Never use test card details against live mode or create an automated live charge.

Before charging, verify account activation and permissions in Stripe, webhook registration and delivery, tax treatment, checkout disclosures, refund and dispute operation, privacy disclosures for the chosen AI provider, and the precise retention period for payment records. Set the Stripe Dashboard Terms of Service URL to `https://ludus.mrlemoos.dev/terms` and the privacy URL to `https://ludus.mrlemoos.dev/privacy` only after the registered controller identity/address and contact details have been added and verified. Current live customer, Checkout, charge and webhook delivery remain unverified.
