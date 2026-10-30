# 18: Confirm teaching profiles and review accounting

**What to build:** Approve teaching profiles, allowance rules and evaluation thresholds before coaching implementation.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [x] Define four vocabulary/depth profiles independently of computer strength and player-approved level-change suggestions.
- [x] Define monthly quota period/reset, beta trial interaction, retry/concurrency accounting and conversation limits. Failed generation consumes no allowance; saved reviews stay accessible.
- [x] Set multilingual accuracy, explanation quality, uncertainty and cost acceptance thresholds for one coach model, plus a spending cap.
- [x] Define permitted retention and handling of coach requests and client-supplied analysis; do not treat legal variations as proof of accurate evaluation.

## Completion wave

Four profiles, UTC monthly allowances, trial downgrade, successful-generation accounting, retry reservations, conversation limits, retention and model/cost thresholds are approved in `.scratch/beta-completion/policies.md`. Implementation and evaluation protocol are documented in `docs/coaching.md`; actual model selection remains ticket19.
