# Guest computer play

Accepted 2026-11-24. Supersedes the “guest play out of scope” note in `ludus.md` for anonymous computer games only.

## Problem

Public listings (itch.io, Product Hunt) send visitors to a waitlist. They cannot try Ludus without an invited account.

## Solution

Offer rate-limited guest sessions that can start and finish casual computer games against Lucía from the landing page and `/play`. Keep invite-only accounts, online play, coaching, rated queues, billing and operator flows unchanged.

## Identity

- Signed HttpOnly cookie `ludus_guest` (HMAC-SHA256 with `BETTER_AUTH_SECRET`).
- Payload: guest user id and expiry (seven days).
- Each guest receives a synthetic `user` row (`guest+<id>@guest.ludus`), minimal `player_profiles` row and `timezone_history` (UTC). No Better Auth session.
- Authenticated sessions take precedence over a guest cookie.

## Limits

| Control                                   | Value                                              | Rationale                    |
| ----------------------------------------- | -------------------------------------------------- | ---------------------------- |
| Session start (`POST /api/guest/session`) | 10 per IP per 60s (`GUEST_LIMITER`)                | Match waitlist abuse posture |
| Finished games per guest id               | 10 lifetime                                        | Cap D1/DO cost per browser   |
| Active games                              | 1 (existing resume logic)                          | Prevent parallel DO load     |
| Controls / difficulty                     | Same as signed-in computer play                    | Honest demo                  |
| Activity grid / rank                      | No recording (no timezone history beyond UTC stub) | Guests are not players       |

Guests cannot call `/api/account`, `/api/online/*`, `/api/coach/*`, billing or operator APIs.

## Product UX

- Landing page: primary **Play now** → `/play?guest=1` beside waitlist.
- `/play`: guest entry with adult attestation; lobby without online/profile links; post-game upsell to waitlist or sign-in; no coach review link.
- Visible Stockfish GPLv3 credit with links to `/engine/Copying.txt` and `/engine/SOURCE.txt` during play.

## Cleanup

Daily purge deletes guest users older than 30 days (cascade via existing FKs and explicit match cleanup where needed).

## Testing

- Unit: guest cookie signing, limits, `gameApi` identity boundary with guest cookie.
- E2E: logged-out visitor starts and finishes a computer game locally.

## Open decisions

- **Turnstile** on guest session if IP rate limits prove insufficient (same gate as waitlist).
- **Guest difficulty default** remains player-chosen; no separate public “demo” strength.
- **Engine source mirroring**: `/engine/SOURCE.txt` is generated from the pinned npm distribution; operators should confirm the public URL satisfies their GPLv3 offer-before-convey preference (see `deployment.md#engine-licence`).
