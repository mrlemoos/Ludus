# 07: Handle refunds and disputes

Status: ready-for-agent
Workflow: ready
Parent: [Stripe specification](../../ludus/stripe-spec.md)
Blocked by: [02: Resolve remaining billing policies](02-resolve-billing-policies.md), [06: Manage cancellation and renewal](06-manage-cancellation-and-renewal.md)

## What to build

Apply trusted refund/dispute events to the affected paid entitlement without removing independent beta or newer valid access.

## Acceptance checks

- [ ] Full refund revokes affected paid access; partial refund preserves it.
- [ ] Open dispute suspends affected paid access; win restores only a still-valid underlying entitlement.
- [ ] Apply approved historical/overlapping invoice rules; delayed payment events cannot reverse revocation.
- [ ] Implement approved early fraud-warning response and subscribe only to handled event types.
- [ ] Manual refund policy remains; preserve beta, saved content, free play and quota history.

## Validation

pnpm typecheck; pnpm test; sandbox signed refund/dispute fixtures or supported test events with invoice ownership and ordering evidence.

## Context and gates

Provider payload fixtures alone do not prove actual funds movement.

[Confirmed plan](../../ludus/stripe-plan.md). [Repository context](../../../context.md). [Domain language](../../../docs/Language.md). [ADR guidance](../../../docs/adr/README.md). No accepted billing ADR yet.


## Local lifecycle delivery, 2026-10-31

Implementation present. Signed provider fixtures, SQLite, injected time and browser checks cover agreed transitions and failure cases. See docs/stripe.md for exact evidence, remaining provider verification and operating limits. No live payment tested; release gates stay closed. Parent remains active.
