# 16: View public profiles safely

**What to build:** Players view public usernames and ranks and control visibility of their activity grid.

**Blocked by:** 12: Play rated public matches and report fair-play concerns; 15: Track activity and daily streaks.

**Status:** ready-for-agent

- [ ] Expose public username and ranks per control; activity is public by default with an owner-only hide setting.
- [ ] Enforce hidden activity through direct API responses as well as the UI. Never expose email, private reviews or coach conversations.
- [ ] Verify owner, another signed-in player and visitor access according to approved profile policy.
