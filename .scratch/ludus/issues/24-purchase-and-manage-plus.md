# 24: Purchase and manage Plus

**What to build:** Players explicitly purchase Plus and manage cancellation with correct entitlements.

**Blocked by:** 21: Grant and expire card-free beta Plus; 23: Confirm subscription terms and payment provider.

**Status:** ready-for-agent

- [ ] Provision approved provider and display approved price/tax/renewal terms before explicit checkout consent.
- [ ] Verify billing events and process duplicates/out-of-order delivery safely; derive entitlements from trusted provider events.
- [ ] Support cancellation and agreed renewal/payment-failure behaviour without deleting reviews or restricting free play.
- [ ] Test checkout, spoofed events, duplicate events, cancellation and trial-to-paid transitions. Keep billing secrets server-side.
