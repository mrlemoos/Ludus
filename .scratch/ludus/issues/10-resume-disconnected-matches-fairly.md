# 10: Resume disconnected matches fairly

**What to build:** Brief disconnects pause clocks within the agreed allowance and both players see recovery state.

**Blocked by:** 09: Play a friend through an invitation link.

**Status:** ready-for-agent

- [x] Enforce cumulative 60 seconds per player per match, immediate resume on reconnect and continuing clocks after allowance exhaustion.
- [x] Keep board visible and show the authoritative pause countdown to both players; enforce approved simultaneous-disconnect policy.
- [x] Use timestamp-based time accounting and durable recovery rather than per-second server ticks; handle late timeout events correctly.
- [ ] Test repeated disconnects, allowance boundaries, simultaneous disconnects, reconnect races and state recovery with controlled time and two sessions.

## Implementation progress

Implemented per-player cumulative 60-second disconnect allowances. Overlapping disconnections consume each disconnected player allowance independently; the clock pauses while either allowance remains. Multiple sockets per player use membership tags so closing one tab does not pause another. Both boards remain visible beside a countdown. Timestamp-based unit tests cover overlap, repeated disconnects, exhaustion, exact timeout completion timestamp and immediate resume; SQLite DO tests cover duplicate-tab close and durable terminal retry alarms. Full two-session recovery evidence remains an integration gate.

Local validation: 40 scoped unit tests passed across `human-game`, `rating`, `matchmaking` and `online-durable`. Full suite last passed 215 tests before the final extra socket-delivery case; production build and targeted online lobby browser journey passed. No deployment or live beta admission claimed.
