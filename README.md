# Ludus

Playable computer chess in a Madrid-inspired café, with switchable 3D and accessible 2D boards. British English, European Spanish and European French. The public waitlist remains at `/`; the game is at `/play`.

## Development

Use Node 24 and the pnpm version pinned in the package manifest.

```sh
pnpm install
pnpm seed
pnpm dev
```

Open `/play` and choose **Sign in as dev**. `pnpm seed` creates a real local account and invitation for `leo.lemos.ds@icloud.com`, plus an ignored `.dev.vars` file with a random authentication secret and explicit local mode. It preserves an existing secret and account. Local sign-in requires both `LOCAL_DEV=true` and a loopback hostname; deployed hosts cannot use it. Do not put local mode in production configuration.

Local development uses real Worker code, local D1 and a SQLite-backed Durable Object per match. No Cloudflare login, email delivery or external AI service is needed locally. Stockfish lite single-threaded runs in a browser Web Worker. The build copies its JavaScript, WASM and licence from the pinned dependency into generated static assets; no runtime CDN is needed.

Choose either colour, 5+3 or 10+5, and one of four provisional difficulty levels. Moves, clocks and results are server-owned; computer move selection is untrusted browser input and never earns rank. Reloads recover accepted state. Disconnects pause clocks for up to 60 seconds total; keep the tab active for computer play. Completed games support private replay and PGN download. Both board presentations use the same match and controls. Keyboard users can select squares with Enter and move focus with arrows, including through the accessible board accompanying 3D.

This is a local playable slice, not an open beta. Human multiplayer, ranks, streaks, coaching, operator invitations and subscriptions remain unimplemented. Full onboarding and the beta admission/retention policies remain gated. The café and traditional pieces are project-authored procedural starter assets; final art and named-device performance acceptance are outstanding. Graphics reduce resolution and shadows when measured frame rate falls below 30 FPS, but real iPhone/Android performance has not been verified.

Casual computer games currently end automatically on threefold repetition, fifty moves, stalemate or chess.js insufficient material. On timeout, a bare king or a lone bishop/knight against a bare king draws; other positions award the opponent. This simplified timeout policy and automatic draw handling are provisional and must be resolved before rated human play. No simultaneous human disconnect policy is implied.

```sh
pnpm exec playwright install chromium
pnpm check
```

Checks cover types, deterministic chess/clocks, authentication, production build and browser/API journeys against local D1 and match Durable Objects. Browser tests seed Leo locally and create computer games and synthetic waitlist emails. Screenshots are written to the ignored test-results directory. Apply new schema changes through `pnpm db:generate`, review the generated SQL, then `pnpm db:migrate`. Regenerate binding types with `pnpm cf:types` after changing Worker configuration.

## First deployment

```sh
pnpm exec wrangler login
pnpm exec wrangler d1 create ludus
```

Replace the all-zero local placeholder `database_id` in Wrangler configuration with the returned D1 ID. Then run:

```sh
pnpm deploy
```

Before deploying game access, set Worker secrets `BETTER_AUTH_SECRET` and `RESEND_API_KEY` with `wrangler secret put`, and configure `AUTH_EMAIL_FROM` with a verified Resend sender. Runtime secrets belong in Cloudflare, never source control. Insert approved emails into the remote `invitations` table; only invited addresses can create accounts or receive sign-in links. The operator batch page is still outstanding. The seeded local account is not copied to remote D1. Resend emails currently use English; translated invitation delivery remains part of account onboarding.

This runs all checks, applies remote migrations, then deploys the Worker and static assets. Verify an actual submission on the returned workers.dev URL before marking ticket 01 complete. Do not publish a placeholder database binding.

GitHub Actions checks pushes to main and pull requests. Configure repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` to deploy main only after checks pass. Without both secrets, deployment is explicitly skipped. The token needs Worker deployment and D1 migration permissions. A local commit or successful build does not prove a deployment.

## Waitlist data and limits

Only normalised email, preferred language and creation time are stored. Duplicate submissions return the same confirmation and preserve the original language. The public API never lists entries. No confirmation email is sent yet; operator invitation batches and Resend delivery belong to ticket 03.

Requests have a 1 KiB body limit, same-origin browser checks and an approximate five-attempts-per-minute IP limit per Cloudflare location. Shared-network users may share that allowance. This limits basic abuse, not distributed attacks; add Turnstile if needed. The browser retains email on transient failures and supports manual retry.

Before admitting invitation batches, inspect Worker request/error usage, D1 reads/writes/storage and rate-limit responses in Cloudflare. Check current free-plan limits in the dashboard; hard quota failures remain possible. No public usage endpoint exposes waitlist information. Resend and coaching quotas become relevant when those features ship.

Fonts are self-hosted from Fontsource packages. Cormorant Garamond and Manrope use the SIL Open Font License; licence files ship under /licences/. The waiting-page chess illustration is project-authored SVG/CSS, not the final playable 3D assets.

Product specification and dependency-ordered local tickets remain in the project documentation and `.scratch/ludus/issues/`.

## Engine licence

Stockfish.js is GPLv3. The generated engine directory includes its complete licence. Source for the pinned 19.0.1 distribution is available at https://github.com/nmrugg/stockfish.js/tree/v19.0.1. Before public distribution, provide the corresponding source alongside the shipped engine and review the distribution obligations; the current local slice is not a public release. The engine is isolated in its own browser worker and communicates through UCI messages. Project-authored 3D geometry and procedural grain use no external artwork.
