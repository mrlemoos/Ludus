# 17: Replay completed matches privately

**What to build:** Owners replay saved games move by move and inspect legal alternatives after the result.

**Blocked by:** 05: Complete a timed computer match in 2D.

**Status:** ready-for-agent

- [x] Load recorded accepted moves, step backward/forward and explore legal branches without modifying the saved match.
- [x] Use the shared board state and controls in every available presentation. Keep notation consistent across languages.
- [ ] Enforce ownership and finished-match access server-side. No analysis access through live-match review endpoints.
- [ ] Verify terminal positions, branching, owner isolation and no activity or quota consumption from replay.

## Implementation progress

Owners can reopen saved computer games, step through accepted moves in 2D or 3D and download PGN. Server checks ownership for match reads, moves and sockets. Browser tests cover finished positions, stepping, reloads and unauthenticated access. Legal alternative branches now run locally for either side after completion, including promotion, castling and en passant. Players can step within a variation or return to the recorded line. Shared replay helpers reject unfinished games; saved moves, result and PGN remain unchanged. Local evidence: `tsc --noEmit` passed, `vitest run` passed 97 tests including 11 replay cases, production build passed, and `playwright test tests/e2e/replay.spec.ts` passed one Chromium journey verifying branching, restoration and no API writes. The browser journey uses a finished-game fixture; cross-account API isolation coverage and a dedicated server-side finished-match review access contract remain outstanding. This ticket is not complete.
