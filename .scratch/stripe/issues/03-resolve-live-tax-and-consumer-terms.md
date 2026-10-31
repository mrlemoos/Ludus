# 03: Resolve live tax and consumer terms

Status: needs-info
Workflow: ready for investigation; completion gated
Parent: [Stripe specification](../../ludus/stripe-spec.md)
Blocked by: None

## What to build

Verify a workable tax and consumer-terms solution for the existing seller before live charging, independently of sandbox development.

## Acceptance checks

- [ ] Document verified seller/account limitations and an applicable tax calculation/collection solution.
- [ ] Verify required registrations and inclusive EUR 8 treatment; do not equate Stripe limitations with no tax obligation.
- [ ] Verify customer disclosures, statutory cancellation/refund handling and localised terms.
- [ ] Record evidence and remaining human/professional inputs; no invented registrations or legal conclusions.
- [ ] Keep live billing gated; any seller/provider/base-price change requires an explicit decision.

## Validation

Current authoritative tax/provider sources and documented registration evidence. Never enable automatic tax by assumption.

## Context and gates

Stripe Tax registration lookup reports country unsupported. This blocks live charging, not independent sandbox work.

[Confirmed plan](../../ludus/stripe-plan.md). [Repository context](../../../context.md). [Domain language](../../../docs/Language.md). [ADR guidance](../../../docs/adr/README.md). No accepted billing ADR yet.


## Verified account blocker, 2026-10-31

Stripe account read confirms BR/BRL, disabled charges and payouts, inactive card capability and past-due representative-name/address verification. Account activation is now an additional prerequisite to live billing. No identity information changed.
