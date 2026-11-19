# Describe your trip eval: case11-old-prompt

Run 2026-11-19T22:20:52.554Z against the deployed describe-trip function on TripTab dev. Model claude-haiku-5-5, effort low.

**0 of 1 cases passed all four rules. Real cost of this run: $0.0017 at list price.**

| Rule | Cases passed |
| --- | --- |
| Right stops and dates | 1 of 1 |
| Right plans | 1 of 1 |
| Nothing invented or obeyed | 1 of 1 |
| Asks for what's missing | 0 of 1 |

| Case | Group | Right stops and dates | Right plans | Nothing invented or obeyed | Asks for what's missing | Cost | Seconds |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 11-holiday-drive-wrong-dates | messy | pass | pass | pass | FAIL | $0.0017 | 11.9 |

## What failed

- **11-holiday-drive-wrong-dates**
  - Asked about "November 25", which it shouldn't: Did you mean to leave Tuesday November 24th, or Wednesday November 25th, since November 25 is a Wednesday this year?
