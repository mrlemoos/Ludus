# 13: Exchange preset phrases and mute

**What to build:** Human opponents exchange approved preset phrases and can mute distractions.

**Blocked by:** 09: Play a friend through an invitation link.

**Status:** ready-for-agent

- [x] Offer localised phrases in all launch languages, rendered in the recipient UI language with no free-text entry.
- [x] Authorise match membership, validate phrase identifiers and limit spam server-side; respect mute in the receiving UI.
- [ ] Verify two-session delivery, mute and unauthorised messages without affecting clocks or move controls.

## Implementation progress

Implemented validated preset identifiers, recipient-language rendering in en-GB/es-ES/fr-FR, member-only delivery, server-side three-second spam limit and a receiving mute control. No free-text communication. SQLite DO tests verify opposing-socket delivery, non-member rejection and limits without changing game state. Final real two-session delivery/mute browser evidence remains an integration gate.

Local validation: 40 scoped unit tests passed across `human-game`, `rating`, `matchmaking` and `online-durable`. Full suite last passed 215 tests before the final extra socket-delivery case; production build and targeted online lobby browser journey passed. No deployment or live beta admission claimed.
