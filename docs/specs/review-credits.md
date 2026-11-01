Status: active
Domain: billing and coaching
Superseded-by:

# AI coach review credits

## Intended behaviour

- Browser Stockfish analysis remains free and unlimited.
- One successfully generated AI coach review uses one credit. A failed or unavailable generation restores the reserved credit.
- Each account receives one introductory AI review for its lifetime.
- Beta accounts receive 30 AI review credits per month through the expiry stored at onboarding. Expiry never moves when profile settings change.
- An explicit permanent complimentary grant provides 30 AI review credits per month after beta expiry.
- Monthly credits expire at the end of their UTC month. Use order is introductory, beta, permanent complimentary grant, then paid pack.
- A paid pack contains 10 AI reviews for EUR 4.99. Paid credits do not expire.
- Opening a saved review, replaying it, or changing interface language never uses or restores a credit. A saved review is not regenerated on language change.
- Each saved review allows five successfully generated follow-up answers. Failed answers do not count. Saved answers remain accessible.
- Before an AI review, the browser analyses the selected finished game and up to three preceding finished games. It submits those matches in newest-first order. A missing snapshot or failed browser analysis is labelled as a gap; the current game can still be reviewed.
- Stripe-hosted Checkout is opened only through the authenticated same-origin Worker route. The Worker, never the browser redirect, grants paid credits after verifying the paid live-mode webhook.
- Board materials and piece finishes are free to all accounts.
- Unused packs are refunded on request and processed manually. Requests for partly used packs receive individual manual review. Mandatory consumer rights remain in force. An open dispute freezes unused credits from the affected pack.

## Acceptance checks

- [x] Account and coach screens show credit balances and the EUR 4.99 / 10 review pack in en-GB, es-ES and fr-FR.
- [x] Checkout uses the Stripe-hosted URL returned by `POST /api/billing/review-pack/checkout` and validates its origin.
- [x] Browser Stockfish review and saved-review replay work without an AI credit.
- [x] AI generation consumes a credit only after success; retries and concurrent requests cannot spend the same credit twice.
- [x] Saved reviews remain accessible even when they are older than the recent status list or coaching is unavailable.
- [x] Follow-up answers allow at most five successful responses per saved review for every account.
- [x] The browser sends the current match plus up to three earlier finished matches, with `null` analysis for failed prior-game engine runs.
- [x] Every supported material and piece finish can be saved before and after beta expiry.
- [x] Terms and privacy routes describe credit rules, refund/dispute handling and match history sent for AI processing.
- [x] Charging remains disabled until tax, account, support-contact, provider-retention and consumer-disclosure checks pass.

## Decisions

The 2026-11-01 policy replaces the Plus subscription and cosmetic paywall offer. Stripe's hosted checkout stays responsible for payment entry. Older subscription code and records may remain for historical reconciliation; they do not grant coach access or change the current offer. The prior Stripe Plus product is archived. Existing subscriptions are not cancelled by this change.

## Validation

Run `pnpm typecheck`, focused credit/cosmetics/account/coach tests, the targeted Chromium journeys, then the full `pnpm check`. Local tests do not prove a live Checkout session, payment, webhook delivery, tax calculation, legal sufficiency or deployment.

Verified locally on 2026-11-01: TypeScript passed; 305 unit tests across 35 files passed; production build passed; all 44 Chromium journeys passed. Migration 0012 applied locally. Desktop and mobile account screenshots were inspected. The initial `pnpm check` reached a sandbox loopback restriction during local seeding; its browser/build stages subsequently passed through `pnpm test:e2e` with local loopback access. No remote migration, commit, push, deployment or live payment was performed.

## Exclusions

No payment was created. Do not enable charging from this spec alone. The AI model provider and its retention policy, legal contact channel, payment-record retention period, tax readiness and account verification remain release gates.
