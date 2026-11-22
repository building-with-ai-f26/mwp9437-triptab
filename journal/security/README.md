# Security audit log (Build 3)

What was tried against TripTab and what happened, as it happens. SECURITY.md is written from this
after the feature freeze. Every entry is a real run; the raw output sits beside this file.

## Attacks

| # | Date | Attack | Where | What happened |
|---|------|--------|-------|---------------|
| 1 | 11/19 | A stranger (account B, on no trip) reads another person's trip straight at the database's API: the trip, its stops, people, plans, group link, expenses, payments, to-dos; then lists all 14 tables unfiltered | triptab.org, production | Refused: every read empty, or "permission denied" for the server-only tables. `2026-11-19-rls-proof.json` |
| 2 | 11/19 | The same stranger writes to that trip: rename it, join as an Owner, add a plan, delete it | triptab.org, production | Refused: 0 rows changed, or "new row violates row-level security policy". The trip came through untouched |
| 3 | 11/19 | Signed out, with only the public key the site ships, read trips and group links | triptab.org, production | Refused: 401, permission denied |
| 4 | 11/19 | The stranger calls the 12 functions that run with raised rights against that trip (rename, stretch the dates, reset the group link, add an expense, confirm or undo a plan, log or clear someone's cost, tick off a to-do, join with a made-up link, take the Owner's spot with the real link) | TripTab dev, then triptab.org | **11 of 12 refused. `set_action_done` let anyone signed in tick off a to-do nobody was assigned to, on any trip, given its id.** Fixed (below); after the fix, 12 of 12 refused and nothing changed, on dev and then on production (all 47 checks, `2026-11-19-rls-proof-after-fix.json`) |
| 5 | 11/19 | Look for secret keys in the live site's code: all 15 JavaScript files triptab.org serves, for Supabase secret and service-role keys, Anthropic, Resend and Google keys, webhook secrets and private keys | triptab.org | None. Only the two keys meant to be public: Supabase's publishable key and PostHog's project key |
| 6 | 11/19 | Read group links out of the analytics: a group link works like an Owner's key (whoever joins through one gets the link's role, Owner by default), so look for tokens in what PostHog receives | PostHog (TripTab project), and a local run with PostHog caught in the browser | **Found: every visit to a group link sent its token to PostHog in the page address, and replays recorded the link shown in People.** PostHog holds 1,329 such events from 11/15 to 11/18 (66 tokens; 10 from the live sites). Fixed (below); after the fix, 17 captured requests at 1280 and 390, with the link opened, copied and texted, held no token, and on triptab.org PostHog stored a visit to a made-up link as `/join/[link]` with the token nowhere in the event |

| 7 | 11/22 | A Viewer makes a trip of their own (where they are the Owner) and calls `save_expense` there, naming an expense on the trip where they may only look | TripTab dev | **Worked: the $90 expense's three shares were replaced by one, the Viewer's own.** Fixed (below); after the fix, "That expense is gone" and the split is unchanged (`app/src/audit.live.test.ts`) |
| 8 | 11/22 | Outrun the AI caps: the functions add up today's `ai_calls` rows after fetching them, so is there a ceiling on rows? | TripTab dev | **Yes: asked for 1,100 rows, got 1,000.** A refused call writes a row too, so 1,000 refusals would freeze the count for everyone until midnight. The 1,000 calls were not sent. Fixed (below) |
| 9 | 11/22 | Sign up with someone else's email and a password of your own, then have them use Google | TripTab dev (the precondition), Supabase's Identity Linking guide | **Precondition confirmed:** accounts from the sign-up function are stored confirmed, with TripTab's own check still pending, and Supabase drops a password on linking only when the email is unconfirmed. Not run end to end (it takes a real Google account). Fixed (below) |
| 10 | 11/22 | A Viewer, a stranger and a signed-out visitor against what was added since 11/19: contacts, pay details, the group link, the trip's email address, held mail, forwarding addresses, foreign costs, the AI functions; and what live updates push | TripTab dev | Refused throughout, 64 requests: no row read or changed; a Viewer's pushed update of a traveler never carries email or phone; a stranger is pushed nothing. One finding on the way: an Owner could set `created_by` on a plan to someone else. Fixed (below) |
| 11 | 11/22 | Dodge the per-address sign-up limit with a made-up `X-Forwarded-For` header | TripTab dev | Refused: the stored address hash was the caller's real address all three times (Supabase's log shows the header arriving, and `cf-connecting-ip` beside it) |
| 12 | 11/22 | Skip TripTab's sign-up function and its limits: Supabase's own sign-up, magic-link and anonymous endpoints, with the public key | TripTab dev | Partly. Sign-up makes an account that can't sign in until its emailed link is opened ("Email not confirmed"); anonymous sign-in is off. But sign-up and magic link each send an email, outside TripTab's limits (SECURITY.md, What's left) |
| 13 | 11/22 | Post a forged booking email straight to `inbox-email`, with no secret and with a guessed one | TripTab dev | Refused: 401 both times |
| 14 | 11/22 | Save a plan link that runs script (`javascript:`, `data:`) | TripTab dev | Refused by the database's check on `items.link` |
| 15 | 11/22 | Search what PostHog holds for tokens, one-time codes, emails and pay details | PostHog (TripTab project) | **Found:** 8 events with Google's one-time sign-in code in the page address; 3 click events with a Venmo link (payee, amount, trip name); replays record on-screen emails. One group link token since 11/19, from a browser tab still running the build from before the move; the token was already dead. Fixed (below) |
| 16 | 11/22 | Look for sign-ins left at the old GitHub Pages address, and read what triptab.org sends with a page | production (counts only), triptab.org | **Found:** 4 sign-ins by 3 people from before the move are still valid, one in use that morning; and the site sent no security headers. Fixed in part (below) |

Raw output for 7 to 16: `2026-11-22-attacks.txt`.

## Found and fixed

- **`set_action_done` and the NULL trap (attack 4).** Its check was "an owner, or the person it's
  assigned to". With no one assigned, `assignee = auth.uid()` is NULL, not false, so
  `not (false or NULL)` is NULL, and plpgsql's IF skips the refusal. A viewer on the trip could do
  it too. The to-do's id is a random UUID that a stranger can't list, so it needed a leaked id, but
  it was a real hole. Fix: migration `20261119154505_action_done_null_check.sql` (NULL handled,
  strangers told it's gone), on TripTab dev and then production 11/19 (Mike's C16 OK; the first migration through the pipeline).
  A live test now covers to-dos nobody has (`app/src/actions.live.test.ts`); it failed before the
  fix and passes after. The two who-pays functions with a similar check were already NULL-safe.

- **Group link tokens in PostHog (attack 6).** `app/src/lib/analytics.ts` now hands PostHog
  `/join/[link]` in place of the token: `get_current_url` for page addresses, and `before_send`
  for anything else an event carries, plain or URL-encoded. The link's own elements in People
  carry `ph-no-capture`, so replays and click capture leave them out; PostHog compresses page
  snapshots before `before_send` sees them, so the scrub alone wouldn't cover replays. A new
  `group link texted` event keeps the signal that click capture used to give. Unit tests in
  `app/src/lib/analytics.test.ts`. The tokens PostHog already holds stop working once every link is
  rotated: migration `20261119162226_rotate_group_links.sql` (C17, Mike's 11/19 call).

- **An expense on another trip (attack 7).** `private.write_expense` checked the caller was an Owner
  of the trip passed in, then updated the expense "where id and trip match". With another trip's
  expense id the update matched nothing, and the next two lines still deleted that expense's shares
  and inserted new ones. `save_expense` passes the caller's trip and expense straight through, so a
  Viewer (who can read a trip's expense ids) only needed a trip of their own. Fix: migration
  `20261122080000_audit_expense_caps_privileges.sql` checks the expense belongs to the trip first.
  `confirm_item` was never affected: it looks the expense up from the plan.

- **The AI caps and the 1,000-row ceiling (attack 8).** `import-bookings`, `plan-with-ai`,
  `describe-trip` and `inbox-email` each selected today's rows and summed them in code. Fix: the
  same migration adds `ai_spend_today(p_since, p_user)`, which sums in SQL and is granted to the
  service role only; the four functions call it. Found by the Edge Function review.

- **A password nobody proved (attack 9).** Fix: migration `20261122080100_unproven_password.sql`, a
  trigger on `auth.identities`. It acts only when the new sign-in's provider vouches for the
  account's own address and TripTab's check is still pending; then the password, other sign-in
  methods, earlier sessions and forwarding addresses go, which is what Supabase does itself for an
  unconfirmed email. It never blocks a sign-in: on any error it logs a warning and lets it through.

- **Forged `created_by` (attack 10).** Fix: a trigger on `items` and `action_items` sets it to the
  caller on every signed-in insert. Same migration; live test in `audit.live.test.ts`.

- **PostHog (attack 15).** `app/src/lib/analytics.ts`: `?code=`, `?t=`, `?token_hash=` and `?name=`
  values become `[hidden]` in every address, plain or encoded; a property's name is scrubbed as well
  as its value (heatmap data is filed under the page address); `mask_all_element_attributes` drops
  attributes from click events; replays run all on-screen text through `hidePersonal`, which turns
  emails into `[email]` and runs of 10 or more digits into `[number]`. Unit tests in
  `analytics.test.ts`. The privacy page's PostHog line was updated in the same pull request.

- **The old address and the headers (attack 16).** `docs/app/index.html` removes Supabase's sign-in
  tokens from that address's storage before forwarding. `app/public/_headers` adds the headers.
  Ending the old sign-ins on the server waits for Mike's OK.

- **From the two code reviews, 11/22.** Email links on TripTab dev accepted a Preview-style name on
  any Cloudflare account (`pickAppUrl`, both copies): now this account only. Guesses at a forwarding
  address's code sent at the same moment shared one try: now every guess takes a try first. An
  account's name went into emails at any length: now 60 characters, one line. An email with
  `&#99999999;` in it threw, and the Worker took the 500 as "taken": now a space. Calendar text let
  a lone carriage return or a Unicode line separator through: now escaped or dropped. Truncate,
  references and trigger rights on nine tables were still granted to signed-in people: revoked.

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

- Production held 405 accounts, 401 of them `@example.com` test accounts from the click-throughs
  that ran against it before TripTab dev existed (the last on 11/17), and 133 test trips. Migration
  `20261119162212_clear_test_data.sql` (C18, Mike's 11/19 call) deletes them, keeping the 4 real
  accounts, their 3 trips and the whole `ai_calls` cost log. On dev it left 1 account and 0 trips,
  and every live database test still passed.
- A refusal that means "not found" (`P0002`) reaches the browser as HTTP 500. It's cosmetic (the
  app shows the message), but a 404 would read better in logs.
- One 502 showed in the browser console during the production run, from a request outside
  Supabase; Supabase logged no 5xx then, and reloading the same pages found none.
- The 502s in the click-throughs on dev (11/19) were `send-invite`: build2 invited an example.com
  address, Resend answered 422 validation_error, and the function called every unknown refusal a
  502. Fixed in the batch 5 pull request: that answer is now a 422 telling the Owner to check the
  address, and build2 no longer emails a made-up inbox. The flows now log the address of every
  server error, so the production one above can be traced if it comes back.
- **Email-in (11/20) opens a new way in: mail from anyone.** What guards it, for SECURITY.md:
  - The Worker passes mail on only with the shared secret (`INBOX_SECRET`, compared in constant
    time); without it the function answers 401. The secret is a Worker secret and a Supabase secret
    Mike sets; it's never in a file or the app.
  - Each trip's address carries 64 random bits (`trip+<16 hex>@triptab.org`), given only to its
    Owners (`inbox_address`, raised rights, checks the caller); an Owner can replace it, and the old
    one stops at once (tested in `inbox.live.test.ts`).
  - Mail is read only from an address on the trip (an account's email or a linked sign-in's, such as
    Google linked to an email account, or the email an Owner entered), and only when Cloudflare's
    own check finds DMARC passed for it. **Known limit:** a From address can be forged. Someone who has a trip's address and
    knows a traveler's email could send plans in their name. They'd still wait for an Owner to
    review them; nothing reaches the itinerary on its own, and the trip takes 20 emails a day.
    Cloudflare checks SPF, DKIM and DMARC on incoming mail; reading its verdict in the Worker is
    a possible next step.
  - Size: 8 MB at most (Worker and function), import's own 3 MB file and 20,000-character limits,
    20 emails a trip a day, and the AI caps (`AI_DAILY_CAP_USD`, 20 calls a person a day) with each
    call in `ai_calls` (feature `import_email`).
  - What's kept: who sent it on the trip, its subject and the proposed plans. The email itself
    isn't stored. Only the trip's Owners can read `inbox_items`; only the function writes them, and
    Owners can change nothing but the status, to saved or dismissed (tested).
  - The dev-only test path (a signed-in Owner posts a made-up email) checks the project it runs on
    and is closed on production.
