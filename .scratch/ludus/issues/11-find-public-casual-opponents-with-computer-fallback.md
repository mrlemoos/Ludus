# 11: Find public casual opponents with computer fallback

**What to build:** Players find a human casual opponent or explicitly accept computer practice after waiting.

**Blocked by:** 06: Choose calibrated computer strength; 09: Play a friend through an invitation link.

**Status:** ready-for-agent

- [x] One beta matchmaking Durable Object coordinates queues by time control and casual/rated mode, initially exposing casual play.
- [x] Queue, cancel and assign atomically across entry points so a player cannot enter two matches.
- [x] After 30 seconds offer clearly labelled computer play. Acceptance atomically cancels the human queue; declining leaves it active.
- [x] Verify cancellation/assignment/fallback races and both controls. Never disguise computers as humans.

## Implementation progress

Implemented public casual queues in one SQLite matchmaking Durable Object. Queue tokens protect cancellation and explicit computer acceptance after 30 seconds. Assignment persists both reservations before match initialisation; cancel-versus-assignment returns the existing assignment. Explicit computer acceptance removes the human queue before navigation; no automatic computer assignment occurs. Computer games, friend invitations and public queues share the same account reservation. Unit tests cover controls/mode isolation, tolerance widening, queue tokens, AI boundary, cancellation races, interrupted initialisation and cross-mode reservations. `tests/e2e/online-ui.spec.ts` passed locally in Chromium for invitation links, cancellation and explicit AI acceptance.

Local validation: 40 scoped unit tests passed across `human-game`, `rating`, `matchmaking` and `online-durable`. Full suite last passed 215 tests before the final extra socket-delivery case; production build and targeted online lobby browser journey passed. No deployment or live beta admission claimed.
