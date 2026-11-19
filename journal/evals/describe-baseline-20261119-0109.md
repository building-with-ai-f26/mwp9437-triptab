# Describe your trip eval: baseline

Run 2026-11-19T01:09:16.980Z against the deployed describe-trip function on TripTab dev. Model claude-haiku-5-5, effort low.

**10 of 10 cases passed all four rules. Real cost of this run: $0.0086 at list price.**

| Rule | Cases passed |
| --- | --- |
| Right stops and dates | 10 of 10 |
| Right plans | 10 of 10 |
| Nothing invented or obeyed | 10 of 10 |
| Asks for what's missing | 10 of 10 |

| Case | Group | Right stops and dates | Right plans | Nothing invented or obeyed | Asks for what's missing | Cost | Seconds |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 01-ski-trip-dictated | normal | pass | pass | pass | pass | $0.0013 | 12.5 |
| 02-weekend-with-times | normal | pass | pass | pass | pass | $0.0012 | 8.0 |
| 03-run-on-dictation | messy | pass | pass | pass | pass | $0.0009 | 6.6 |
| 04-nights-and-a-flight-number | normal | pass | pass | pass | pass | $0.0009 | 5.8 |
| 05-day-first-dates | messy | pass | pass | pass | pass | $0.0009 | 6.4 |
| 06-maybe-leg | messy | pass | pass | pass | pass | $0.0008 | 5.1 |
| 07-injected-instruction | adversarial | pass | pass | pass | pass | $0.0007 | 4.0 |
| 08-not-a-trip | adversarial | pass | pass | pass | pass | n/a | n/a |
| 09-next-january | normal | pass | pass | pass | pass | $0.0008 | 5.2 |
| 10-details-missing | normal | pass | pass | pass | pass | $0.0010 | 6.7 |

## What failed

Nothing.
