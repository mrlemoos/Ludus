# Ludus product specification

## Problem Statement

Adult chess players want online competition and practice against a computer in a convincing 3D setting. They also want to understand their mistakes after each game through explanations suited to their level, and track their playing habits and rank.

## Solution

Build a responsive chess website set at a table in a neoclassical café inspired by central Madrid. Players use realistic wooden pieces, play human or computer opponents, and request an interactive review and written summary after the match. A conversational coach explains engine analysis at the player's selected teaching level. Coaching is unavailable during play.

Launch through a waitlist and manually invited beta. Keep play free; sell expanded coaching and cosmetics through Plus.

## User Stories

1. As a visitor, I want to join the waitlist with my email and preferred language, so that I can receive beta access.
2. As an operator, I want to invite waitlist members in batches, so that I can control beta capacity.
3. As an invited adult, I want to sign in through an email magic link, so that I can play without managing a password.
4. As a player, I want an account before any match, so that my activity and games belong to my profile.
5. As a new player, I want to state my chess level during onboarding, so that coaching explanations suit me.
6. As a player, I want British English, European Spanish or European French, so that the interface and coach use my preferred language.
7. As a player, I want a realistic wooden set in a Madrid café, so that playing feels like sitting at a chess table.
8. As a player, I want constrained camera rotation, zoom and reset, so that I can inspect the board without losing orientation.
9. As a mobile player, I want reliable touch controls, so that camera gestures do not cause accidental moves.
10. As a player, I want an optional 2D board, so that I can play with accessible controls or on a weaker device.
11. As a player, I want the same match and review in either board view, so that changing presentation preserves my progress.
12. As a player, I want to invite a friend to a casual match, so that we can play together.
13. As a player, I want public casual matchmaking, so that I can meet opponents without risking rank.
14. As a competitive player, I want rated public matchmaking, so that results affect my rank.
15. As a player, I want 5+3 and 10+5 games, so that I can choose my pace.
16. As a competitive player, I want a separate rating for each time control, so that my results reflect that format.
17. As a waiting player, I want an AI alternative after 30 seconds, so that I can choose practice instead of waiting.
18. As a player, I want computer opponents clearly identified, so that I know whom I am playing.
19. As a player, I want four computer difficulty levels, so that I can choose a suitable challenge.
20. As a player, I want difficulty suggestions without forced changes, so that I retain control.
21. As a disconnected player, I want a bounded clock pause and reconnection, so that brief connection problems do not immediately lose my time.
22. As an opponent, I want a visible pause countdown, so that I know when play resumes.
23. As a player, I want the board visible during a pause, so that I can continue studying the position.
24. As a player, I want preset phrases and mute, so that I can communicate briefly and control distractions.
25. As a player, I want to resign or agree a draw through clear controls, so that a match can end correctly.
26. As a player, I want completed human and computer games shown in an activity grid, so that I can see my playing habits.
27. As a player, I want a daily streak based on completed matches, so that it reflects playing rather than opening reviews.
28. As a player, I want streak dates to follow my chosen timezone, so that my local day determines credit.
29. As a player, I want rank to reflect rated human games only, so that AI practice cannot inflate it.
30. As a player, I want an interactive post-game replay, so that I can inspect each move and alternatives.
31. As a player, I want a written review summary, so that I can understand the main lessons.
32. As a player, I want engine-grounded coach explanations, so that advice refers to valid chess analysis.
33. As a Plus player, I want follow-up coach conversation, so that I can ask why a move works.
34. As a player, I want four teaching profiles independent of opponent strength, so that explanation depth suits my understanding.
35. As a player, I want to approve suggested teaching-level changes, so that adaptation remains under my control.
36. As a Plus player, I want recurring mistakes tracked, so that reviews help me identify patterns across games.
37. As a free player, I want unlimited human and computer play with three AI reviews monthly, so that I can use the core product without subscribing.
38. As a Plus player, I want 30 monthly AI reviews and premium sets and materials, so that my subscription has clear benefits.
39. As a player, I want existing reviews to remain accessible, so that revisiting one does not consume another review allowance.
40. As a beta participant, I want 30 days of Plus without a card, so that I can evaluate coaching before paying.
41. As a player, I want a public username and rank but private email and coaching records, so that competition does not expose private information.
42. As a player, I want to hide my activity grid, so that I control whether others see my playing habits.
43. As an operator, I want coaching cost and usage measurements, so that subscription limits remain sustainable.

## Implementation Decisions

### Confirmed product decisions

- Use TypeScript and British spelling. Localise interface and coach to en-GB, es-ES and fr-FR; keep chess notation consistent.
- Responsive web supports desktop and mobile. No native app at launch.
- Require accounts for all play. Launch authentication uses email magic links only. Beta access is invite-only and limited to adults aged 18 and over.
- Waitlist collects email and preferred language. Operator admits members in manual batches. Skill level is requested during onboarding.
- Traditional realistic wooden pieces sit in a fixed neoclassical café scene inspired by central Madrid, with quiet studio lighting. The environment is not explorable.
- Default to 3D, with constrained rotation, zoom, reset and a stable default angle. Offer optional 2D presentation using the same matches, controls and reviews.
- Support friend invites and public matchmaking. Friend matches are casual only. Public matches may be casual or rated.
- Offer 5+3 and 10+5 time controls, with separate ratings. Only rated human games affect rank.
- After 30 seconds in the public queue, offer a clearly labelled AI match. Accepting cancels the human queue. Never present bots as humans.
- Offer four selectable computer difficulty levels, with suggestions from onboarding and history. Do not attach Elo labels before calibration.
- Computer opponent and coach share a character identity. Opponent difficulty and teaching level are independent.
- Disconnect pauses have a cumulative allowance of 60 seconds per player per match. Reconnect resumes immediately; after the allowance is exhausted, clocks continue. Keep the board visible and show both players a countdown.
- Opponent communication uses preset phrases and mute, without free-text chat.
- Completed human and AI matches count towards activity and streaks; reviews do not. Resignations count after each player makes five moves. Checkmate and stalemate always count; aborts never count.
- Attribute activity to match completion date in the player's chosen timezone, defaulting to browser timezone. Timezone changes take effect the next day. Exact transition semantics remain to be specified.
- Profiles expose username and rank. Activity is public by default with a hide control. Email, reviews and coach conversations are private.
- Reviews are available only after a match ends, for both human and AI games. Include interactive move-by-move replay and a written summary.
- Use one conversational coach model with four teaching profiles, grounded in engine analysis. Engine validates suggested moves. Fine-tuning is deferred unless evaluations show profiles are insufficient.
- Suggest teaching-level changes using match history; require player approval.
- Free includes unlimited play, rank, activity, streak, the traditional set and three AI reviews monthly.
- Plus provisionally costs EUR 8/month and includes 30 AI reviews monthly, follow-up coach conversation, recurring-mistake tracking and premium sets and board materials.
- Existing generated reviews remain accessible. Conversation limits depend on measured costs. No paid rank boosts or streak repairs.
- Beta participants receive 30 days of Plus without a payment card. Trial expiry must not trigger a charge without a separate subscription purchase.

### Confirmed technical decisions

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

### Proposed technical boundaries

The following safeguards remain proposed unless covered by the confirmed decisions above.

- Separate authoritative match rules, clocks and results from board rendering. Validate human moves and rating changes on the server; clients render accepted state.
- Store accounts, beta invitations, profiles, games, moves, queue membership, ratings, activity, review jobs, generated reviews, coach conversations and subscription entitlements.
- Use a shared rules boundary for legal moves and terminal results, with 2D and 3D consuming the same match state.
- Keep engine analysis separate from language generation. Ground explanations in the analysed position and variations; legal move validation alone does not prove that a strategic explanation is correct.
- Enforce finished-match access and ownership before analysis or coach conversation. Live matches must not expose analysis through review endpoints.
- Make match finalisation, rating updates, activity credit and billing event processing idempotent. Resolve queue cancellation and match assignment races atomically.
- Provision real authentication, storage, AI and payment integrations before app implementation uses them. Provision each integration before its dependent delivery slice; coach model and payment provider remain unselected.
- Provide the confirmed operator-only page for selecting waitlist members, previewing batches and sending invitations.

## Testing Decisions

Vitest and Playwright are confirmed. Waitlist and local computer-match validation and browser/API journeys are implemented. Multiplayer, rated-play, coaching and billing coverage remains proposed.

- Prefer external behaviour through browser journeys backed by the real application API. Use two browser sessions for human matches and reconnect scenarios. Avoid testing component structure or internal call sequences.
- Add focused deterministic domain tests where real-time browser tests cannot reliably cover clocks, rating updates, timezone transitions and concurrency. Control time at the application boundary rather than waiting in tests.
- Test waitlist submission, duplicate handling, invite redemption, magic-link expiry and account access. Uninvited accounts must not gain beta access.
- Test move legality and terminal results, including castling, en passant, promotion, checkmate, stalemate, draws, resignation and timeout. Final draw and timeout policies must be specified before these checks are finalised.
- Test both time controls, increments, cumulative disconnect allowance, reconnect, repeated disconnects and authoritative recovery. Specify simultaneous disconnect policy before implementation.
- Test casual and rated queues, friend invites, rating isolation per control, AI exclusion from rank and the 30-second offer. A player must not enter two matches through a race.
- Test activity eligibility, midnight, daylight-saving transitions, timezone changes and duplicate finalisation. Review access must never increment activity.
- Test model outages without disrupting matches, clocks, results, engine replay or saved reviews. Verify manual retry and no allowance consumption on failed generation.
- Test that new reviews and coach replies follow the selected UI language across en-GB, es-ES and fr-FR. Saved reviews retain their generation language and text; a mismatch notice uses the current UI language. Changing language neither translates saved reviews nor consumes allowance.
- Test invitation batch selection, preview and sending; reject non-operator access through both UI and direct API requests.
- Test that review generation is blocked during live play and for another player's private games. Retries must not double-charge review allowance.
- Evaluate coach output against known positions across four teaching profiles and all three languages. Check suggested moves, factual explanations and appropriate uncertainty; include misleading user prompts and instructions embedded in user content.
- Test free and Plus allowances, review reopening, 30-day beta expiry and verified billing events. Failed generation and monthly reset rules must be decided first.
- Verify keyboard and touch interaction, 2D switching, camera reset, reduced motion, board readability and selected real mobile devices. Set measurable graphics budgets before acceptance.
- Verify public profile exposure, hidden activity and private coach records through both UI and direct API requests.

## Out of Scope

- Native mobile apps at launch.
- Explorable café environments or animated character pieces.
- Coaching, hints or engine assistance during live matches.
- Guest play, passwords and social sign-in at launch.
- Free-text opponent chat.
- Rated friend invitations or rating gains from AI matches.
- Fine-tuning separate models as the initial coaching approach.
- Paid rank boosts and streak repairs.
- Standalone cosmetic purchases at launch; these remain a later possibility.
- A complete clone of chess.com's tournaments, clubs, lessons, puzzles or other unrequested features.

## Further Notes

- A local playable computer-match slice is implemented at `/play`: real seeded account, Better Auth magic-link sessions, Drizzle/D1 records, authoritative SQLite match Durable Objects and WebSockets, Stockfish lite browser opponent, both controls and colours, four provisional strengths, switchable procedural 3D/accessible 2D, promotion, saved results and private linear replay/PGN export. Public multiplayer, ratings, activity, coaching, subscriptions, operator invitations and full onboarding remain outstanding. Casual draw/timeout handling and starter art are provisional; relevant ticket acceptance gates remain open.
- The waitlist slice is implemented with a Vite/React interface, Worker API, Drizzle schema and local D1. Type, build, validation and browser/API checks run locally. Remote service provisioning and deployment require refreshed Cloudflare authentication.
- Local Markdown tickets and triage states are configured in docs/agents/issue-tracker.md and docs/agents/triage-labels.md. The revised breakdown is published as 26 dependency-ordered tickets under .scratch/ludus/issues/.
- Confirmed first online delivery: working waitlist. Subsequent slices follow the published ticket dependencies; unresolved policies have explicit decision tickets. Open beta only once online play works.
- Resolve before relevant implementation: coach model and payment provider; asset sources and licences; four teaching profiles and difficulty calibration; rating algorithm, provisional ranks and matchmaking tolerance; fair-play reporting and enforcement; simultaneous disconnects; draw, timeout and activity eligibility rules beyond the agreed cases; streak timezone transition details; review quota resets and retry accounting, with failed generation consuming no allowance; coach conversation limits; premium asset availability; subscription currency, tax presentation and cancellation; adult onboarding and data retention; beta capacity and mobile performance targets.
- Engine analysis and language generation costs must be measured before confirming pricing. Model instructions alone do not guarantee accurate teaching.
- Disconnect pauses deliberately grant extra thinking time, including in rated games. This trade-off was accepted with the bounded allowance.
