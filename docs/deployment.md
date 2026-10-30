# Deployment and operations

```sh
pnpm exec wrangler login
pnpm exec wrangler d1 create ludus
```

Replace the all-zero local placeholder `database_id` in Wrangler configuration with the returned D1 ID. Then run:

```sh
pnpm deploy
```

Before deploying game access, set Worker secrets `BETTER_AUTH_SECRET` and `RESEND_API_KEY` with `wrangler secret put`, and configure `AUTH_EMAIL_FROM` with a verified Resend sender. Runtime secrets belong in Cloudflare, never source control. Insert approved emails into the remote `invitations` table; only invited addresses can create accounts or receive sign-in links. Configure `OPERATOR_IDS` with comma-separated verified account IDs to authorise `/operator`. Operators preview batches of at most ten waitlist members, confirm capacity and send invitations through Resend. Invitations expire after seven days; retries reuse delivery identifiers and stale uncertain sends require explicit reissue. The seeded local account is not copied to remote D1. Invitation delivery uses the member's preferred launch language. Authentication magic-link delivery remains English.

This runs all checks, applies remote migrations, then deploys the Worker and static assets. Verify an actual waitlist submission on the deployed URL. Do not publish a placeholder database binding.

GitHub Actions checks pull requests and every push to `main`. After checks pass, `main` applies remote D1 migrations and deploys the `ludus` Worker and static assets to `ludus.mrlemoos.dev`. Pull requests never deploy. Production runs are serialised so migrations and deployments cannot overlap; running production jobs are not cancelled by newer pushes.

Configure repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Missing credentials fail the workflow. The token needs Worker deployment and D1 migration permissions. See [Cloudflare's GitHub Actions setup](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/). Runtime secrets remain in Cloudflare. A local commit or successful build does not prove a deployment.

## Waitlist data and limits

Only normalised email, preferred language and creation time are stored. Duplicate submissions return the same confirmation and preserve the original language. The public API never lists entries. No confirmation email is sent yet; the operator invitation page handles separate Resend delivery after preview and capacity confirmation.

Requests have a 1 KiB body limit, same-origin browser checks and an approximate five-attempts-per-minute IP limit per Cloudflare location. Shared-network users may share that allowance. This limits basic abuse, not distributed attacks; add Turnstile if needed. The browser retains email on transient failures and supports manual retry.

Before admitting invitation batches, inspect Worker request/error usage, D1 reads/writes/storage and rate-limit responses in Cloudflare. Check current free-plan limits in the dashboard; hard quota failures remain possible. No public usage endpoint exposes waitlist information. Resend and coaching quotas become relevant when those features ship.

Fonts are self-hosted from Fontsource packages. Cormorant Garamond and Manrope use the SIL Open Font License; licence files ship under /licences/. The waiting-page chess illustration is project-authored SVG/CSS, separate from the playable 3D assets.

Product specification and dependency-ordered local tickets remain in the project documentation and `.scratch/ludus/issues/`.

## Engine licence

Stockfish.js is GPLv3. The generated engine directory includes its complete licence. Source for the pinned 19.0.1 distribution is available at https://github.com/nmrugg/stockfish.js/tree/v19.0.1. Before public distribution, provide the corresponding source alongside the shipped engine and review the distribution obligations; the current local slice is not a public release. The engine is isolated in its own browser worker and communicates through UCI messages. Project-authored 3D geometry and procedural grain use no external artwork.

## Beta configuration and release gates

Apply all migrations before deploying these APIs. `HUMAN_MATCHES` and `MATCHMAKING` are new SQLite Durable Objects with migration tag `v2`; retain the existing `Match` class and `v1` migration. Daily UTC cron cleanup resumes account erasure and purges expired personal data. Secrets stay in Cloudflare; `LOCAL_DEV` must never be enabled in production. Local seeds are not remote invitations.

Review `beta-readiness.md` before admitting batches. Rated entry is closed; paid checkout is absent by policy. Coaching generation is unavailable until the model configuration and measured evaluation report in `coaching.md` pass validation. Do not supply synthetic test observations as a production report.

Runtime settings: `BETTER_AUTH_SECRET`, `RESEND_API_KEY`, `AUTH_EMAIL_FROM`, `OPERATOR_IDS`; coaching additionally needs `COACH_API_KEY`, `COACH_API_URL`, `COACH_MODEL`, `COACH_EVALUATION_JSON`, `COACH_INPUT_USD_PER_MILLION`, `COACH_OUTPUT_USD_PER_MILLION`. No model call or invitation delivery is made automatically on startup. API generation and invitation sends require explicit user/operator actions and enforce their limits server-side.
