# 09: Reconcile missed events and outages

Status: ready-for-agent
Workflow: ready
Parent: [Stripe specification](../../ludus/stripe-spec.md)
Blocked by: [06: Manage cancellation and renewal](06-manage-cancellation-and-renewal.md), [07: Handle refunds and disputes](07-handle-refunds-and-disputes.md), [08: Delete accounts without orphan billing](08-delete-accounts-without-orphan-billing.md)

## What to build

Converge billing/access after missed events, partial local failures and Stripe outages without requiring browser visits.

## Acceptance checks

- [ ] Reliable scheduled reconciliation repairs missed lifecycle, payment and risk transitions from provider state.
- [ ] Retry interrupted processing/cancellation without duplicate charges or extending access beyond stored expiry.
- [ ] Enforce approved late-settlement rules and never silently revive cancelled or deleted subscriptions.
- [ ] Prove parent event-order examples across duplicate, stale and concurrent delivery.
- [ ] Record actionable failures without secrets; gameplay and saved content remain available during Stripe outages.

## Validation

pnpm typecheck; pnpm test; scheduled-handler integration tests with SQLite, injected time/provider failures and crash/retry scenarios.

## Context and gates

Reuse existing Worker scheduled execution where suitable; ensure billing failure cannot starve unrelated account cleanup.

[Confirmed plan](../../ludus/stripe-plan.md). [Repository context](../../../context.md). [Domain language](../../../docs/Language.md). [ADR guidance](../../../docs/adr/README.md). No accepted billing ADR yet.


## Local lifecycle delivery, 2026-10-31

Implementation present. Signed provider fixtures, SQLite, injected time and browser checks cover agreed transitions and failure cases. See docs/stripe.md for exact evidence, remaining provider verification and operating limits. No live payment tested; release gates stay closed. Parent remains active.
