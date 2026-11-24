# Product manager review, 11/23

Mike's call C44 (11/23): Claude as product manager, with four researchers working in parallel, ending in at
most 10 improvements for Mike to review. The ranked list is on the runbook's Product Vision tab
("Raised 11/23: product manager review") and in `docs/PRODUCT_VISION.md`; the top five are Open
calls C45 to C49 on the runbook.

Each item names its source, and only the first two kinds are evidence:

- **users:** TripTab's own PostHog data (test runs left out) and the pod's written notes.
- **competitors:** public reviews and pricing pages, each linked. Reddit refused automated reads, so
  there is no Reddit evidence.
- **AI:** expert judgment from a UX pass on TripTab dev at 390 and 1280 wide. No user has seen these
  screens in this form; the pod test on 11/24 is the first check.

| File | What it holds |
| --- | --- |
| [`pm-evidence.md`](./pm-evidence.md) | The live funnel since triptab.org went up (11/18), the 11/17 pod test in PostHog, and which raised items are still open |
| [`pm-competitors-money.md`](./pm-competitors-money.md) | Splitwise, Tricount, Settle Up and Splid: joining, pricing, what reviewers praise and hate |
| [`pm-competitors-planners.md`](./pm-competitors-planners.md) | Wanderlog, TripIt and Lambus in depth, Troupe and Mindtrip briefly |
| [`pm-ux.md`](./pm-ux.md) | The UX pass: the friend's first minute, the owner's core loop, what to keep. Its screenshots stayed in the session and aren't committed |

The test accounts the UX pass made are on TripTab dev only, labeled `uxtest-...@example.com`.

## 11/24: build spec from Mike's 11/23 ski trip test

[`spec-11-23.md`](./spec-11-23.md) turns Mike's notes from setting up the real ski trip (plus PostHog replays and read-only production queries) into ten items, T1 to T10, each with its evidence, the behavior wanted and checks a build session ticks with evidence. The calls it waits on are C58 to C61 on the runbook.
