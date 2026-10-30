# Remaining implementation

Status: active

Policies: [proposed decisions](policies.md). Awaiting approval; do not treat draft proposals as accepted.

## Current implementation wave

- Computer strengths, advisory recommendation helper and engine request lifecycle. Commit fa2e700; actual device calibration and recommendation UI remain open.
- Account isolation and terminal persistence recovery. Commit fa2e700; local unit coverage, not real multi-session multiplayer proof.
- Finished-match replay variations. Commit 288b1c8; eleven replay unit cases and a targeted Chromium journey pass. Full local unit suite has 97 passing tests.

## Dependency frontier

- Ticket 02 admission/retention approval unlocks full onboarding and invitation batches, ticket 03.
- Ticket 04 match/rating approval plus ticket 03 unlocks friend games, disconnect recovery and public casual/rated matchmaking, tickets 09–12. Preset phrases/mute, ticket 13, follows human matches.
- Ticket 14 activity/timezone approval unlocks activity/streaks and public profiles, tickets 15–16.
- Ticket 18 teaching/accounting approval unlocks measured coach selection, ticket 19, then reviews, card-free trial and conversation, tickets 20–22. No provider selected or paid calls authorised by this map.
- Ticket 23 provider/terms approval unlocks billing, ticket 24. Beta can launch without paid checkout. Premium assets, ticket 25, need asset selection and entitlement integration.
- Ticket 07 device/art acceptance and real hardware measurements remain required for ticket 08 and beta admission, ticket 26.

## Delivery boundaries

Unit tests required for each implemented rules/API/accounting change. Browser tests required for integrated player/operator journeys. Commit scoped work after checks; serialise Git staging/commits because all agents share the index. Preserve unrelated existing changes. Local checks and commits do not establish push, deployment, actual-device performance or live service credentials.

## Verification

Current wave passed TypeScript, 97 unit tests, production build and all 19 Chromium browser journeys against local Worker/D1. Shared identity integration passed TypeScript/unit tests and a subsequent production build. Device calibration, production email delivery and live deployment remain unverified.
