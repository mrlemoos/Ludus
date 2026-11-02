# Mobile acceptance protocol

Approved reference devices: iPhone 13 with Safari, Pixel 6 with Chrome. Record actual OS/browser versions and build commit when testing. Browser emulation checks responsive layout; it does not prove device GPU performance or engine calibration.

## Acceptance

- Sustain at least 30 FPS during a 30-second session of square selection, camera rotation and zoom, from both seats, in portrait and landscape.
- Test traditional wood, walnut/marble boards and ivory/ebony finish. Distinguish all piece types, selected squares and legal destinations at default zoom.
- Record load time, renderer memory/geometry/texture counts and signs of tab reload or memory pressure. Initial beta investigation budgets are 10 seconds to an interactive board on a stable 10 Mbps connection, 100 MB transferred including lazy engine, and no context loss during a ten-minute game. These budgets guide investigation; only the 30 FPS target is a confirmed measured acceptance threshold.
- Confirm automatic quality reduction when frame rate falls below 30 FPS, without changing match state. Verify manual 2D fallback and unsupported-WebGL fallback.
- Confirm touch and keyboard selection, promotion, zoom/reset, reduced motion and no move during a camera drag. Verify clock visibility at every viewport size.
- Exercise disconnect/reconnect twice, exhaust the per-player allowance, and background/foreground computer analysis. The browser engine needs active execution.
- Compare the four computer settings without assigning Elo numbers. Record engine elapsed time and device impact, retaining explicit player difficulty choice.

## Evidence

| Device    | OS/browser   | Commit  | FPS     | Load/memory | Input/accessibility | Result       |
| --------- | ------------ | ------- | ------- | ----------- | ------------------- | ------------ |
| iPhone 13 | Not measured | Pending | Pending | Pending     | Pending             | Not accepted |
| Pixel 6   | Not measured | Pending | Pending | Pending     | Pending             | Not accepted |

No real-device performance claim is made by local Chromium tests.
