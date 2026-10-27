# 11: Find public casual opponents with computer fallback

**What to build:** Players find a human casual opponent or explicitly accept computer practice after waiting.

**Blocked by:** 06: Choose calibrated computer strength; 09: Play a friend through an invitation link.

**Status:** ready-for-agent

- [ ] One beta matchmaking Durable Object coordinates queues by time control and casual/rated mode, initially exposing casual play.
- [ ] Queue, cancel and assign atomically across entry points so a player cannot enter two matches.
- [ ] After 30 seconds offer clearly labelled computer play. Acceptance atomically cancels the human queue; declining leaves it active.
- [ ] Verify cancellation/assignment/fallback races and both controls. Never disguise computers as humans.
