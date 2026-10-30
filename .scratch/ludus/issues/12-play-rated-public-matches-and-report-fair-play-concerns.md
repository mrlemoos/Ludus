# 12: Play rated public matches and report fair-play concerns

**What to build:** Public rated games update the correct rank and provide the approved fair-play reporting route.

**Blocked by:** 04: Confirm match and rating policies; 11: Find public casual opponents with computer fallback.

**Status:** ready-for-agent

- [ ] Apply approved rating algorithm, provisional ranks and matching tolerance; maintain separate 5+3 and 10+5 ratings.
- [x] Only completed rated human matches affect rank. Exclude casual friend games, public casual games and computer matches.
- [x] Persist result and rating changes idempotently with recoverable processing across match storage and D1; verify retries cannot double-apply ratings.
- [x] Implement approved player reporting and operator handling; test match isolation, unauthorised updates and concurrent result processing.

## Implementation progress

Glicko-2 infrastructure is implemented with initial 1500/350/0.06, one match per period, ten-game provisional marker, separate time controls and approved widening tolerance. Tests reproduce Glickman’s published numerical example and both-player pre-period updates. D1 result processing uses an atomic processed guard; SQLite tests verify retries and concurrent delivery do not double-apply ratings. Casual games and aborts skip ratings. Member-only fair-play reports validate categories, deduplicate submissions and feed the operator workflow. Rated queue entry remains deliberately disabled by `RATED_ENABLED = false`: exact possible-mate timeout adjudication for arbitrary positions is not proven. Known bare-king, single-minor-versus-bare-king and same-colour-bishop cases are tested, with other positions explicitly unknown. This ticket is incomplete until the approved timeout gate is resolved and rated end-to-end play passes.

Local validation: 40 scoped unit tests passed across `human-game`, `rating`, `matchmaking` and `online-durable`. Full suite last passed 215 tests before the final extra socket-delivery case; production build and targeted online lobby browser journey passed. No deployment or live beta admission claimed.
