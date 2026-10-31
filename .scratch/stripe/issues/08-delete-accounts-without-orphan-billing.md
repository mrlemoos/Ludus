# 08: Delete accounts without orphan billing

Status: ready-for-agent
Workflow: ready
Parent: [Stripe specification](../../ludus/stripe-spec.md)
Blocked by: [02: Resolve remaining billing policies](02-resolve-billing-policies.md), [06: Manage cancellation and renewal](06-manage-cancellation-and-renewal.md)

## What to build

Cancel billing before deleting account data, with retryable pending state and protection against concurrent purchases.

## Acceptance checks

- [ ] Cancel immediately before deletion; provider failure leaves clear pending/retry state without falsely reporting completion.
- [ ] Coordinate deletion with in-flight Checkout and block new purchases while pending.
- [ ] Scheduled cleanup resumes pending cancellation/deletion idempotently.
- [ ] Retain only approved reconciliation linkage; delayed billing events cannot recreate accounts or renew orphan subscriptions.
- [ ] Preserve existing account privacy, match anonymisation and deletion behaviour; localised pending UI remains usable.

## Validation

pnpm typecheck; pnpm test; extend tests/unit/accounts.test.ts and tests/e2e/account.spec.ts; exercise Stripe failure, retry and Checkout/deletion races.

## Context and gates

Cancellation and deletion ordering must use policy 02 retention rules.

[Confirmed plan](../../ludus/stripe-plan.md). [Repository context](../../../context.md). [Domain language](../../../docs/Language.md). [ADR guidance](../../../docs/adr/README.md). No accepted billing ADR yet.


## Local lifecycle delivery, 2026-10-31

Implementation present. Signed provider fixtures, SQLite, injected time and browser checks cover agreed transitions and failure cases. See docs/stripe.md for exact evidence, remaining provider verification and operating limits. No live payment tested; release gates stay closed. Parent remains active.
