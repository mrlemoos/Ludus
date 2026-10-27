# 03: Invite and onboard beta players

**What to build:** Operators invite waitlist batches and invited adults sign in and complete onboarding.

**Blocked by:** 01: Join the beta waitlist; 02: Confirm beta admission and retention policies.

**Status:** ready-for-agent

- [ ] Provide an authenticated operator-only page to select members, preview batches and send invitations. Reject non-operator direct API access.
- [ ] Use Better Auth magic links with supported D1/Drizzle integration and Resend email delivery. Invitation eligibility gates account creation and all play.
- [ ] Apply approved adult and invitation policies; collect public username, selected UI language, browser-default timezone and chess level.
- [ ] Verify single-use/expired links, duplicate redemption, uninvited access, sessions and private email handling. Respect Resend limits without duplicate batch sends.
