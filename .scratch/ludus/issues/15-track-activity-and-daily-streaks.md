# 15: Track activity and daily streaks

**What to build:** Players see eligible completed games in an activity grid and daily streak in their chosen timezone.

**Blocked by:** 05: Complete a timed computer match in 2D; 14: Confirm activity and timezone policies.

**Status:** ready-for-agent

- [x] Apply approved eligibility to human and computer results, attributing completion date and granting credit exactly once.
- [x] Default timezone to browser choice; apply explicit changes next day using approved semantics.
- [x] Reviews and review reopening never grant activity; no paid streak repair.
- [x] Test resignation move thresholds, midnight, daylight-saving changes, timezone transitions and duplicate finalisation.

## Completion wave

Implemented idempotent activity events for computer and human results, approved eligibility, historical timezone attribution, next-day changes and grid/streak rendering. Unit tests use real SQLite plus deterministic date boundaries. Computer and human result delivery invoke the same helper. Reviews never invoke activity credit.
