# 08: Play on the 3D café board

**What to build:** Players use the default 3D café board and switch presentation without losing match state.

**Blocked by:** 05: Complete a timed computer match in 2D; 07: Select licensed café assets and mobile test devices.

**Status:** ready-for-agent

- [ ] Use Three.js through React Three Fiber, Drei and React Spring with approved licensed assets and attribution.
- [ ] Provide constrained rotation/zoom/reset, stable orientation, readable selection and legal destinations. Camera gestures must not submit moves.
- [ ] Switch between 3D and accessible 2D while preserving match, clocks, controls and replay state; handle unsupported graphics safely.
- [ ] Meet approved named-device budgets, at least 30 FPS during interaction, automatic quality reduction and reduced-motion behaviour. Record actual device results.

## Implementation progress

Implemented lazy-loaded R3F/Drei/React Spring board with project-authored traditional lathed wooden pieces, procedural grain and starter café columns. Shared match state, selection and legal destinations survive 3D/2D switching. Camera rotation/zoom is bounded, reset works, pointer drags do not submit moves, reduced motion disables selection lift, graphics failures offer 2D and measured low FPS lowers resolution/shadows. Browser tests render 3D and verify mobile 2D/keyboard interaction. Starter geometry is not final art; named iPhone/Android performance and final asset acceptance remain outstanding.
