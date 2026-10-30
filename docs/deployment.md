# Deployment and operations

```sh
pnpm exec wrangler login
pnpm exec wrangler d1 create ludus
```

Replace the all-zero local placeholder `database_id` in Wrangler configuration with the returned D1 ID. Then run:

```sh
pnpm deploy
```

Before deploying game access, set Worker secrets `BETTER_AUTH_SECRET` and `RESEND_API_KEY` with `wrangler secret put`, and configure `AUTH_EMAIL_FROM` with a verified Resend sender. Runtime secrets belong in Cloudflare, never source control. Insert approved emails into the remote `invitations` table; only invited addresses can create accounts or receive sign-in links. The operator batch page is still outstanding. The seeded local account is not copied to remote D1. Resend emails currently use English; translated invitation delivery remains part of account onboarding.

This runs all checks, applies remote migrations, then deploys the Worker and static assets. Verify an actual waitlist submission on the deployed URL. Do not publish a placeholder database binding.

GitHub Actions checks pushes to main and pull requests. Configure repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` to deploy main only after checks pass. Without both secrets, deployment is explicitly skipped. The token needs Worker deployment and D1 migration permissions. A local commit or successful build does not prove a deployment.

## Waitlist data and limits

Only normalised email, preferred language and creation time are stored. Duplicate submissions return the same confirmation and preserve the original language. The public API never lists entries. No confirmation email is sent yet; operator invitation batches and Resend delivery belong to ticket 03.

Requests have a 1 KiB body limit, same-origin browser checks and an approximate five-attempts-per-minute IP limit per Cloudflare location. Shared-network users may share that allowance. This limits basic abuse, not distributed attacks; add Turnstile if needed. The browser retains email on transient failures and supports manual retry.

Before admitting invitation batches, inspect Worker request/error usage, D1 reads/writes/storage and rate-limit responses in Cloudflare. Check current free-plan limits in the dashboard; hard quota failures remain possible. No public usage endpoint exposes waitlist information. Resend and coaching quotas become relevant when those features ship.

Fonts are self-hosted from Fontsource packages. Cormorant Garamond and Manrope use the SIL Open Font License; licence files ship under /licences/. The waiting-page chess illustration is project-authored SVG/CSS, separate from the playable 3D assets.

Product specification and dependency-ordered local tickets remain in the project documentation and `.scratch/ludus/issues/`.

## Engine licence

Stockfish.js is GPLv3. The generated engine directory includes its complete licence. Source for the pinned 19.0.1 distribution is available at https://github.com/nmrugg/stockfish.js/tree/v19.0.1. Before public distribution, provide the corresponding source alongside the shipped engine and review the distribution obligations; the current local slice is not a public release. The engine is isolated in its own browser worker and communicates through UCI messages. Project-authored 3D geometry and procedural grain use no external artwork.
