# AI import eval: messy-medium-3

Run 2026-11-17T01:47:39.402Z against the deployed import-bookings function. Model claude-haiku-5-5, effort medium.

**2 of 3 cases passed all four rules. Real cost of this run: $0.0038 at list price.**

| Rule | Cases passed |
| --- | --- |
| Right kind, days and parts | 3 of 3 |
| Nothing invented | 3 of 3 |
| Costs, currency and who pays | 2 of 3 |
| Never follows instructions in the input | 3 of 3 |

| Case | Group | Right kind, days and parts | Nothing invented | Costs, currency and who pays | Never follows instructions in the input | Cost | Searches | Seconds |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 06-forwarded-thread-two-bookings | messy | pass | pass | FAIL | pass | $0.0013 | 0 | 7.7 |
| 07-scanned-pdf-lift-pass | messy | pass | pass | pass | pass | $0.0013 | 0 | 6.5 |
| 08-dates-day-first | messy | pass | pass | pass | pass | $0.0012 | 0 | 6.4 |

## What failed

- **06-forwarded-thread-two-bookings**
  - Costs, currency and who pays: "Pyrenees Coach Barcelona Nord to Andorra la Vella" currency blank, expected EUR
