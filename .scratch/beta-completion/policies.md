# Remaining policy decisions

Status: approved

Approved by Leo on 2026-10-30 for implementation. Continue implementation waves without further approval requests. Beta admission still requires recorded operational/device validation; paid checkout remains disabled and model selection requires measured evaluation.

## Admission and personal data

- Adults self-attest age 18+ before requesting a magic link and during onboarding. Store attestation timestamp and policy version, no date of birth.
- Authorise operators with an explicit server-side allowlist of verified account IDs. No client flags or email-domain rules.
- Invitations expire after seven days, redeem once against the invited verified email. Existing admitted accounts retain access. Reissue explicitly, preserving an audit trail.
- Start with at most ten invitations per batch. Operator confirms Cloudflare and Resend capacity before sending. Stop on delivery/quota failure and retry with stable provider idempotency keys.
- Account deletion revokes sessions immediately, deletes private reviews/conversations/profile data and anonymises retained match records. Retain abuse reports for 90 days and delivery metadata for 30 days. Delete uninvited waitlist entries after 180 days. Explain these periods before collecting data.

## Human matches and ratings

- Use Glicko-2 independently for 5+3 and 10+5. Initial rating 1500, deviation 350, volatility 0.06; show provisional status for first ten rated games. Process one completed match per rating period and persist both changes exactly once.
- Search within 200 rating points initially, widen by 100 every 15 seconds up to 600. Never mix controls or casual/rated queues. No automatic AI assignment.
- Friend invitations last 24 hours, casual only. Creator chooses white, black or random; assign random once server-side at redemption.
- Offer draw agreement after each side has made a move. Threefold repetition and fifty-move draws require a claim; fivefold repetition and 75 moves are automatic. Checkmate takes precedence on the last move.
- Timeout draws when the opponent cannot possibly mate through any legal continuation. Do not enable rated play until this is implemented and tested against known difficult material positions.
- Abort only before both players have made a move, no rank/activity credit. Otherwise resignation or timeout decides the game.
- Pause while either disconnected player has allowance remaining, charging each disconnected player their own overlapping elapsed time. Resume when neither player has allowance left or both reconnect. Cap each player's total at 60 seconds.
- Accept server receipt order for conflicting legal actions; terminal result is immutable. Report categories: suspected assistance, abusive preset spam, other. Operators review reports manually; no automatic cheating verdict or rating reversal in beta.

## Activity and timezones

- Checkmate and stalemate always count. Resignation counts only after each player made five moves. Other completed draws/timeouts count after each player made five moves. Aborts and reviews never count.
- Attribute each match once by its completion timestamp in the timezone effective then. Preserve historical dates.
- Timezone changes take effect at the next midnight in the currently effective timezone. Repeated changes replace the pending zone without postponing activation. Apply the last requested valid IANA zone at that instant, including across daylight-saving changes.
- Public activity defaults on. Hiding activity removes it from public API responses as well as profiles.

## Teaching and review allowances

- Four profiles: beginner explains rules and immediate threats; developing explains tactics and simple plans; club explains candidate moves and positional trade-offs; advanced uses concise variations and deeper evaluation. Teaching and computer strength remain independent.
- Suggest profile changes after ten reviewed matches; player must explicitly accept. No automatic changes.
- Calendar-month quotas reset at 00:00 UTC on the first. Free gets three, Plus thirty. Count successful saved reviews only; reserve in-flight requests atomically and release on failure. Retrying a request uses a stable idempotency key.
- Trial starts on first completed onboarding, lasts exactly 30 days. Never resets on sign-in. On expiry use the free quota minus successful reviews already generated that month, floored at zero; saved reviews remain readable.
- Plus conversations allow twenty successful replies per review and a total of 200 replies per calendar month. Preserve saved conversations after downgrade; generation requires current Plus.
- Retain reviews/conversations until account deletion or explicit owner deletion. Send only necessary pseudonymous game data to the selected provider. Never send email.
- Model gate: evaluate at least 40 fixed positions across four profiles and three languages. Require all suggested variations legal, no critical factual errors, at least 90% rubric pass per language/profile, and recorded median/p95 latency and cost. Maximum USD 0.05 per review and USD 10 total initial evaluation spend; production spending cap USD 20/month. Stop generation at cap, no paid fallback. Provider/model selected only from measured evidence.

## Payments and assets

- Keep paid checkout disabled during invite-only beta. Payment provider, final EUR price, tax, renewal, cancellation and refund terms remain a separate explicit approval before implementation or charges.
- Continue project-authored café/wooden set, with asset inventory and licence records. Final visual acceptance remains Leo's decision.
- Proposed performance devices: iPhone 13/Safari and Pixel 6/Chrome. Require at least 30 FPS during board interaction in both orientations, 2D fallback, touch selection, zoom/reset, reduced motion and no accidental move during camera gestures. Actual hardware measurement required; emulation is insufficient.
