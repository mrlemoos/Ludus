# 17: Replay completed matches privately

**What to build:** Owners replay saved games move by move and inspect legal alternatives after the result.

**Blocked by:** 05: Complete a timed computer match in 2D.

**Status:** ready-for-agent

- [ ] Load recorded accepted moves, step backward/forward and explore legal branches without modifying the saved match.
- [ ] Use the shared board state and controls in every available presentation. Keep notation consistent across languages.
- [ ] Enforce ownership and finished-match access server-side. No analysis access through live-match review endpoints.
- [ ] Verify terminal positions, branching, owner isolation and no activity or quota consumption from replay.

## Implementation progress

Owners can reopen saved computer games, step through accepted moves in 2D or 3D and download PGN. Server checks ownership for match reads, moves and sockets. Browser tests cover finished positions, stepping, reloads and unauthenticated access. Exploring alternative branches and cross-account isolation coverage remain outstanding; the ticket is not complete.
