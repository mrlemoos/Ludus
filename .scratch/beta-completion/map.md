# Beta implementation map

Status: active

Policies were approved by Leo on 30 October 2026. Continue implementation without between-wave approval requests. Paid checkout remains disabled under the approved beta policy.

## Commits

- fa2e700: computer settings, engine lifecycle, ownership/persistence tests.
- 288b1c8: finished-game legal replay variations.
- dc4d5aa: shared character integration and policy proposal.
- ea39c3e: human matches, friend links, atomic queues, computer reservations, rating infrastructure, reports, phrases and online UI.
- 83b970f: onboarding, public profiles, activity/timezones, card-free trial, operator invitations, retention and deletion.
- 167bd95: private coaching, local engine analysis, evaluation gate, quota/spending/privacy safeguards.
- Final integration and release-evidence commit follows in Git.

## Implemented for review

Accounts/operator/player data, casual human/computer play, replay/local analysis, coaching storage/provider/accounting/evaluation gate, card-free Plus and original premium materials. Unit tests cover deterministic rules, actual SQLite transactions, privacy and failure/race recovery. Browser journeys include two signed-in accounts and model outage without review charge.

## Open release evidence

- Exact possible-mate timeout adjudication is not certified. Rated entry remains rejected on server.
- Real model evaluation/selection has no credentials or measured report. Generation remains unavailable by default.
- Actual iPhone 13/Safari and Pixel 6/Chrome performance, strength calibration and final art acceptance remain absent.
- Operational email/provider capacity and live production journeys remain unverified. No beta invitation or payment is sent automatically.
- Paid checkout is intentionally deferred; no payment provider selected.

See docs/beta-readiness.md for the full release boundary. Local commits/checks do not establish push, deployment or beta admission. Preserve unrelated workspace changes.

## Final local evidence

246 unit tests in 30 files, TypeScript and production build pass. All 27 serial Chromium journeys pass; final account presentation also passes three focused browser journeys. Fresh/populated migration upgrades pass and Drizzle reports no schema changes. Real model/device/production evidence remains open as listed above.
