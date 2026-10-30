# Development

Use Node 24 and the pnpm version pinned in the package manifest.

```sh
pnpm install
pnpm seed
pnpm dev
```

Open `/play` and choose **Sign in as dev**. `pnpm seed` creates a local development account and invitation, plus an ignored `.dev.vars` file with a random authentication secret and explicit local mode. It preserves an existing secret and account. Local sign-in requires both `LOCAL_DEV=true` and a loopback hostname; deployed hosts cannot use it. Do not put local mode in production configuration.

Local development uses real Worker code, local D1 and a SQLite-backed Durable Object per match. No Cloudflare login, email delivery or external AI service is needed locally. Stockfish lite single-threaded runs in a browser Web Worker. The build copies its JavaScript, WASM and licence from the pinned dependency into generated static assets; no runtime CDN is needed.

Choose either colour, 5+3 or 10+5, and one of four provisional difficulty levels. Moves, clocks and results are server-owned; computer move selection is untrusted browser input and never earns rank. Reloads recover accepted state. Disconnects pause clocks for up to 60 seconds total; keep the tab active for computer play. Completed games support private replay and PGN download. Both board presentations use the same match and controls. Keyboard users can select squares with Enter and move focus with arrows, including through the accessible board accompanying 3D.

This is a local playable slice, not an open beta. Human multiplayer, ranks, streaks, coaching, operator invitations and subscriptions remain unimplemented. Full onboarding and the beta admission/retention policies remain gated. The café and traditional pieces are project-authored procedural starter assets; final art and named-device performance acceptance are outstanding. Graphics reduce resolution and shadows when measured frame rate falls below 30 FPS, but real iPhone/Android performance has not been verified.

Casual computer games currently end automatically on threefold repetition, fifty moves, stalemate or chess.js insufficient material. On timeout, a bare king or a lone bishop/knight against a bare king draws; other positions award the opponent. This simplified timeout policy and automatic draw handling are provisional and must be resolved before rated human play. No simultaneous human disconnect policy is implied.

```sh
pnpm exec playwright install chromium
pnpm check
```

Checks cover types, deterministic chess/clocks, authentication, production build and browser/API journeys against local D1 and match Durable Objects. Browser tests seed the development account locally and create computer games and synthetic waitlist emails. Screenshots are written to the ignored test-results directory. Apply new schema changes through `pnpm db:generate`, review the generated SQL, then `pnpm db:migrate`. Regenerate binding types with `pnpm cf:types` after changing Worker configuration.

