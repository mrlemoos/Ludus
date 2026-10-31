# 06: Manage cancellation and renewal

Status: ready-for-agent
Workflow: ready
Parent: [Stripe specification](../../ludus/stripe-spec.md)
Blocked by: [02: Resolve remaining billing policies](02-resolve-billing-policies.md), [05: Purchase Plus in sandbox](05-purchase-plus-in-sandbox.md)

## What to build

Deliver owner-only Portal/status UI and renewal recovery with reliable server-side grace expiry.

## Acceptance checks

- [ ] Portal updates payment details and cancels renewal without cross-account access.
- [ ] Cancellation retains paid access to exact paid end; pre-first-charge cancellation prevents charge and preserves beta.
- [ ] Failed first payment has no renewal grace; failed renewal after prior paid period sets seven days from due time.
- [ ] Recovery before expiry restores current paid access; retries/duplicate failures never extend grace.
- [ ] Server scheduling cancels after seven unpaid days and removes access even during provider outage; returning needs fresh Checkout.
- [ ] Expose correct amount, currency, dates and retry/manage states in all launch languages; review quota never resets on payment.

## Validation

pnpm typecheck; pnpm test; Playwright management states and sandbox Portal/recovery evidence. Inject time across exact expiry and repeated failures.

## Context and gates

Implement policy 02 outcomes, provider-compatible retries and cancellation, preserving free play.

[Confirmed plan](../../ludus/stripe-plan.md). [Repository context](../../../context.md). [Domain language](../../../docs/Language.md). [ADR guidance](../../../docs/adr/README.md). No accepted billing ADR yet.


## Local lifecycle delivery, 2026-10-31

Implementation present. Signed provider fixtures, SQLite, injected time and browser checks cover agreed transitions and failure cases. See docs/stripe.md for exact evidence, remaining provider verification and operating limits. No live payment tested; release gates stay closed. Parent remains active.
