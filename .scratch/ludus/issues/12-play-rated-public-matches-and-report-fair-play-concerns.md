# 12: Play rated public matches and report fair-play concerns

**What to build:** Public rated games update the correct rank and provide the approved fair-play reporting route.

**Blocked by:** 04: Confirm match and rating policies; 11: Find public casual opponents with computer fallback.

**Status:** ready-for-agent

- [ ] Apply approved rating algorithm, provisional ranks and matching tolerance; maintain separate 5+3 and 10+5 ratings.
- [ ] Only completed rated human matches affect rank. Exclude casual friend games, public casual games and computer matches.
- [ ] Persist result and rating changes idempotently with recoverable processing across match storage and D1; verify retries cannot double-apply ratings.
- [ ] Implement approved player reporting and operator handling; test match isolation, unauthorised updates and concurrent result processing.
