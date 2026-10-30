# 04: Confirm match and rating policies

**What to build:** Approve a rules policy covering terminal results, fair competition and matchmaking.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [x] Define draw claims and agreements, repetition and move-count draws, timeout/insufficient mating material, abort conditions and simultaneous disconnect behaviour.
- [x] Choose rating algorithm, initial/provisional ranks, matchmaking tolerance and fair-play reporting/enforcement for the beta.
- [x] Preserve rated human-only public matches, separate 5+3 and 10+5 ratings, and cumulative 60-second disconnect allowance per player.
- [x] Record deterministic examples for each policy, including conflicting actions and repeated finalisation.

## Completion wave

Approved match/rating policy is recorded in `.scratch/beta-completion/policies.md`. Deterministic draw, abort, disconnect and Glicko-2 cases are covered in human-game/rating/online-durable tests. Exact possible-mate timeout adjudication remains an explicit server-side rated-entry gate; policy approval does not certify implementation.
