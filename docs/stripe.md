# Stripe billing

## Complimentary Plus

Explicitly granted accounts can receive Plus with no expiry and no Stripe subscription. Grants are stored by normalised email in `complimentary_plus`; only verified ownership unlocks them. A pending recipient still completes email sign-in, age confirmation and onboarding normally. The original beta expiry remains unchanged. Standard Plus review/conversation limits apply.

After applying migrations and deploying the matching Worker, grant access with:

```sh
node scripts/grant-plus.ts --remote player@example.test
```

Use `--local` for development. The script grants access and creates/refreshes the invitation without sending email, creating a session, marking email verified or fabricating onboarding. An active grant keeps that invitation redeemable after its usual expiry. Revoking the grant removes permanent Plus; remaining beta/paid access remains independent. Account deletion removes the grant. Paid Checkout is blocked while complimentary Plus is active; an existing subscription is never silently changed.

## Current delivery

Live catalogue and local purchase, paid access, renewal grace, refunds/disputes, deletion cancellation and scheduled reconciliation are implemented. Charging remains disabled by default. Provider journey verification, account activation, tax/consumer terms, retention policy and currency eligibility remain release gates. Local checks do not prove a complete live integration.

Leo explicitly replaced the separate-sandbox requirement with live-mode development on 2026-10-31. Local mocks and signed fixtures do not prove actual live payments. Never use test card numbers against live Stripe or create real charges as an automated check.

## Provisioned live resources

Created through the connected Stripe plugin in account `acct_1UWNJpBVWchHmktz`:

| Resource | ID | Verified settings |
| --- | --- | --- |
| Product | `ludus_plus` | Ludus Plus, service |
| Price | `price_1UWeBDBVWchHmktzPeGqPM30` | EUR 800 cents, monthly, inclusive tax behaviour |
| Portal configuration | `bpc_1UWeBnBVWchHmktzjD7skdf0` | Payment method updates, invoice history, cancellation at period end, no prorated refund |

These identifiers are configuration, not credentials. Localised currency conversion remains subject to verified account settlement and Adaptive Pricing eligibility. Inclusive Price configuration does not establish tax registration, calculation or collection.

## Runtime configuration

Store `STRIPE_API_KEY` as a Cloudflare Worker secret. Use a restricted live key with only the required customer, Checkout, Portal, subscription and invoice permissions. Never store keys in source, public frontend variables or this document.

Store `STRIPE_WEBHOOK_SECRET` as a separate Worker secret for the deployed endpoint. No endpoint or runtime key has been provisioned by this change. A connected Stripe plugin does not supply the Worker with credentials.

The application requires all three configuration values to equal `true` before allowing a new purchase. Existing customers can still open Portal when new purchases are disabled:

- `STRIPE_BILLING_ENABLED`
- `STRIPE_TAX_READY`
- `STRIPE_LIFECYCLE_READY`

Leave them unset until evidence supports activation. Flags are release gates, not proof of readiness. Do not enable them to bypass outstanding implementation or legal/tax decisions.

Stripe SDK is pinned to `23.1.0`, API to `2026-10-28.endive`. The server uses the SDK Fetch HTTP client and asynchronous Web Crypto signature verification.

## Routes and event processing

- Authenticated `GET /api/billing` returns release availability, the EUR base price and stored subscription snapshot.
- Authenticated, same-origin `POST /api/billing/checkout` and `/api/billing/portal` return account-owned hosted URLs. Server selects catalogue and return URLs.
- `POST /api/billing/webhook` verifies the bounded original body and signature without browser session/Origin requirements. Test-mode events are rejected. Successful events are durably identified, and incomplete events remain retryable.
- Handled lifecycle events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`.
- Handled risk events: `charge.refunded`, `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`, `radar.early_fraud_warning.created`.
- Endpoint registration and real provider delivery have not been verified. Do not treat local signed fixtures as live proof.

An account lease serialises purchase/reconciliation work. Checkout retries reuse immutable parameters and provider idempotency keys. Uncertain creations older than 23 hours require reconciliation rather than risking a fresh purchase after Stripe forgets an idempotency key.

Webhooks resolve customer ownership through the local Stripe customer mapping and fetch current provider state. Unrelated business customers never become Ludus accounts. Positive paid periods for the approved Price grant access through a shared server-side check in coaching and cosmetics. Account deletion tombstones block paid access. Beta access remains independent.

## Beta timing

Preserve onboarding's original expiry. Use exact `trial_end` when at least 49 hours remain, leaving margin above Checkout's 48-hour minimum. For shorter remainders, set the billing cycle anchor to beta expiry with `proration_behavior: none`; the initial period is free. Round milliseconds upwards to provider seconds so no first charge precedes beta expiry.

This supports purchase throughout beta, including the final hour. Sessions completed after their anchor may charge for the period that has started, never before original beta expiry. Provider behaviour still requires verification before activation. See [Stripe billing-cycle documentation](https://docs.stripe.com/payments/checkout/billing-cycle?ui=full-page).

## Local validation

Run `pnpm typecheck`, `pnpm test` and `WRANGLER_LOG_PATH=/tmp/ludus-stripe-wrangler.log pnpm build`. Apply local migrations with the existing seed/migration workflow. Account Playwright coverage checks that disabled billing cannot create Checkout and the account shows its unavailable state.

Do not claim live payment, webhook delivery or deployment from these checks. No live customer, Checkout Session, charge, webhook endpoint or deployment was created during catalogue provisioning.

## Lifecycle and manual review

Leo accepted manual review for late payments, historical refunds, overlapping payment risk and fraud warnings on 2026-10-31, preserving newer valid purchases. Cases appear under the authenticated operator billing review section. Marking reviewed changes no money or entitlement; financial actions remain manual in Stripe.

- First-payment failure grants no extra access. Renewal failure after a successful paid period grants seven days from the failed invoice period start. Duplicate/delayed events cannot extend it. Recovery inside grace restores current paid access.
- At the exact deadline, request-time access checks remove grace. Provider cancellation intent is persisted before cancellation I/O; outages cannot extend access. Scheduled work retries cancellation. Late renewal settlements require manual review and do not restore the cancelled subscription.
- Full refunds revoke the affected paid period; partial refunds preserve it. Disputes suspend the affected period until won. Older refunds never remove a newer valid purchase. Invoice Payments resolve risk through payment/charge relationships; metadata is not the ownership boundary.
- Deletion creates a tombstone before provider calls. Pending deletion permits account-status/retry only, blocks play/purchases, and preserves the original session until billing cancellation succeeds. Open Checkout sessions are expired and subscriptions cancelled before private account cleanup. The original sessions are then revoked.
- Minimal customer/subscription/invoice/event linkage remains for reconciliation of delayed events. No email, name, address, card data or webhook body is copied into billing tables. Exact retention duration still requires verification before release; indefinite retention has not been agreed.

The Worker schedules reconciliation every five minutes, oldest-first in batches of ten, independently from daily personal-data purging. Each account failure is isolated and queued for operator review. Request-time access expiry is exact; cancellation delivery can lag during outages or backlog. Monitor backlog before inviting users. See [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/).

Lease fencing prevents an expired worker from overwriting a newer owner. Uncertain Checkout creates are recovered by their durable attempt reference; new attempts require a completed provider lookup. Uncertain customer creation older than the provider idempotency window requires operator review, never a duplicate customer create. Histories exceeding the bounded 100-item provider reads also require review rather than silently ignoring data. These operating limits must be checked against beta capacity before release.

## Verified account blockers, 2026-10-31

Read through the Stripe plugin: country BR, default currency BRL, charges disabled, payouts disabled, card capability inactive, requirements past due. Stripe lists failed verification for the representative name and address. Resolve these in the business Stripe Dashboard; no identity details were changed here.

Stripe Tax lookup reports country unsupported. EUR Price creation does not prove EUR settlement or Adaptive Pricing eligibility. Checkout requests Adaptive Pricing for eligible sessions, but conversion remains unverified for this account. Tax readiness, account activation, currency eligibility, consumer disclosures, billing-record retention, Worker secrets, webhook registration and real provider journeys must pass before enabling charging.

## Local evidence

Typecheck, unit suite, production build and local migrations run during implementation. Nine Chromium journeys passed for account changes, unavailable Checkout, billing/grace/management in en-GB/es-ES/fr-FR, deletion retry and saved coaching during model outage. Billing-specific browser states use mocked API responses; the unavailable-purchase journey reaches the real local Worker. No real payment, remote migration, webhook endpoint, commit, push or deployment performed.

Final local verification on 2026-10-31: TypeScript passed; 32 unit files / 279 tests passed; nine targeted Chromium account/billing/coaching journeys passed; production build and local migration 0010 passed; whitespace check passed. Provider activation, real payment/webhook delivery and remote deployment remain unverified.

Pre-commit verification: full pnpm check passed on 2026-10-31: TypeScript, 279 unit tests, production build and all 31 Chromium journeys, including 3D/mobile and two-session multiplayer. No premium grants, push or deployment performed.

Complimentary-grant activation on 2026-10-31: migration 0011 applied to production, Worker version 1f197d17-99ed-4c45-ab6d-9240f4b9ee57 deployed, and exactly three requested email grants read back with revoked_at NULL. No fabricated onboarding or Stripe subscriptions. Paid Checkout gates explicitly set false. Validation passed: TypeScript, 283 unit tests, production build and all 32 Chromium journeys. Grant-specific code remains uncommitted; no push performed.
