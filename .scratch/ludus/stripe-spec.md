# Purchase and manage Ludus Plus through Stripe

## Delivery override, 2026-10-31

Leo explicitly chose live-mode integration instead of creating a sandbox. This supersedes sandbox prerequisites below. Purchase throughout beta remains required, including the final 48 hours; use the documented billing-anchor/no-proration path for short remainders. Tax and unfinished lifecycle gates still block charging. Catalogue provisioned through the Stripe plugin; see [current delivery evidence](../../docs/stripe.md). No deployment or charge authorised by this override.


Status: active
Owner: Ludus
Domain: subscriptions and Plus access
Decision date: 2026-10-31
Source: [confirmed plan](stripe-plan.md)
Related ADRs: none accepted for billing
Related tickets: [23, commercial terms](issues/23-confirm-subscription-terms-and-payment-provider.md), [24, paid Plus](issues/24-purchase-and-manage-plus.md), [21, beta Plus](issues/21-grant-and-expire-card-free-beta-plus.md)

## Problem

Players currently receive Plus only through an immutable 30-day onboarding grant. Coaching uses `shared/coaching.ts` and `worker/coach.ts`; cosmetics independently checks beta expiry in `worker/cosmetics.ts`. Account deletion in `worker/accounts.ts` has no payment-provider cancellation step. Paid checkout is deliberately disabled.

Add an explicit monthly purchase and self-service management without charging card-free beta participants automatically, losing saved content, or trusting browser payment claims.

## Intended behaviour

### Purchase and pricing

- Use the existing MRLEMOOS business Stripe account, with a separate sandbox for development.
- Sell one Ludus Plus product at EUR 8 per month. Display prices including applicable tax. No annual plan or regional affordability discounts.
- Localise currency through Stripe Adaptive Pricing where account, settlement currency and subscription support permit. This is currency conversion, not country-specific discounts. Eligibility is a provisioning gate; do not silently change the agreed EUR base or invent fallback prices.
- Use Stripe-hosted Checkout and Customer Portal. Purchases belong to authenticated accounts and require explicit recurring-payment consent.
- Existing beta access ends at its original expiry. Purchasing during beta authorises the first charge after remaining free days; purchasing after beta requires successful first payment for paid access. No purchase means no charge.
- Show subscription status, amount/currency, next charge or access-end date, and management/retry actions. Preserve en-GB, es-ES and fr-FR interface support. Show provider-confirmed monetary amounts rather than an independently estimated conversion.

### Access and quotas

- Calculate beta and paid access independently, then use one server-side Plus decision across coaching and cosmetics.
- Normal cancellation stops renewal and preserves paid access through the paid period. Cancelling before the scheduled first charge must prevent that charge and preserve the original beta grant.
- First-payment failure grants no access beyond remaining beta days. Seven-day grace applies only to renewal after a successful paid period.
- An unpaid renewal grants seven days of Plus from its renewal due time. Retries and repeated failure events never extend that deadline. Successful recovery before expiry restores normal paid access.
- At seven unpaid days, cancel the subscription and downgrade. Returning requires fresh checkout. Enforce access expiry even if cancellation delivery is temporarily unavailable; reconcile cancellation without granting indefinite access.
- Keep review accounting on UTC calendar months. Plus permits 30 reviews minus the same month's existing usage. Purchase, renewal and grace recovery do not reset usage. Free allows three minus existing usage, never a negative allowance.
- Preserve existing successful-generation accounting, failed-generation refunds of allowance, reply limits and model spending controls.
- Downgrades preserve saved reviews, saved conversation and free play. Premium appearance falls back through existing Free behaviour.

### Refunds, disputes and deletion

- Cancellation does not automatically prorate or refund. Handle refund requests manually and honour mandatory consumer rights.
- Full refund revokes the affected paid access. Partial refund preserves access. Neither removes remaining beta access.
- Suspend affected paid access during a dispute. A dispute win restores access only while the underlying entitlement remains valid. Do not revive cancelled or expired access from an old event.
- Account deletion cancels billing immediately before deleting account data. A failed provider cancellation leaves deletion pending and retryable, with a clear user-visible state. Prevent concurrent purchases during pending deletion.
- Retain sufficient reconciliation linkage to handle delayed billing events without recreating a deleted account. Exact billing-record retention remains unresolved.

## Acceptance checks

- [ ] An authenticated player can complete sandbox Checkout, view correct account-owned status and open Portal. Other users cannot manage that subscription.
- [ ] Concurrent purchase requests, repeated redirects and retries cannot create multiple subscriptions or scheduled charges for one player.
- [ ] No card-free beta participant is charged without a separate explicit purchase. Repeated onboarding and purchases never restart the beta grant.
- [ ] Purchase during beta leaves expiry unchanged and schedules first payment after remaining free days; cancellation before then prevents payment.
- [ ] Failed initial payment leaves an expired-beta player on Free. A redirect or pending payment alone grants no paid access.
- [ ] Cancellation retains access before paid expiry and removes paid access at exact expiry, without deleting content or disabling free play.
- [ ] Renewal failure sets one seven-day deadline from renewal due time. Duplicate failures and delayed delivery never restart it.
- [ ] Recovery within grace preserves access; unpaid deadline cancels billing and downgrades. Repeated cleanup is safe.
- [ ] Existing UTC-month usage is deducted after purchase, downgrade and recovery. Billing dates do not reset quotas.
- [ ] Full refund removes affected paid access; partial refund does not. Dispute suspension and resolution respect current subscription validity and independent beta access.
- [ ] Deletion with cancellation failure stays pending; retry finishes safely. Checkout cannot race deletion into an orphan subscription.
- [ ] Invalid signatures, replayed events, wrong environments and unrelated customer identifiers cannot grant access.
- [ ] Out-of-order payment, cancellation, refund and dispute events converge to current trusted billing state without reviving expired access.
- [ ] Missed events and temporary Stripe failures can be reconciled. Previously recorded expiry is honoured; existing gameplay and saved content remain available.
- [ ] Billing copy, currency formatting and date display work in all three launch languages.
- [ ] Live charging stays disabled until sandbox evidence and the tax gate are satisfied.

## Implementation decisions and contracts

- TypeScript, existing Worker API and D1/Drizzle persistence. Keep credentials and webhook secrets server-side. Browser-provided price, customer, subscription or entitlement identifiers are not authority.
- Persist account-to-Stripe-customer ownership, subscription identity, relevant period/payment state, scheduled beta transition, grace deadline and deletion/cancellation progress. Exact schema and routes are implementation details.
- Use server-created Checkout and Portal sessions. Validate ownership and allowed catalogue/environment on every request. Use idempotency and durable concurrency control for provider writes and local ownership updates.
- Required webhook processing includes subscription lifecycle, successful/failed invoices, checkout completion/asynchronous success, refunds and disputes. Fraud signals require an explicit response policy before live launch; subscribe only to events acted upon.
- Verify signatures against the original request body. Persist event identity and processing outcome. Avoid marking partially applied effects complete. Resolve Stripe ownership through trusted resource relationships and reconcile current provider state; event arrival order alone is not truth.
- Apply refunds/disputes to their affected payment entitlement rather than indiscriminately invalidating a later valid purchase. Multiple overlapping payment cases remain an explicit policy gate below.
- Expiry and reconciliation need a reliable server-side execution mechanism independent of browser visits. Select the mechanism during implementation; test retry and outage behaviour.
- Provision actual sandbox product/price through the connected Stripe plugin before dependent integration work. Record resulting IDs and mode without secrets. Do not reuse live IDs in sandbox.
- Scope approval does not authorise commit, push, deployment or live charging.

### Event-order examples

| Sequence | Required outcome |
| --- | --- |
| Paid invoice, duplicate paid invoice | One paid period, unchanged quota usage |
| Renewal failed, duplicate failure six days later | Original seven-day deadline remains |
| Failure, successful recovery, stale failure | Current paid state wins; no new grace deadline |
| Cancellation, stale subscription-active notification | No extension beyond confirmed cancelled period |
| Full refund, delayed original payment notification | Refunded access stays revoked |
| Dispute won after paid period expired | No paid access restored |
| Deletion, delayed checkout completion | No account resurrection or orphan renewal |

## Test seam, commands and prior art

The agreed validation covers billing transitions, signed events and browser purchase/management journeys. Reuse existing behavioural seams: Vitest Worker API tests with SQLite and injected time/provider boundaries, plus Playwright authenticated journeys. No new test framework.

Prior art: `tests/unit/coach-api.test.ts`, `tests/unit/coaching.test.ts`, `tests/unit/cosmetics.test.ts`, `tests/unit/accounts.test.ts`, `tests/unit/migrations.test.ts`, `tests/e2e/account.spec.ts` and `tests/e2e/coach.spec.ts`.

- Run `pnpm typecheck` and `pnpm test` for deterministic state, ownership, webhook validation, migration and exact-time boundaries.
- Run `pnpm test:e2e` for app journeys. Mocked provider journeys prove app behaviour only.
- Separately perform real sandbox Checkout/Portal and signed webhook delivery, including lifecycle and recovery scenarios. Record evidence; local mocks do not prove Stripe provisioning or live readiness.
- Check Markdown changes with `git diff --check`. This specification alone does not require application tests.

## Exclusions

- Annual subscriptions, metered billing, regional purchasing-power pricing, discounts, cosmetic purchases and paid rank/streak changes.
- Replacing the card-free onboarding grant with automatic Stripe signup.
- Changes to chess rules, matchmaking, coaching generation or language policy.
- Automatic refunds, tax filings, invented registrations or a silent switch to another seller/payment provider.
- Live provisioning, deployment or charging while gates remain open.

## Unresolved decisions and provisioning gates

1. Only the live business account was connected at planning time. Sandbox creation/connection remains unverified; refresh inventory after user authorisation before provisioning.
2. Settlement currencies and Adaptive Pricing eligibility remain unverified. Unsupported EUR/localisation needs an explicit decision before catalogue creation.
3. Stripe tax-registration lookup returned "Stripe Tax isn't yet supported for your country." This establishes a tooling/product limitation, not absence of obligations or external registrations. Verify an applicable tax solution, registrations and inclusive-price treatment before live charging. Do not assume enabling automatic tax solves this.
4. Exact consumer disclosures, statutory cancellation/refund handling and billing-data retention require verification before live launch.
5. Early fraud-warning response and simultaneous disputes/refunds across multiple invoices require explicit policy before dependent implementation. No automatic account sanctions agreed.
6. Cancellation retries during outages, late settlement after grace cancellation and refunds against historical invoices require documented reconciliation rules. Do not silently restore a cancelled subscription or charge again.
7. Pin supported Stripe SDK/API versions and verify beta-to-paid timing, Portal and currency compatibility against current documentation during implementation.

## Delivery and evidence

Specification active; implementation incomplete. No Stripe product/price creation, application checks, commit, push, deployment or live payment claimed.

Recommended next step: break down independently verifiable provisioning, entitlement/lifecycle, purchase/management and reconciliation/validation slices, retaining their gates. Recommend a billing ADR plus an authorised scoped Luna review of this specification and provider documentation for event-order, beta-transition and tax assumptions before durable architecture is accepted. No subagent authorised or spawned.

## Accepted policy clarification, 2026-10-31

Leo accepted manual review for late settlements, historical refunds, overlapping disputes and fraud warnings, preserving newer valid access. Exact billing-record retention duration remains a release gate. Local lifecycle implementation and validation evidence are in docs/stripe.md. Provider/account/tax activation is not complete.
