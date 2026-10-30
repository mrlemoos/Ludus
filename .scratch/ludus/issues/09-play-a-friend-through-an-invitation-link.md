# 09: Play a friend through an invitation link

**What to build:** Two invited accounts complete a casual human match using a friend link.

**Blocked by:** 05: Complete a timed computer match in 2D.

**Status:** ready-for-agent

- [x] Create and redeem casual-only invitations for either control, applying approved expiry and colour rules.
- [x] Use authenticated WebSockets and the match Durable Object to validate membership, turn order, clocks and results.
- [x] Prevent repeated redemption and concurrent joins from creating duplicate matches or seats; persist completed human games.
- [ ] Verify complete two-session play, illegal direct actions and replay/reload recovery. Human play remains usable when the coach provider is unavailable.

## Implementation progress

Implemented friend invitation creation, cancellation and redemption through one SQLite matchmaking Durable Object. Links expire after 24 hours, stay casual-only, support both controls and assign creator colour or a persisted random colour once. Member-authenticated SQLite match Durable Objects own moves, timestamp clocks, results and WebSocket snapshots. Queue/invitation/computer reservations prevent simultaneous matches, and retries repair interrupted match initialisation. Unit evidence includes member isolation, stale/illegal actions, concurrent assignment/cancellation and duplicate redemption. Root integration owns final real two-account browser evidence; this checkbox remains open until recorded.

Local validation: 40 scoped unit tests passed across `human-game`, `rating`, `matchmaking` and `online-durable`. Full suite last passed 215 tests before the final extra socket-delivery case; production build and targeted online lobby browser journey passed. No deployment or live beta admission claimed.
