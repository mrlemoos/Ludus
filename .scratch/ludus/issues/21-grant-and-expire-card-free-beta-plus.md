# 21: Grant and expire card-free beta Plus

**What to build:** Beta participants receive 30 days of Plus and return to free limits without a charge.

**Blocked by:** 03: Invite and onboard beta players; 20: Generate private engine-grounded reviews.

**Status:** ready-for-agent

- [x] Create idempotent beta trial entitlement with agreed start/expiry policy and 30 monthly reviews under approved quota semantics.
- [x] After expiry apply free limits while preserving generated reviews and unlimited human/computer play.
- [x] Require a separate explicit purchase before any charge; no card is required for beta activation.
- [x] Test expiry boundaries, repeated activation, quota transitions and private review access after downgrade.

## Completion wave

Implemented immutable first-onboarding +30-day card-free Plus. UTC quotas are thirty while active and three after expiry minus same-month successful reviews. Saved reviews/conversations remain accessible; failed generation consumes no player allowance. Unit tests cover exact expiry, repeated onboarding and downgrade. No payment method or automatic charge exists.
