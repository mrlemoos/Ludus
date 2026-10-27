# Ludus

Chess in a Madrid-inspired café. First slice: an invite-only beta waitlist in British English, European Spanish and European French.

## Development

Use Node 24 and the pnpm version pinned in the package manifest.

```sh
pnpm install
pnpm db:migrate
pnpm dev
```

Local development uses real Worker code and local D1 through Cloudflare's Vite plugin. No Cloudflare login or external AI service is needed locally.

```sh
pnpm exec playwright install chromium
pnpm check
```

Checks cover types, input validation, production build and browser/API journeys against local D1. Browser tests submit synthetic emails to the local database. Screenshots are written to the ignored test-results directory. Apply new schema changes through `pnpm db:generate`, review the generated SQL, then `pnpm db:migrate`. Regenerate binding types with `pnpm cf:types` after changing Worker configuration.

## First deployment

```sh
pnpm exec wrangler login
pnpm exec wrangler d1 create ludus
```

Replace the all-zero local placeholder `database_id` in Wrangler configuration with the returned D1 ID. Then run:

```sh
pnpm deploy
```

This runs all checks, applies remote migrations, then deploys the Worker and static assets. Verify an actual submission on the returned workers.dev URL before marking ticket 01 complete. Do not publish a placeholder database binding.

GitHub Actions checks pushes to main and pull requests. Configure repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` to deploy main only after checks pass. Without both secrets, deployment is explicitly skipped. The token needs Worker deployment and D1 migration permissions. A local commit or successful build does not prove a deployment.

## Waitlist data and limits

Only normalised email, preferred language and creation time are stored. Duplicate submissions return the same confirmation and preserve the original language. The public API never lists entries. No confirmation email is sent yet; operator invitation batches and Resend delivery belong to ticket 03.

Requests have a 1 KiB body limit, same-origin browser checks and an approximate five-attempts-per-minute IP limit per Cloudflare location. Shared-network users may share that allowance. This limits basic abuse, not distributed attacks; add Turnstile if needed. The browser retains email on transient failures and supports manual retry.

Before admitting invitation batches, inspect Worker request/error usage, D1 reads/writes/storage and rate-limit responses in Cloudflare. Check current free-plan limits in the dashboard; hard quota failures remain possible. No public usage endpoint exposes waitlist information. Resend and coaching quotas become relevant when those features ship.

Fonts are self-hosted from Fontsource packages. Cormorant Garamond and Manrope use the SIL Open Font License; licence files ship under /licences/. The waiting-page chess illustration is project-authored SVG/CSS, not the final playable 3D assets.

Product specification and dependency-ordered local tickets remain in the project documentation and `.scratch/ludus/issues/`.
