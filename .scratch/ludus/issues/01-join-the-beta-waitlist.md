# 01: Join the beta waitlist

**What to build:** Visitors join a deployed waitlist in their preferred launch language.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [x] Use pnpm, one TypeScript package, Vite, React, React Router, Tailwind and Base UI. Select registry components according to need; no monorepo tooling.
- [ ] Deploy static assets and same-origin Worker API through the Cloudflare Vite plugin. Persist validated email and preferred language in D1 through Drizzle migrations from the outset.
- [x] Support en-GB, es-ES and fr-FR through react-i18next and Intl. Duplicate submissions give a safe confirmation without duplicate records; limit submission abuse.
- [x] Add typecheck, Vitest, Playwright and build checks. Establish checked commits and pushes to main as default deployment workflow; store secrets in Cloudflare.
- [ ] Verify submission, invalid input, duplicates and language selection through the deployed application. Start on free infrastructure and expose usage information for invitation capacity decisions.

## Comments

Local implementation includes validated and bounded requests, basic rate limiting, duplicate-safe D1 persistence, three-language UI, failure/retry states and conditional checked-main deployment. Usage inspection instructions are documented for invitation batches. Local type/build checks, 24 validation tests and eight browser/API journeys pass; desktop and mobile screenshots were inspected.

Remote D1 provisioning and deployed submission verification remain outstanding because Cloudflare authentication has expired. GitHub authentication is available; push requires a confirmed remote. This ticket remains open until live verification succeeds.
