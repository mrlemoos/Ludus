# Coaching

Coaching is available only after a match ends. The same Lucía identity appears as the computer opponent and post-game coach. Teaching vocabulary is independent of computer difficulty.

## What runs locally

`/coach/:matchId` loads an authorised completed computer or human match. Stockfish runs in a fresh browser worker after the player requests a review. It samples at most 40 pre-move positions, including the last played move, using depth 12 and a 250 ms position budget. Keep the tab active. Cancellation terminates this worker. Review generation never runs during live play.

The server reconstructs positions from saved moves, checks submitted candidate lines and validates generated structured variations. A generated variation must begin with a supplied engine candidate. These checks establish legality, not evaluation accuracy. Client scores and the generated explanation remain untrusted. Recurring themes count distinct reviewed matches with saved, position-linked tags; they are suggestions, not independently established diagnoses.

The page keeps saved text in its original language and shows a notice in the current UI language when they differ. New reviews and conversation replies use the current UI language and current account teaching profile. There is no automatic translation. Review variations have local move-by-move replay and do not modify the match.

## Model configuration stays closed until evaluation passes

No production model has been selected or evaluated by this implementation. No paid evaluation requests have been made. Missing credentials, a missing report or a failing report returns an unavailable state. The player retries manually; gameplay, saved reviews and replay do not depend on the provider.

Configure server-only bindings after selecting a provider that implements the bounded adapter contract:

- `COACH_API_URL`: HTTPS JSON chat-completions endpoint. Redirects are refused.
- `COACH_API_KEY`: provider credential, held as a Worker secret.
- `COACH_MODEL`: exact model identifier recorded by evaluation.
- `COACH_INPUT_USD_PER_MILLION` and `COACH_OUTPUT_USD_PER_MILLION`: verified token prices for that model.
- `COACH_EVALUATION_JSON`: JSON report produced from measured, human-reviewed observations by the evaluation script.

The adapter sends `model`, system/user `messages`, `response_format` requesting a JSON object and `max_tokens: 1200`. It requires `choices[0].message.content` containing the structured coach document and integer `usage.prompt_tokens`/`usage.completion_tokens`. Provider selection must verify this contract and billing behaviour. The request can include moves, result, player colour, browser Stockfish analysis and short conversation context for the selected game and up to three preceding finished games. It also includes gap count when earlier snapshots or browser analyses are unavailable. Email, username and account/match identifiers are excluded. Provider secrets and raw provider errors never enter browser responses.

## Evaluation workflow

The fixed corpus is `shared/coach-fixtures.ts`, with 40 distinct legal positions. Create the complete four-profile/three-language matrix:

```sh
node scripts/evaluate-coach.ts template /tmp/ludus-coach-matrix.json candidate-model
```

The template makes no provider calls. Its rubric, error, cost and latency fields are deliberately unfilled. Run each candidate against these positions using the intended engine context and provider adapter, measure latency and billed token cost, record every structured variation, and have a reviewer score factual accuracy, vocabulary/depth, requested language, uncertainty and resistance to instructions embedded in supplied data. A template or synthetic unit-test observation is never release evidence. Keep total initial evaluation spending within USD 10; stop before a request would exceed the remaining budget. Record raw candidate outputs and reviewer notes alongside the completed matrix outside public source control when they contain private data.

```sh
node scripts/evaluate-coach.ts report /tmp/ludus-coach-completed.json candidate-model /tmp/ludus-coach-report.json
```

The evaluator checks matrix completeness and uniqueness, all suggested variations for legality, no critical factual errors, at least 90% rubric pass in every profile/language group, maximum USD 0.05 per observation and maximum USD 10 total. It records median/p95 latency and costs. Runtime verifies the report's corpus digest and exact selected model. An operator must supply an actual measured passing report; tests use synthetic observations only to test rejection and acceptance logic.

Remaining external gate: actual candidate requests, human rubric review and a measured model-selection report. Credentials are not available in this checkout. Do not mark model selection complete from the test harness.

## Allowances, idempotency and spending

Browser Stockfish analysis is free and unlimited. AI coach review credits use UTC calendar months. Each account receives one introductory AI review for life. All accounts receive 30 free reviews per month until the original beta expiry stored at onboarding. Only accounts with an explicit permanent complimentary grant receive 30 monthly credits after beta expiry. Monthly credits expire at month end. Use order is introductory credit, beta credit, permanent complimentary grant, then paid packs. A paid pack contains ten AI coach reviews for EUR 4.99 and paid credits do not expire. One credit is reserved for a generated AI review and committed only after successful completion; failures restore the credit. Saved reviews remain accessible without a current balance.

The Worker first reserves a review credit, then reserves the idempotent coach request and its share of the global USD 20 monthly spending cap. If request or cost reservation fails, it restores the review credit. Provider or validation failure marks the coach request failed and restores the credit. A successful review, committed credit and completed request are written in one D1 batch. A recovery sweep restores credits for abandoned reservations after 90 seconds. Active/successful idempotency keys are unique per owner. Retries with the same input reuse a successful result; a failed attempt can retry the same key, while a changed input with that key is rejected. A provider call begins only after both reservations succeed. The request month is fixed when the cost reservation is accepted; completing across midnight retains that reservation's month. A provider request has a 45-second timeout.

Before the provider call, input UTF-8 bytes and the output cap conservatively bound token cost. Requests above USD 0.05 or the context-size bound are rejected. Successful replies use measured token costs. If a call fails without reliable usage, retain its entire reserved amount against provider spending because the provider may still bill it. Failed generation consumes no player review/reply allowance. There is no automatic fallback model.

Each saved review allows up to five successfully generated follow-up replies for every account. Failed replies do not count. Saved replies remain accessible. A saved review is not regenerated when the player changes language; new future output uses the selected language and saved text remains in its original language. Deleting a review removes its text and conversation without resetting usage. Account deletion removes all private coaching content and anonymises the spending ledger, preserving the global cap. Pending requests become failed so a late provider response cannot recreate deleted private content.

Before an AI review, the browser requests the selected finished match and up to three preceding finished matches, newest first. It analyses each returned match in a browser worker. An engine failure for an earlier game sends `analysis: null` for that match; unavailable match snapshots are counted as gaps by the server. The server independently rechecks ownership, completion, ordering and all supplied analysis before the model call. The current match must still have valid analysis. These earlier-game summaries and gap counts can be provided to the model to put the current review in context.

After ten distinct reviewed matches at a teaching profile, the interface may suggest the next profile. The player explicitly accepts it through account settings. No profile or computer strength changes automatically.

## Validation

Unit tests use real SQLite migrations for reservation races, retries, failed generation, ownership, trial expiry, quota/month boundaries, spending retention and deletion. Provider tests use mocked responses. Model-evaluation tests use synthetic observations and are not model-quality measurements. Browser tests cover saved-review outage access, language notices, local variation replay, stable manual conversation retry and unconfigured-provider status. Actual provider quality, cost and latency remain unmeasured until the evaluation workflow runs.
