# Stripe delivery

Parent: [approved specification](../ludus/stripe-spec.md). Breakdown approved on 2026-10-31. Ticket numbers below are local to this feature.

- [01: Provision Stripe sandbox](issues/01-provision-stripe-sandbox.md). Blocked by: none.
- [02: Resolve remaining billing policies](issues/02-resolve-billing-policies.md). Blocked by: none.
- [03: Resolve live tax and consumer terms](issues/03-resolve-live-tax-and-consumer-terms.md). Blocked by: none.
- [04: Unify Plus access](issues/04-unify-plus-access.md). Blocked by: none.
- [05: Purchase Plus in sandbox](issues/05-purchase-plus-in-sandbox.md). Blocked by: 01, 04.
- [06: Manage cancellation and renewal](issues/06-manage-cancellation-and-renewal.md). Blocked by: 02, 05.
- [07: Handle refunds and disputes](issues/07-handle-refunds-and-disputes.md). Blocked by: 02, 06.
- [08: Delete accounts without orphan billing](issues/08-delete-accounts-without-orphan-billing.md). Blocked by: 02, 06.
- [09: Reconcile missed events and outages](issues/09-reconcile-missed-events-and-outages.md). Blocked by: 06, 07, 08.
- [10: Verify integrated sandbox journeys](issues/10-verify-integrated-sandbox-journeys.md). Blocked by: 07, 08, 09.

Ready independent frontier: investigate 01, 02 and 03; implement 04. User authorisation is required to connect sandbox and resolve commercial/legal policy choices. Those gates do not block 04.

Live release additionally requires 03, integrated sandbox evidence from 10 and separate authorisation. Parent remains active. No commit, push or deployment authorised.

## Progress

04 complete locally: typecheck, 251 tests and whitespace check passed. No paid storage or Stripe endpoint introduced. 01 remains blocked on sandbox authorisation; 02 and 03 remain unresolved policy/tax gates. 05 cannot start until 01 completes. No Stripe objects created.

## Live-mode override

Leo chose live-mode integration, superseding sandbox prerequisites. Live Product, monthly EUR 8 inclusive Price and Portal configuration exist. See [delivery evidence](../../docs/stripe.md). 01 remains partial because currency localisation is unverified. 05 is in progress with a local guarded Checkout/Portal/webhook foundation. Paid access integration, remaining lifecycle slices, runtime secrets and provider verification are incomplete. All charging gates remain disabled.

## Lifecycle delivery update, 2026-10-31

Manual-review policy accepted. 05–09 now have local implementation for purchase/paid access, Portal/status, seven-day grace, invoice-specific refund/dispute handling, deletion-before-cleanup and scheduled/fenced reconciliation. Operator cases and deletion retry UI implemented. Provider/account/tax/currency/retention gates remain; parent active, charging disabled. Read docs/stripe.md for evidence and operating bounds. No subagent, commit, push or deployment.

Final local verification on 2026-10-31: TypeScript passed; 32 unit files / 279 tests passed; nine targeted Chromium account/billing/coaching journeys passed; production build and local migration 0010 passed; whitespace check passed. Provider activation, real payment/webhook delivery and remote deployment remain unverified.

Pre-commit verification: full pnpm check passed on 2026-10-31: TypeScript, 279 unit tests, production build and all 31 Chromium journeys, including 3D/mobile and two-session multiplayer. No premium grants, push or deployment performed.
