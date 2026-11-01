# Beta readiness

Implementation policies were approved on 30 October 2026 in `.scratch/beta-completion/policies.md`. This page separates implemented behaviour from release evidence that is still missing.

The 2026-11-01 review-pack policy supersedes this page's earlier Plus wording. See `specs/review-credits.md` and `stripe.md` for the current offer and billing gates.

## Implemented

- Invitation-gated magic-link authentication, adult attestation, onboarding and immutable 30-day card-free Plus.
- Verified operator allowlist, private waitlist, ten-member invitation preview/send batches, stable retry identifiers, seven-day expiry and explicit reissue.
- Computer games with four explicit provisional strengths, advisory recommendations, authoritative moves/clocks, 2D/3D, finished replay/alternative branches and PGN.
- Casual friend games, public casual queues, atomic assignment/cancel and cross-mode computer reservations. Explicit computer offer after 30 seconds, never disguised as human.
- Per-player cumulative 60-second disconnect allowance, draw offers/claims, automatic fivefold/75-move draws, resign/abort, preset phrases/mute and reports for manual operator review.
- Separate Glicko-2 rating storage/update infrastructure and idempotent results. Rated entry is disabled while the exact timeout gate below remains unresolved.
- Public usernames and separate provisional ranks, private profile settings, timezone history, completion-day activity/streaks and API-enforced activity hiding.
- Private post-game browser engine analysis, review/conversation storage, language preservation, legal-line validation, four teaching profiles, quotas and spending reservations. Engine analysis/replay/saved text work during model outage.
- Paid model adapter and evaluation-report gate. Without a configured, evaluated model, generation shows unavailable and consumes no player allowance.
- Original premium board materials/finishes with server entitlement checks and free downgrade fallback.
- Account/session revocation, retryable deletion, durable match anonymisation, private-content erasure and scheduled retention cleanup.

## Remaining release gates

| Gate | Current state |
| --- | --- |
| Rated timeout rules | Material checks cover known insufficient-material classes. General possible-mate reachability, including blocked/forced-line dead positions, is not proved. `RATED_ENABLED=false` rejects rated entry server-side. No ranked beta admission until this is resolved. |
| Coach selection | No measured candidate evaluation or provider credentials. The 40-position, four-profile, three-language harness requires 480 reviewed observations. Synthetic unit evidence does not select a model. |
| Mobile acceptance | iPhone 13/Safari and Pixel 6/Chrome actual-device FPS/input/strength measurements remain absent. See `mobile-validation.md`. |
| Final artwork | Original procedural café/set and materials implemented. Final realistic art acceptance remains for visual review. |
| Operational release | Production email sender/secrets, provider costs, Cloudflare/Resend capacity and actual live workflows need validation before inviting batches. No production invitation was sent by this implementation. |
| Billing | Stripe-hosted one-time review packs are provisioned, but charging remains disabled. Account verification, tax, published controller/contact details, Checkout terms/privacy URLs, AI-provider retention disclosures, refund operation and exact payment-record retention still need review. No card is needed for beta access. |

See `coaching.md`, `assets.md`, `development.md` and `deployment.md` for exact configuration and validation boundaries. A local commit is not a deployment or a decision to admit players.

## Local verification

TypeScript check, 246 unit tests across 30 files and all 27 serial Chromium journeys passed. After the last account presentation changes, the production build and three focused account/two-account browser journeys also passed. Fresh-schema upgrades and populated-player retention are unit tested; Drizzle reports no schema drift. Desktop/mobile account screenshots were inspected and the 390 px view has no page overflow. These results do not establish hardware FPS, model quality, email delivery or production deployment.
