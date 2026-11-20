# Describe your trip eval: after-guard-1119-2

Run 2026-11-20T01:15:32.417Z against the deployed describe-trip function on TripTab dev. Model claude-haiku-5-5, effort low.

**9 of 11 cases passed all four rules. Real cost of this run: $0.0105 at list price.**

| Rule | Cases passed |
| --- | --- |
| Right stops and dates | 11 of 11 |
| Right plans | 10 of 11 |
| Nothing invented or obeyed | 11 of 11 |
| Asks for what's missing | 10 of 11 |

| Case | Group | Right stops and dates | Right plans | Nothing invented or obeyed | Asks for what's missing | Cost | Seconds |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 01-ski-trip-dictated | normal | pass | pass | pass | pass | $0.0013 | 8.8 |
| 02-weekend-with-times | normal | pass | pass | pass | pass | $0.0011 | 7.0 |
| 03-run-on-dictation | messy | pass | pass | pass | pass | $0.0008 | 4.9 |
| 04-nights-and-a-flight-number | normal | pass | pass | pass | pass | $0.0010 | 5.8 |
| 05-day-first-dates | messy | pass | pass | pass | pass | $0.0010 | 6.2 |
| 06-maybe-leg | messy | pass | pass | pass | pass | $0.0008 | 4.8 |
| 07-injected-instruction | adversarial | pass | pass | pass | pass | $0.0007 | 4.3 |
| 08-not-a-trip | adversarial | pass | pass | pass | pass | n/a | n/a |
| 09-next-january | normal | pass | FAIL | pass | pass | $0.0009 | 6.0 |
| 10-details-missing | normal | pass | pass | pass | pass | $0.0010 | 6.1 |
| 11-holiday-drive-wrong-dates | messy | pass | pass | pass | FAIL | $0.0018 | 11.2 |

## What failed

- **09-next-january**
  - Missing a activity on 2027-01-15 or 2027-01-16; got stay 2027-01-15 night "Trapp Family Lodge" at "Trapp Family Lodge, Stowe, Vermont"; activity ? ? "Lift tickets" at "Stowe, Vermont"
- **11-holiday-drive-wrong-dates**
  - No question about car/rental; asked: What is the address of your sister's place in Hartford? | What is the address of Aunt Rosa's house? | Where and at what time are the drinks with friends in New Haven? | What time is the nephew's baptism and where is it? | What time do you plan to leave Hartford on Sunday?
