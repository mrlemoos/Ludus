# Development

Use Node 24 and the pnpm version pinned in the package manifest.

```sh
pnpm install
pnpm seed
pnpm dev
```

Open `/play` and choose **Sign in as dev**. `pnpm seed` creates a local development account and invitation, plus an ignored `.dev.vars` file with a random authentication secret and explicit local mode. It preserves existing secrets/accounts/trial dates. It also seeds a fixed Friend identity for two-session checks and a local operator allowlist. The local sign-in endpoint accepts only the fixed `leo` or `friend` account identifiers; it never accepts arbitrary email identities. Local sign-in requires both `LOCAL_DEV=true` and a loopback hostname; deployed hosts cannot use it. Do not put local mode in production configuration.

Local development uses real Worker code, local D1 and a SQLite-backed Durable Object per match. No Cloudflare login, email delivery or external AI service is needed locally. Stockfish lite single-threaded runs in a browser Web Worker. The build copies its JavaScript, WASM and licence from the pinned dependency into generated static assets; no runtime CDN is needed.

Choose either colour, 5+3 or 10+5, and one of four provisional difficulty levels. Moves, clocks and results are server-owned; computer move selection is untrusted browser input and never earns rank. Reloads recover accepted state. Disconnects pause clocks for up to 60 seconds total; keep the tab active for computer play. Completed games support private replay and PGN download. Both board presentations use the same match and controls. Keyboard users can select squares with Enter and move focus with arrows, including through the accessible board accompanying 3D.

This remains invite-only. `/online` provides human casual play and friend links, `/account` manages onboarding/timezones/activity privacy, `/players/:username` exposes public profiles, `/operator` manages invitation previews and manual reports, and `/coach/:matchId` provides finished-game analysis/reviews. The operator route requires an authenticated verified user ID in `OPERATOR_IDS`. Seeded local operator access must not be copied to production.

Computer and human matches require onboarding and share atomic coordinator reservations so a player cannot start another game while queued, invited or playing. Human clocks pause while either disconnected player has allowance, accounting overlapping elapsed time separately for each player. Completed games record activity exactly once in the timezone effective at completion. Timezone changes activate at the next midnight in the current zone; repeated edits retain that activation instant.

Threefold/fifty-move draws require a claim; fivefold/75-move draws are automatic. Checkmate takes precedence. Human draw offers require each side to have moved. Rated entry is explicitly disabled pending exact possible-mate timeout adjudication. The existing casual timeout implementation must not be presented as proof for all dead positions. Rating infrastructure has deterministic Glicko-2 tests but the launch gate remains closed.

The coach has no selected model by default. Browser Stockfish analysis is free and unlimited. Each account receives one introductory AI review and 30 monthly beta reviews until the original onboarding expiry; only accounts with a permanent complimentary grant receive 30 monthly reviews after beta. One-time packs contain ten AI reviews for EUR 4.99 and do not expire. A saved review allows five successful follow-up answers. Browser analysis, legal variation replay and saved content remain usable during outages. Model generation needs actual passing evaluation evidence and secrets described in `coaching.md`; mocked tests do not establish model quality. Failed generation restores the review credit, though a potentially billed request retains its conservative spending reservation. Checkout is disabled until release gates pass.

The café and traditional set are original procedural assets. Automatic quality reduction and manual 2D fallback exist; named iPhone/Android performance, computer calibration and final art acceptance remain unverified. See `beta-readiness.md` and `mobile-validation.md`.

```sh
pnpm exec playwright install chromium
pnpm check
```

Checks cover types, deterministic chess/clocks, authentication, production build and browser/API journeys against local D1 and match Durable Objects. Browser tests seed the development account locally and create computer games and synthetic waitlist emails. Screenshots are written to the ignored test-results directory. Apply new schema changes through `pnpm db:generate`, review the generated SQL, then `pnpm db:migrate`. Regenerate binding types with `pnpm cf:types` after changing Worker configuration.

