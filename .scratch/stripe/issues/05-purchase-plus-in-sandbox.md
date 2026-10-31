# 05: Purchase Plus in sandbox

Status: ready-for-agent
Workflow: claimed
Parent: [Stripe specification](../../ludus/stripe-spec.md)
Blocked by: [01: Provision Stripe sandbox](01-provision-stripe-sandbox.md), [04: Unify Plus access](04-unify-plus-access.md)

## What to build

Deliver authenticated sandbox Checkout and first-payment entitlements across UI, Worker API, D1 migrations and verified provider events.

## Acceptance checks

- [ ] Server selects approved sandbox price/customer; authenticate ownership, bound input and prevent cross-account access.
- [ ] Prevent duplicate subscriptions and concurrent Checkout purchases with durable/idempotent coordination.
- [ ] Preserve beta expiry and explicitly schedule first charge after remaining days; no purchase means no charge.
- [ ] Require trusted first-payment confirmation after beta; redirects, pending payment and failed first payment grant no paid access.
- [ ] Verify raw-body webhook signatures and environment; durable event idempotency and current-state reconciliation reject stale/forged ownership.
- [ ] Display actual provider-confirmed price/currency and purchase status in en-GB/es-ES/fr-FR; keep public/live checkout disabled.

## Validation

pnpm typecheck; pnpm test; targeted Playwright purchase journey; real sandbox Checkout plus signed event evidence. Mocked results are not provider proof.

## Context and gates

Do not enable general sandbox purchases until required lifecycle, risk and deletion protection are delivered.

[Confirmed plan](../../ludus/stripe-plan.md). [Repository context](../../../context.md). [Domain language](../../../docs/Language.md). [ADR guidance](../../../docs/adr/README.md). No accepted billing ADR yet.


## Live-mode implementation update

User superseded sandbox with live mode. Local Checkout, Portal, signed webhooks, immutable create retries, customer ownership and invoice snapshots are implemented. Account billing UI supports all three launch languages. Live catalogue IDs are recorded in docs/stripe.md. This ticket remains incomplete: live credentials/endpoint, provider evidence, localisation eligibility and trusted paid access integration are outstanding. Never activate while lifecycle/risk/deletion slices remain incomplete.

## Validation evidence, 2026-10-31

Passed pnpm typecheck, 262 unit tests across 32 files, production build, local migration/seed and Chromium account journey. Browser journey proves unavailable-state display and server-side purchase blocking; no live Stripe customer/payment or provider webhook delivery was exercised. Initial sandboxed dependency relocation failed on network access; locked dependencies restored and browser checks passed with authorised local execution. git diff --check passed.

## Local lifecycle delivery, 2026-10-31

Implementation present. Signed provider fixtures, SQLite, injected time and browser checks cover agreed transitions and failure cases. See docs/stripe.md for exact evidence, remaining provider verification and operating limits. No live payment tested; release gates stay closed. Parent remains active.
