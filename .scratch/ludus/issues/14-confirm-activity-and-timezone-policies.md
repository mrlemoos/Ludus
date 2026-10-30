# 14: Confirm activity and timezone policies

**What to build:** Approve remaining activity eligibility and precise timezone transition semantics.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [x] Preserve credit for completed human/computer games, resignations only after each player has made five moves, and unconditional checkmate/stalemate credit. Exclude aborts and reviews.
- [x] Decide eligibility for other results, including agreed draws and timeouts.
- [x] Define next-day timezone activation precisely across midnight, daylight-saving changes and repeated timezone changes. Attribute games by completion time.
- [x] Record examples that prevent duplicate credit and unintended streak repair.

## Completion wave

Remaining eligibility and timezone semantics are approved in `.scratch/beta-completion/policies.md` and implemented in shared/activity.ts and worker/accounts.ts. Tests cover move thresholds, completion-day attribution, historical zones, next-midnight activation, DST, repeated changes and duplicate credit.
