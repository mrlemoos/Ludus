# Ludus

A browser chess platform with a 3D board and chess pieces.

## Working rules

- Write TypeScript. Use British spelling.
- Put each unit test beside the module it covers. Browser journeys stay in `tests/e2e`.
- Follow `.oxlintrc.json` and `.oxfmtrc.json` strictly. Name files in kebab-case for the domain concept, and put shared UI in `src/components/`. Components are PascalCase `function` declarations, take `ref` as a prop, and keep at most five props on a separate `interface NameProps` or an imported type (`...rest` excluded). Named bindings are `function` declarations; arrows are only inline. Import declarations are alphabetical by module specifier, with side-effect imports first.
- Keep changes small and complete. Reuse platform capabilities and installed dependencies.
- Preserve chess rules, accessibility and clear board interaction when adding 3D visuals.
- Product plan and technical architecture are confirmed. Implement dependency-ready tickets; resolve their explicit policy gates before dependent work.
- Record confirmed decisions below. Treat suggestions as unconfirmed.

## Confirmed decisions

- Product concept: chess.com-style chess with 3D models.
- Play against online opponents or the computer.
- Coach reviews are available only after a match ends, against either humans or the computer. No coaching during play.
- The computer opponent and post-game coach share a character identity.

- Reviews combine interactive move-by-move replay and a written summary.
- AI coach supports conversation grounded in chess-engine analysis. The engine validates suggested moves.

- Ask players their level and adapt coaching vocabulary and explanation depth.
- Start with one coach model and four teaching profiles. Consider fine-tuning only if evaluations show profiles are insufficient.
- Configure computer opponent strength independently of teaching level.
- Use match history to suggest coaching-level changes; the player approves changes.

- Online play includes friend invite links and public matchmaking.
- Launch includes casual and rated games, with player rank.
- Show a GitHub-style activity grid and a daily streak.
- Completed matches against humans or AI count towards activity and streaks. Reviews do not count.

- Resignations earn streak credit after each player has made five moves. Checkmate and stalemate always count; aborted games do not.
- Only rated human matches affect rank. AI games still count towards activity and streaks.
- Launch time controls: 5+3 and 10+5, with separate ratings per control.

- Use a traditional 3D chess set.

- Monetisation: free play plus a paid Plus subscription, provisionally EUR 8/month.
- Free: unlimited human and AI matches, rank, streak, activity grid, traditional 3D set and three AI reviews per month.
- Plus: 30 AI reviews per month, follow-up coach conversation, recurring-mistake tracking and premium sets and board materials.
- Existing generated reviews remain accessible. Conversation limits depend on measured engine and AI costs.
- Consider separate cosmetic set purchases later. No paid rank boosts or streak repairs.

- Launch as responsive web for desktop and mobile. Defer native apps.
- Board camera supports constrained rotation and zoom, a reset button and a stable default angle.

- Default to 3D; provide an optional 2D board for accessibility and weaker devices, sharing matches, controls and reviews.

- Require an account before any play, including computer matches.

- Launch sign-in uses email magic links only.

- Disconnects pause the match clock, capped at 60 seconds total per player per match. Reconnect resumes immediately. Once allowance is exhausted, the clock keeps running.

- During disconnect pauses, keep the board visible and show the pause countdown to both players.

- After 30 seconds without a public match, offer a clearly labelled AI match. Player acceptance cancels the human matchmaking queue. Never present bots as humans.

- Offer four selectable computer difficulty levels. Suggest a level from onboarding and match history; the player chooses. Avoid Elo labels until calibrated.

- Art direction: realistic Baroque wooden chess pieces in a café with Baroque architecture inspired by central Madrid. See `docs/cafe-environment.md` for the proposed room, materials, lighting and framing.

- Café is a fixed scene around the board, viewed through the constrained board camera, rather than an explorable environment.

- Opponent communication uses preset phrases only at launch, with a mute control.

- Friend invitations create casual games only at launch. Rated opponents come from public matchmaking.

- Profiles show public usernames and ranks. Activity grid is public by default with a hide control. Email, reviews and coach conversations remain private.

- Streaks use the player-selected timezone, defaulting to the browser timezone. Attribute matches to their completion date. Timezone changes apply the next day.

- Launch languages: British English (en-GB), European Spanish (es-ES) and European French (fr-FR), for both interface and coach responses. Keep chess notation consistent.

- Launch is for adults aged 18 and over.

- First release is an invite-only beta before open registration. Validate rated play, mobile 3D performance and coaching costs with the beta group.

- Provide a waitlist for beta access.
- Beta participants receive 30 days of Plus without providing a payment card.

- Admit waitlist members through manual invitation batches. Collect email and preferred language; ask skill level during onboarding.

## Confirmed technical decisions

- pnpm, one package, TypeScript, Vite and React. No monorepo tooling initially.
- React Router for navigation; React state initially. Live match state arrives through WebSockets.
- Three.js through React Three Fiber, Drei and React Spring.
- Tailwind CSS and Base UI primitives. Select components from Skecher UI, Componentry or Rare UI according to need; adapt them to shared styling and accessibility.
- Cloudflare Vite plugin, Workers Static Assets and Worker API in one same-origin deployment.
- One SQLite-backed Durable Object per live match owns accepted moves, clocks, disconnect allowance and result. Derive clock time from timestamps rather than per-second server ticks.
- One matchmaking Durable Object coordinates beta queues and assignment/cancellation races; split only if measured load requires it.
- D1 for shared persistent records; Drizzle from the outset, including schema migrations. Live match state remains in its Durable Object.
- Better Auth magic links with invitation checks before account creation; Resend delivers authentication emails.
- chess.js shared between server and browser. Server validates moves and results; app policies handle draw claims and timeouts.
- Stockfish.js lite, single-threaded, lazy-loaded in a browser Web Worker for computer play and post-game analysis. Device-dependent strength and active-tab requirements are accepted for beta.
- Browser analysis is untrusted input. Server validates suggested move legality; this does not establish evaluation or explanation accuracy.
- External coach model selected through accuracy, language and cost evaluations before coaching ships. Gameplay never depends on model availability.
- Model outage preserves human/computer play, clocks, results, engine replay and saved reviews. Show unavailable state with manual retry; failed generation consumes no review allowance. No automatic paid fallback model.
- react-i18next with local translations and native Intl. Newly generated coach reviews and replies use the selected UI language: en-GB, es-ES or fr-FR. Keep chess notation consistent.
- Language changes affect future coach output only. Persist each review's generation language and preserve saved text. When it differs from the current UI language, show a notice in the current UI language naming the review language. No automatic translation or additional review charge.
- Manual invitation batches use an authenticated operator-only page. Operators select waitlist members, preview a batch and send invitations; enforce operator access on the server.
- Vitest for deterministic rules and clocks; Playwright for browser journeys, including two-session multiplayer checks.
- Start with free infrastructure for development and a small invited beta, monitor usage before invitation batches and accept free-tier hard limits. No EUR 100 monthly target.
- First online delivery is the working waitlist; retain the full agreed product scope for subsequent slices.
- Use free beta assets with commercial-use licences; record licences and attribution. Select actual models before 3D implementation.
- Target at least 30 FPS during mobile board interaction, with automatic graphics quality reduction and a manual 2D fallback. Verify on named iPhone and Android devices before beta; specific devices remain to be selected.
- Defer payment provider selection until the subscription ticket. Deliver card-free beta Plus first.
- Run checks before committing and pushing to main by default. Keep runtime secrets in Cloudflare and deployment credentials in GitHub Actions secrets.

## Open decisions

- Teaching profile definitions and computer difficulty calibration.
- Visual style, model sources and camera controls.
- Devices, input methods and accessibility.
- Rating algorithm, matchmaking tolerance and remaining match policies.
- Coach model, subscription provider, assets, mobile budgets.

## Agent skills

### Issue tracker

Local Markdown issues live under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the five default triage labels. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout with root `GLOSSARY.md` and `docs/adr/`. See `docs/agents/domain.md`.

<!-- galicia:start -->

## Galicia

Read context.md first; load relevant domain context only. Domain terms: docs/Language.md. Decisions: docs/adr/. Specs/tickets: docs/specs/. Local Markdown only. No emojis. Preserve checks, exact contracts and uncertainty. Before consequential ADR work, recommend scoped small-model research/review; spawn only when authorised.

Startup review fallback: run `node .galicia/check.ts` once per session if no startup hook ran. Metadata flags are review candidates; never delete without explicit user approval. Follow relevant specs to compare implementation when needed; age alone proves nothing. Grilling cadence: read .galicia/config.json, ask user if unset.
<!-- galicia:end -->

## Confirmed billing delivery update, 2026-10-31

- Stripe is the chosen subscription provider. Leo chose live-mode integration instead of creating a separate sandbox.
- One Ludus Plus product, EUR 8 monthly with inclusive-tax price behaviour; local currency conversion remains subject to verified account eligibility.
- Purchase remains supported throughout beta, including its final 48 hours. Preserve original beta expiry and explicit purchase consent.
- Tax, account activation, currency eligibility and provider verification still block charging. See `.scratch/ludus/stripe-spec.md`, `.scratch/stripe/` and `docs/stripe.md` for agreed terms, gates and current evidence.

## Confirmed review-pack update, 2026-11-01

- Supersedes the subscription offer above. Remove Plus purchase/paywalls; all boards/materials and unlimited Stockfish reviews are free.
- Sell 10 coach reviews for EUR 4.99 as a one-time Stripe-hosted Checkout purchase. Credits never expire. Give each account one introductory coach review.
- One coach credit covers one completed match, its three preceding completed matches where available, and five successful follow-up questions. Failed generation consumes no credit or follow-up allowance.
- Reopen saved reviews free. No paid regeneration or automatic translation in the MVP.
- Preserve beta grants at 30 reviews per UTC month until original expiry, and permanent complimentary grants at 30 per month indefinitely. Spend free allowance before purchased credits.
- Refund unused packs on request; manually review partially used packs and honour mandatory consumer rights. Disputes freeze only the affected pack's remaining credits.
- Update pricing, terms, refunds and privacy disclosures, including server-side model processing and prior-match analysis. Preserve the existing charging gates.
- Implementation and live catalogue configuration authorised. Commit, push, remote migration, deployment and charging activation require separate authorisation.
