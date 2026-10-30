# 22: Converse with the coach and track recurring mistakes

**What to build:** Plus players ask grounded follow-up questions and recognise patterns across their games.

**Blocked by:** 21: Grant and expire card-free beta Plus.

**Status:** ready-for-agent

- [ ] Ground private conversations in completed owned games and reviewed variations; enforce approved conversation limits and validate suggested move legality.
- [ ] New replies follow selected UI language and teaching profile, independently of saved review language and opponent difficulty.
- [ ] Track supported recurring mistakes across reviews; suggest teaching-level changes from history and require player approval.
- [ ] Enforce Plus access and approved retention; preserve gameplay and saved content during model outages. Test privacy, misleading prompts, limits and downgrade behaviour.

## Completion wave

Implemented current-language/current-profile grounded replies, Plus checks, twenty replies/review and two hundred/month reservations, saved conversation, supported recurring tags and explicit profile-suggestion acceptance after ten distinct reviewed matches. Privacy, failed retries, downgrade and deletion races have unit coverage. Model-generation remains gated on ticket19 evidence.
