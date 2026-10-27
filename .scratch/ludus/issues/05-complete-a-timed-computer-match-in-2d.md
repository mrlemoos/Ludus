# 05: Complete a timed computer match in 2D

**What to build:** An authenticated player completes and recovers a legal timed computer match using an accessible 2D board.

**Blocked by:** 03: Invite and onboard beta players; 04: Confirm match and rating policies.

**Status:** ready-for-agent

- [ ] Use chess.js on server and browser. A SQLite-backed match Durable Object owns accepted moves, timestamps, clocks and result; browser renders accepted state.
- [ ] Lazy-load Stockfish.js lite single-threaded in a Web Worker. Validate submitted computer moves server-side; never grant rank for computer matches.
- [ ] Support both controls and increments, keyboard/touch play, promotion, castling, en passant, checkmate, stalemate, approved draws, resignation and timeout.
- [ ] Persist moves and finished result, recover accepted state after reload and finalise once. Browser engine requires active execution and may vary by device.
- [ ] Test illegal/out-of-turn/stale actions, clock boundaries, terminal outcomes, reload recovery and duplicate finalisation. No external language model is required.
