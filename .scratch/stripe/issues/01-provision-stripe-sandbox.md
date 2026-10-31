# 01: Provision Stripe sandbox

Status: needs-info
Workflow: ready for investigation; completion gated
Parent: [Stripe specification](../../ludus/stripe-spec.md)
Blocked by: None

## What to build

Connect a separate sandbox, verify currency and Adaptive Pricing eligibility, then provision the approved monthly Product/Price and Portal configuration through the Stripe plugin.

## Acceptance checks

- [ ] Refresh connected account inventory and positively identify sandbox mode; never switch live context silently.
- [ ] Verify EUR settlement/localisation support; unsupported choices return to Leo before catalogue creation.
- [ ] Create or reuse exactly one approved Ludus Plus monthly EUR 8 inclusive-tax Price and Product; record sandbox IDs without secrets.
- [ ] Configure and verify Portal cancellation/payment management and beta timing compatibility.
- [ ] Record environment/secret requirements without exposing credentials; paid checkout remains disabled.

## Validation

Stripe plugin inventory and read-back of Product, Price and Portal configuration; current official documentation. No live writes.

## Context and gates

Only the live account remains connected on 2026-10-31. Requires user-side sandbox authorisation.

[Confirmed plan](../../ludus/stripe-plan.md). [Repository context](../../../context.md). [Domain language](../../../docs/Language.md). [ADR guidance](../../../docs/adr/README.md). No accepted billing ADR yet.


## User override and provisioning evidence, 2026-10-31

User chose live mode instead of sandbox. Stripe plugin created Product ludus_plus with default monthly inclusive EUR 800-cent Price price_1UWeBDBVWchHmktzPeGqPM30, and Portal configuration bpc_1UWeBnBVWchHmktzjD7skdf0. Live Price read-back confirmed amount, interval, tax behaviour and mode. No customer, Checkout Session or charge created. Currency localisation, runtime credentials and provider journey verification remain open. See docs/stripe.md.
