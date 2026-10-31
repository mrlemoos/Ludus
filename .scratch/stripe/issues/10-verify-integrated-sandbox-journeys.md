# 10: Verify integrated sandbox journeys

Status: ready-for-agent
Workflow: ready
Parent: [Stripe specification](../../ludus/stripe-spec.md)
Blocked by: [07: Handle refunds and disputes](07-handle-refunds-and-disputes.md), [08: Delete accounts without orphan billing](08-delete-accounts-without-orphan-billing.md), [09: Reconcile missed events and outages](09-reconcile-missed-events-and-outages.md)

## What to build

Verify the complete sandbox purchase-to-expiry flow and document release readiness without authorising live activation.

## Acceptance checks

- [ ] Record real sandbox Checkout, beta transition, Portal, signed webhook and recovery evidence.
- [ ] Verify refund/dispute/deletion outcomes, duplicate purchases, missed/out-of-order events and cross-account isolation.
- [ ] Run browser journeys in three launch languages; confirm provider amounts, dates, saved content and free play.
- [ ] Run required regression checks and record exact commands/results and remaining gaps.
- [ ] Keep live charging blocked until 03 and this ticket pass plus separate deployment/live authorisation; never close parent on mocks alone.

## Validation

pnpm typecheck; pnpm test; pnpm test:e2e; real Stripe sandbox evidence and git diff --check.

## Context and gates

03 is a live-release gate, not a prerequisite for sandbox verification.

[Confirmed plan](../../ludus/stripe-plan.md). [Repository context](../../../context.md). [Domain language](../../../docs/Language.md). [ADR guidance](../../../docs/adr/README.md). No accepted billing ADR yet.


## Local evidence, provider verification blocked

Final local verification on 2026-10-31: TypeScript passed; 32 unit files / 279 tests passed; nine targeted Chromium account/billing/coaching journeys passed; production build and local migration 0010 passed; whitespace check passed. Provider activation, real payment/webhook delivery and remote deployment remain unverified.

User superseded sandbox with live mode. Live Stripe account has charges and payouts disabled for past-due verification. No real-charge test attempted. Tax, currency eligibility, retention, runtime credentials and endpoint verification remain open. Parent is not complete.
