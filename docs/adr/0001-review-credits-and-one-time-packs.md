# ADR 0001: AI review credits and one-time packs

Status: accepted
Date: 2026-11-01
Domain: billing and coaching
Spec: [AI coach review credits](../specs/review-credits.md)

## Context

The previous offer coupled subscriptions, capped AI reviews, conversation access and cosmetic materials. The user selected a simpler offer: free unlimited local Stockfish analysis, one introductory AI review, monthly free reviews, and optional one-time paid packs. Coaching cost and provider availability must not interrupt play or remove saved reviews.

## Decision

Use one credit for each successfully generated AI coach review. Give each account one lifetime introductory review, 30 monthly beta reviews until the original beta expiry, and 30 monthly credits after beta only where an explicit permanent complimentary grant exists. Sell ten non-expiring paid reviews for EUR 4.99. Spend introductory, monthly and granted credits before paid credits. Limit each saved review to five successful follow-up answers. Make all board materials and piece finishes free.

Use Stripe-hosted Checkout through an authenticated Worker route. The server grants paid credits only after a verified paid webhook. Leave billing flags disabled until tax, account verification, model-provider privacy, refund contact and consumer disclosures pass. Do not cancel or alter legacy subscriptions as part of this change.

## Alternatives considered

- Keep a monthly Plus subscription: rejected because it bundles usage tiers and cosmetics the product no longer needs.
- Sell credits only, with no monthly allowance: rejected because beta and explicitly granted complimentary reviews are part of the agreed offer.
- Charge for browser Stockfish runs: rejected because those runs are local and should remain unlimited and free.

## Consequences

The account UI must distinguish free monthly balance, introductory access and paid balance. Provider failures must restore a reserved credit. Credit reservation, success, refund and dispute handling need auditable server records. Saved review access must not depend on current credits. Privacy text must explain that the current game and up to three earlier finished games may be analysed in the browser and included in the model request.

The checkout offer is technically provisioned, but charging remains disabled. This decision does not certify tax registration, Stripe account activation, provider data retention, refund operations or the legal wording.

## Evidence

User-confirmed product decision in the 2026-11-01 implementation session. Stripe catalogue readback: product `ludus_coach_reviews_10`, one-time EUR 4.99 (499 cents) price `price_1UWweXBVWchHmktzXDsCNIaA`, inclusive tax behaviour. No Checkout session or charge was created. An independent Luna integration review identified a payment/dispute race and incorrect handling of closed warning disputes. Both were fixed with regression coverage. The parent agent reviewed implementation and policy consistency during delivery.
