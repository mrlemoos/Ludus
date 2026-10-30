# 06: Choose calibrated computer strength

**What to build:** Players select one of four computer strengths independently of teaching level.

**Blocked by:** 05: Complete a timed computer match in 2D.

**Status:** ready-for-agent

- [ ] Define and validate four practical Stockfish configurations on representative devices; do not display uncalibrated Elo labels.
- [ ] Suggest difficulty from onboarding and match history, retain player choice and never change difficulty silently.
- [ ] Establish the computer opponent and coach shared character identity. Label computer opponents clearly.
- [ ] Verify all four choices affect engine configuration while preserving legal play and teaching-level independence.

## Implementation progress

Four explicit configurations now live in `shared/computer.ts` and drive the browser worker: skill/depth/move-time settings of 0/3/100 ms, 4/6/250 ms, 10/10/500 ms and 20/16/1200 ms. `coachIdentity` supplies Lucía's shared name. Advisory `suggestDifficulty` uses onboarding skill or the five most recent completed games at the selected strength. Four wins suggest one step up; four losses suggest one step down. These thresholds remain provisional and never change the player's selection.

`tests/unit/computer.test.ts` and `tests/unit/engine.test.ts` cover all four command configurations, suggestion bounds, player colour, draws, unfinished games, history immutability, concurrent requests, disposal and search timeout. A timed-out worker is retired so late replies cannot answer a later request. Manual retry creates a fresh worker. Current full unit suite: 97 passed; TypeScript check passed. Implementation committed in `fa2e700`.

Remaining: integrate advisory recommendations into onboarding/setup, obtain acceptance of provisional thresholds, calibrate strength on representative named devices and record actual results. No calibrated Elo or real-device strength claim is made. Ticket remains incomplete.
