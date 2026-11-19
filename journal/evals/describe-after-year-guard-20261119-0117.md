# Describe your trip eval: after-year-guard

Run 2026-11-19T01:17:14.060Z against the deployed describe-trip function on TripTab dev. Model claude-haiku-5-5, effort low.

**9 of 10 cases passed all four rules. Real cost of this run: $0.0081 at list price.**

| Rule | Cases passed |
| --- | --- |
| Right stops and dates | 10 of 10 |
| Right plans | 9 of 10 |
| Nothing invented or obeyed | 10 of 10 |
| Asks for what's missing | 10 of 10 |

| Case | Group | Right stops and dates | Right plans | Nothing invented or obeyed | Asks for what's missing | Cost | Seconds |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 01-ski-trip-dictated | normal | pass | pass | pass | pass | $0.0012 | 8.0 |
| 02-weekend-with-times | normal | pass | FAIL | pass | pass | $0.0011 | 7.8 |
| 03-run-on-dictation | messy | pass | pass | pass | pass | $0.0008 | 4.7 |
| 04-nights-and-a-flight-number | normal | pass | pass | pass | pass | $0.0009 | 5.7 |
| 05-day-first-dates | messy | pass | pass | pass | pass | $0.0010 | 6.5 |
| 06-maybe-leg | messy | pass | pass | pass | pass | $0.0008 | 5.0 |
| 07-injected-instruction | adversarial | pass | pass | pass | pass | $0.0007 | 4.0 |
| 08-not-a-trip | adversarial | pass | pass | pass | pass | n/a | n/a |
| 09-next-january | normal | pass | pass | pass | pass | $0.0008 | 5.1 |
| 10-details-missing | normal | pass | pass | pass | pass | $0.0009 | 5.6 |

## What failed

- **02-weekend-with-times**
  - Missing a meal on 2027-03-14 (morning/day); got stay 2027-03-12 night "Airbnb house in Nashville"; meal 2027-03-12 evening "Dinner at Hattie B's"; activity 2027-03-13 day "Pedal tavern tour"; meal 2027-03-14 ? "Sunday brunch before flying home"
