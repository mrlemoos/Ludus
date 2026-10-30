# 16: View public profiles safely

**What to build:** Players view public usernames and ranks and control visibility of their activity grid.

**Blocked by:** 12: Play rated public matches and report fair-play concerns; 15: Track activity and daily streaks.

**Status:** ready-for-agent

- [x] Expose public username and ranks per control; activity is public by default with an owner-only hide setting.
- [x] Enforce hidden activity through direct API responses as well as the UI. Never expose email, private reviews or coach conversations.
- [x] Verify owner, another signed-in player and visitor access according to approved profile policy.

## Completion wave

Public profile API exposes username, separate provisional ranks and optional activity only. Owner hide setting removes activity from direct API output. Private email, teaching profile, reviews and conversation are excluded. Browser and SQLite tests verify hiding and account isolation.
