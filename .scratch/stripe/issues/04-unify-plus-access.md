# 04: Unify Plus access

Status: ready-for-agent
Workflow: complete
Parent: [Stripe specification](../../ludus/stripe-spec.md)
Blocked by: None

## What to build

Give coaching and cosmetics one server-side entitlement decision, retaining current beta-only behaviour until trusted billing state is integrated.

## Acceptance checks

- [x] Preserve immutable onboarding expiry and exact-time boundaries.
- [x] Use shared access semantics in coaching and cosmetics; paid, grace and beta sources remain independent.
- [x] Provide a compatible trusted-state contract for later billing integration; no client-writable access or unprovisioned payment endpoint.
- [x] Keep UTC monthly review usage, reply limits and failed-generation accounting unchanged.
- [x] Preserve saved content, free play and premium fallback when access expires; cover both consumers.

## Validation

pnpm typecheck; pnpm test. Extend tests/unit/coaching.test.ts, coach-api.test.ts and cosmetics.test.ts using injected time and existing API seams.

## Context and gates

Independent compatible preparatory slice; provider persistence and writes belong to 05 onward.

[Confirmed plan](../../ludus/stripe-plan.md). [Repository context](../../../context.md). [Domain language](../../../docs/Language.md). [ADR guidance](../../../docs/adr/README.md). No accepted billing ADR yet.


## Completion evidence

2026-10-31: shared/plus.ts now owns access semantics. Coaching uses the trusted account contract; cosmetics uses the same resolver for its existing beta state. shared/coaching.ts retains its compatible beta helper. Paid persistence, grace computation and Stripe writes remain in dependent tickets.

Passed pnpm typecheck and pnpm test: 31 files, 251 tests. git diff --check passed. Tests cover independent beta access, paid expiry/suspension, unchanged monthly usage and cosmetic fallback at exact expiry. Browser/Stripe journeys were not run for this preparatory slice. No commit, push or deployment.
