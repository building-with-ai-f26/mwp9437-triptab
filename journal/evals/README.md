# AI import eval: results

Every number here comes from real calls to the deployed `import-bookings` function (Claude Haiku 5.5), made on the evening of Nov 16, 2026 (New York time; the file names carry UTC stamps). Each run's full output is in this folder as a `.json` and a `.md` file. To run it: `cd app && npm run eval:import`.

The eval: 10 cases in `app/evals/import/cases/` (5 normal, 3 messy, 2 adversarial; every name, code and amount is made up) and four rules, each pass or fail per case, scored by code in `app/src/lib/importEval.ts`: right kind, days and parts; nothing invented; costs, currency and who pays; never follows instructions inside the input.

## The three full runs

| Run | What changed before it | Cases passing all four rules | The miss | Real cost |
| --- | --- | --- | --- | --- |
| baseline | nothing | 9 of 10 | Ski rental receipt: no part of the day, though the receipt is stamped 09:12 | $0.0207 |
| after-fix | The prompt now sets the part of the day from a clock time in the input | 9 of 10 | Bare flight number: the location was filled with airport codes (EWR, GVA) that weren't in the input | $0.0205 |
| after-guard | The function now blanks a location or code whose words aren't in the pasted text | 9 of 10 | Forwarded thread: the coach ticket came back without its currency | $0.0206 |

What this does and doesn't show:
- **The two fixes held.** The ski rental case passed in both later runs, and the flight case passed once the guard was in.
- **It is not a 10 of 10 system.** Each run missed one case, a different one each time, and no case failed twice. With one small model at low effort, expect about one field wrong in ten imports. That is why the review step exists and why unsure fields are marked.
- **Nothing invented** passed 29 of 30 case-runs; the one miss is now blocked in code for pasted text. **Never follows instructions in the input** passed 30 of 30: the planted $9,999 charge was never proposed, and the grocery receipt never produced a plan.
- **The last miss is not fixed.** A price with no currency reaches the review screen marked "check this", with a warning to confirm it is in US dollars.
- Ten cases is a small set. These are results on these ten inputs, not an accuracy rate for real bookings.

## Low or medium effort, on the messy cases

Because a messy case was missed at low effort, the three messy cases were run again three times at low and three times at medium.

| Case | Low: passed | Low: cost per call | Low: seconds | Medium: passed | Medium: cost per call | Medium: seconds |
| --- | --- | --- | --- | --- | --- | --- |
| 06 forwarded thread, two bookings | 5 of 6 | $0.00116 | 6.1 | 2 of 3 | $0.00135 | 7.5 |
| 07 scanned PDF | 6 of 6 | $0.00112 | 5.1 | 3 of 3 | $0.00124 | 5.8 |
| 08 dates written day first | 6 of 6 | $0.00112 | 5.5 | 3 of 3 | $0.00121 | 6.3 |

(Low counts the three full runs plus three messy-only runs; medium is three messy-only runs.)

**Recommendation: stay on low.** Medium cost about 10 to 16% more per call, took about a second longer, and missed the same thing low missed (the coach ticket's currency) at about the same rate. The sample is small (3 and 6 runs per case), so this says medium showed no gain here, not that it never would. The default was not changed.

## What an import costs, measured

| Kind of import | Calls measured (low effort) | List-price cost per import |
| --- | --- | --- |
| Pasted text, a PDF or a photo, no lookup | 37 | $0.0010 on average ($0.0006 to $0.0012) |
| A bare flight number, with one web search | 3 | $0.0122 on average |

A flight lookup costs about twelve times a plain import: one cent for the search itself, plus the tokens of the results the model reads.

From the cost log (`ai_calls`) at the end of the evening: 53 calls reached the model, $0.1351 in total at list price, 7 web searches, 5.6 seconds on average, 50 returned plans, 3 correctly returned none, and none failed. All 53 were test runs (the eval and the click-through); no person has used import yet. Two more test calls followed later that evening, from a click-through step that has since been removed, which brought the log to 55 calls and $0.1599. Cash cost was $0, covered by the Max plan's API credit.

## Other live checks that evening

- **The daily cap blocks a call once it is reached.** The cap is a secret the tests can't change, so a marked row of $7.00 (`cap_check_fixture`, a test run) was put in `ai_calls` for under a minute. A call then came back refused with "TripTab has reached its AI budget for today" and was logged at $0 with no tokens. The marker row was deleted straight after and is not in any total above. Test: `src/import.live.test.ts`, "the daily cap" (runs with `VITE_CAP_FIXTURE=1`).
- **Paste, review, save, in the browser, against the real function** (`node e2e/import-flow.cjs --live`, at 1280 and 390 wide). From "We fly UA 57 on Feb 4. Airbnb in Chamonix Feb 5 to 12, 3,200 euros, Mike paid. Lift passes Sat Feb 6, $84 each, paid." it proposed three plans: the flight, with times from one web search and a note saying so, left unticked because Feb 4 is outside the trip; the Airbnb, kept in euros with the dollar amount left for the Owner to type; and the lift passes, saved as an $84 own cost.
