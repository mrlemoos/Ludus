# 09: Play a friend through an invitation link

**What to build:** Two invited accounts complete a casual human match using a friend link.

**Blocked by:** 05: Complete a timed computer match in 2D.

**Status:** ready-for-agent

- [ ] Create and redeem casual-only invitations for either control, applying approved expiry and colour rules.
- [ ] Use authenticated WebSockets and the match Durable Object to validate membership, turn order, clocks and results.
- [ ] Prevent repeated redemption and concurrent joins from creating duplicate matches or seats; persist completed human games.
- [ ] Verify complete two-session play, illegal direct actions and replay/reload recovery. Human play remains usable when the coach provider is unavailable.
