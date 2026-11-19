# Security audit log (Build 3)

What was tried against TripTab and what happened, as it happens. SECURITY.md is written from this
after the feature freeze. Every entry is a real run; the raw output sits beside this file.

## Attacks

| # | Date | Attack | Where | What happened |
|---|------|--------|-------|---------------|
| 1 | 11/19 | A stranger (account B, on no trip) reads another person's trip straight at the database's API: the trip, its stops, people, plans, group link, expenses, payments, to-dos; then lists all 14 tables unfiltered | triptab.org, production | Refused: every read empty, or "permission denied" for the server-only tables. `2026-11-19-rls-proof.json` |
| 2 | 11/19 | The same stranger writes to that trip: rename it, join as an Owner, add a plan, delete it | triptab.org, production | Refused: 0 rows changed, or "new row violates row-level security policy". The trip came through untouched |
| 3 | 11/19 | Signed out, with only the public key the site ships, read trips and group links | triptab.org, production | Refused: 401, permission denied |
| 4 | 11/19 | The stranger calls the 12 functions that run with raised rights against that trip (rename, stretch the dates, reset the group link, add an expense, confirm or undo a plan, log or clear someone's cost, tick off a to-do, join with a made-up link, take the Owner's spot with the real link) | TripTab dev | **11 of 12 refused. `set_action_done` let anyone signed in tick off a to-do nobody was assigned to, on any trip, given its id.** Fixed (below); after the fix, 12 of 12 refused and nothing changed |
| 6 | 11/19 | Read group links out of the analytics: a group link works like an Owner's key (whoever joins through one gets the link's role, Owner by default), so look for tokens in what PostHog receives | PostHog (TripTab project), and a local run with PostHog caught in the browser | **Found: every visit to a group link sent its token to PostHog in the page address, and replays recorded the link shown in People.** PostHog holds 1,329 such events from 11/15 to 11/18 (66 tokens; 10 from the live sites). Fixed (below); after the fix, 17 captured requests at 1280 and 390, with the link opened, copied and texted, held no token |
| 5 | 11/19 | Look for secret keys in the live site's code: all 15 JavaScript files triptab.org serves, for Supabase secret and service-role keys, Anthropic, Resend and Google keys, webhook secrets and private keys | triptab.org | None. Only the two keys meant to be public: Supabase's publishable key and PostHog's project key |

## Found and fixed

- **`set_action_done` and the NULL trap (attack 4).** Its check was "an owner, or the person it's
  assigned to". With no one assigned, `assignee = auth.uid()` is NULL, not false, so
  `not (false or NULL)` is NULL, and plpgsql's IF skips the refusal. A viewer on the trip could do
  it too. The to-do's id is a random UUID that a stranger can't list, so it needed a leaked id, but
  it was a real hole. Fix: migration `20261119154505_action_done_null_check.sql` (NULL handled,
  strangers told it's gone), on TripTab dev 11/19 and on production once Mike OKs the migration.
  A live test now covers to-dos nobody has (`app/src/actions.live.test.ts`); it failed before the
  fix and passes after. The two who-pays functions with a similar check were already NULL-safe.

- **Group link tokens in PostHog (attack 6).** `app/src/lib/analytics.ts` now hands PostHog
  `/join/[link]` in place of the token: `get_current_url` for page addresses, and `before_send`
  for anything else an event carries, plain or URL-encoded. The link's own elements in People
  carry `ph-no-capture`, so replays and click capture leave them out; PostHog compresses page
  snapshots before `before_send` sees them, so the scrub alone wouldn't cover replays. A new
  `group link texted` event keeps the signal that click capture used to give. Unit tests in
  `app/src/lib/analytics.test.ts`. **Left:** the tokens PostHog already holds (C17).

## Checked, nothing to fix

- **Row-level security** is on for all 14 tables in production. The public key alone can read
  none of them. `account_events` and `email_checks` have no policies on purpose (only the server
  functions touch them).
- **npm audit:** 0 in what ships (`--omit=dev`). Dev tools had 10 (2 critical, through Vitest 3's
  tinypool); all fixed 11/19 with Vitest 4.1.12 and typescript-eslint 8.73, so `npm audit` is at 0.
- **Supabase's security advisor** (production, 11/19):
  - The two policy-free tables above (by design).
  - `join_preview` callable signed out (by design: it shows a group link's trip before you sign in, and only with the link's token).
  - 16 sign-in functions that run with raised rights (each checks who's asking; attack 4 tests them).
  - Leaked-password protection is off (a Supabase Auth setting; to look at for SECURITY.md).

## Notes for SECURITY.md

- Production holds 405 accounts, 401 of them `@example.com` test accounts from the click-throughs
  that ran against it before TripTab dev existed (the last on 11/17), and their test trips (C18).

- A refusal that means "not found" (`P0002`) reaches the browser as HTTP 500. It's cosmetic (the
  app shows the message), but a 404 would read better in logs.
- One 502 showed in the browser console during the production run, from a request outside
  Supabase; Supabase logged no 5xx then, and reloading the same pages found none.
