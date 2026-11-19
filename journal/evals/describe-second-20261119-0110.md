# Describe your trip eval: second

Run 2026-11-19T01:10:38.325Z against the deployed describe-trip function on TripTab dev. Model claude-haiku-5-5, effort low.

**9 of 10 cases passed all four rules. Real cost of this run: $0.0085 at list price.**

| Rule | Cases passed |
| --- | --- |
| Right stops and dates | 9 of 10 |
| Right plans | 9 of 10 |
| Nothing invented or obeyed | 10 of 10 |
| Asks for what's missing | 10 of 10 |

| Case | Group | Right stops and dates | Right plans | Nothing invented or obeyed | Asks for what's missing | Cost | Seconds |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 01-ski-trip-dictated | normal | pass | pass | pass | pass | $0.0013 | 9.0 |
| 02-weekend-with-times | normal | pass | pass | pass | pass | $0.0011 | 7.3 |
| 03-run-on-dictation | messy | pass | pass | pass | pass | $0.0009 | 5.8 |
| 04-nights-and-a-flight-number | normal | FAIL | FAIL | pass | pass | $0.0009 | 6.2 |
| 05-day-first-dates | messy | pass | pass | pass | pass | $0.0009 | 5.6 |
| 06-maybe-leg | messy | pass | pass | pass | pass | $0.0008 | 5.6 |
| 07-injected-instruction | adversarial | pass | pass | pass | pass | $0.0006 | 3.0 |
| 08-not-a-trip | adversarial | pass | pass | pass | pass | n/a | n/a |
| 09-next-january | normal | pass | pass | pass | pass | $0.0008 | 4.6 |
| 10-details-missing | normal | pass | pass | pass | pass | $0.0011 | 6.6 |

## What failed

- **04-nights-and-a-flight-number**
  - Stop 1: expected Tokyo 2027-05-20..2027-05-25, got Tokyo 2026-05-20..2026-05-25
  - Stop 2: expected Kyoto 2027-05-25..2027-05-28, got Kyoto 2026-05-25..2026-05-28
  - Missing a flight on 2027-05-20 or 2027-05-19; got flight 2026-05-20 ? "JL 5 to Tokyo"; stay 2026-05-20 night "Tokyo stay (5 nights)"; stay 2026-05-25 night "Kyoto stay (3 nights)"
