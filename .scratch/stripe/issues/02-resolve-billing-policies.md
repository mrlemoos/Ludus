# 02: Resolve remaining billing policies

Status: needs-info
Workflow: ready for investigation; completion gated
Parent: [Stripe specification](../../ludus/stripe-spec.md)
Blocked by: None

## What to build

Resolve policy gates for safe invoice-specific state transitions and deletion before dependent implementation. Propose a billing ADR without presenting unresolved choices as accepted.

## Acceptance checks

- [ ] Obtain explicit decisions for late settlement after cancellation, historical full refunds and overlapping disputed/refunded invoices.
- [ ] Agree early fraud-warning response; no automatic account sanctions assumed.
- [ ] Agree retained billing linkage, retention duration and deletion treatment.
- [ ] Document cancellation retry and recovery outcomes with exact event-order examples.
- [ ] Recommend scoped Luna review of spec/provider evidence; spawn only if authorised. Record approved decisions and link ADR.

## Validation

Review every unresolved policy against parent spec; deterministic event examples for dependent tests. Research is not user approval.

## Context and gates

Ready for research, but policy closure requires Leo. Do not silently invent commercial behaviour.

[Confirmed plan](../../ludus/stripe-plan.md). [Repository context](../../../context.md). [Domain language](../../../docs/Language.md). [ADR guidance](../../../docs/adr/README.md). No accepted billing ADR yet.


## Accepted policy, 2026-10-31

Leo accepted manual review for late payments, historical refunds, overlapping disputes and fraud warnings, preserving newer valid access. Core dependent behaviour implemented. Exact retention duration and verified consumer/tax terms remain release gates. Scoped Luna review recommended earlier; no delegation authorised or performed.
