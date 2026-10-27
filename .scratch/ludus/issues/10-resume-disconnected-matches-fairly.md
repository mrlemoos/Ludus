# 10: Resume disconnected matches fairly

**What to build:** Brief disconnects pause clocks within the agreed allowance and both players see recovery state.

**Blocked by:** 09: Play a friend through an invitation link.

**Status:** ready-for-agent

- [ ] Enforce cumulative 60 seconds per player per match, immediate resume on reconnect and continuing clocks after allowance exhaustion.
- [ ] Keep board visible and show the authoritative pause countdown to both players; enforce approved simultaneous-disconnect policy.
- [ ] Use timestamp-based time accounting and durable recovery rather than per-second server ticks; handle late timeout events correctly.
- [ ] Test repeated disconnects, allowance boundaries, simultaneous disconnects, reconnect races and state recovery with controlled time and two sessions.
