# 20: Generate private engine-grounded reviews

**What to build:** Owners generate a written summary and analysed replay of completed human or computer games.

**Blocked by:** 17: Replay completed matches privately; 18: Confirm teaching profiles and review accounting; 19: Evaluate and select the external coach model.

**Status:** ready-for-agent

- [ ] Run Stockfish analysis in a browser Web Worker, requiring active tab execution; validate supplied positions/variations against server-owned saved moves and treat evaluations as untrusted.
- [ ] Use selected external model through Worker-held secrets, grounded in supplied analysis and selected teaching profile. Validate suggested move legality server-side.
- [ ] Generate reviews in UI language selected for the request. Persist generation language and text; reopening consumes no allowance.
- [ ] Changing UI language affects future output only. Show a current-language notice naming a saved review language when different; do not automatically translate or charge.
- [ ] Enforce free three-review monthly allowance and agreed accounting, ownership and finished-match access. Retries and concurrent requests must not double-charge.
- [ ] Model outage shows unavailable state and manual retry without quota consumption. Matches, clocks, results, engine replay and saved reviews remain usable.
- [ ] Test language/profile matrix, malicious analysis, live/private access, retries, outage behaviour and measured costs. Record model/engine usage without exposing private records.

## Completion wave

Implemented finished owned computer/human match loading, browser engine analysis, untrusted-analysis validation, legal suggested lines, preserved generation language/notices, private review storage, atomic quotas/retries/spending and manual outage retry. Local engine replay/analysis and saved text work without a model. SQLite/provider/browser tests pass; live model accuracy/cost gate is still closed.
