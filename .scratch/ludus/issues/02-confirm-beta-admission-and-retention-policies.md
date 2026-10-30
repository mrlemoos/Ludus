# 02: Confirm beta admission and retention policies

**What to build:** Record approved adult admission, operator access and personal-data retention rules before admitting players.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [x] Agree how adults aged 18 and over attest eligibility, how operator identities are authorised, invitation expiry and redemption rules, and how account/data deletion is handled.
- [x] Define initial invitation batch capacity and free-tier usage checks; explicitly account for hard quota failures.
- [x] Record decisions and concrete acceptance examples. Do not invent unresolved product policies.

## Completion wave

Approved implementation policy is recorded in `.scratch/beta-completion/policies.md`. Adult self-attestation, verified operator IDs, seven-day single-redemption invitations, ten-member capacity-confirmed batches and retention/deletion periods are implemented and tested. Operator sends and external capacity still require operational release checks; see `docs/beta-readiness.md`.
