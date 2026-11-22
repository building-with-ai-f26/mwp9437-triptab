# SECURITY.md: TripTab's security audit (Build 3)

Audited 11/19 and 11/22, 2026, on the finished Build 3 app at https://triptab.org. Advanced lane.
Every result below comes from a real run; the raw output is in [`journal/security/`](./journal/security/),
and nothing here is estimated or made up.

**In one paragraph.** A second account is refused everything on someone else's trip, in the app and
straight at the database, on the live site. No secret key is in the site's code, the repository or
its history. `npm audit` is at 0. The audit ran 16 attacks and two code reviews; they found 13
things worth fixing, four of them serious, and all 13 are fixed. Eight smaller things are left,
each listed at the end with why.

## 1. What kind of app this is

**An app with sign-in that saves data**, and that calls a paid AI service.

- **Sign-in:** email and a password, or Google. Accounts live in Supabase Auth.
- **Saved data:** trips, the people on them (with emails and phone numbers an Owner enters), plans,
  expenses, payments, Venmo and Zelle details. Postgres on Supabase, 18 tables, row-level security
  on every one.
- **AI:** Claude Haiku 5.5, called only from Supabase Edge Functions (import a booking, plan ideas,
  describe a trip, read a forwarded email).
- **Email in and out:** TripTab sends invites, confirmation links and codes through Resend, and
  each trip has its own address that takes forwarded bookings through Cloudflare.
- **No file storage.** There is no storage bucket. A PDF or photo given to AI import is read once
  and not kept.
- **Two roles on a trip:** Owner (changes the trip and its money) and Viewer (reads it, says whether
  they're going, logs their own costs). The database decides, never the browser.
- **Where it runs:** the pages are static files on Cloudflare Workers at triptab.org. Two Supabase
  projects: **TripTab** is production; **TripTab dev** is for tests, local runs and pull request
  Previews.

## 2. The access test: a second account is refused

The test for an app with sign-in: Account B signs up on the live site and tries Account A's trip.

- **Run:** `app/e2e/rls-proof.cjs`, on https://triptab.org against production, 11/19. Two labeled
  test accounts on Resend's test inboxes, deleted right after (the one exception to "no test
  accounts on production").
- **Result: 47 of 47 checks as they should be.** B opening A's trip in the app sees "This trip isn't
  here", at 1280 and 390 wide. Straight at the database's API with B's own sign-in: every read of
  the trip comes back empty, every write is refused, all 12 functions that run with raised rights
  turn B away, and A's trip is unchanged afterwards. Signed out, with only the public key: refused.
- **Screenshots:** [`docs/screenshots/rls-refused-api.png`](./docs/screenshots/rls-refused-api.png)
  (every request and its answer), [`rls-refused-app-desktop.jpg`](./docs/screenshots/rls-refused-app-desktop.jpg)
  and [`rls-refused-app-phone.jpg`](./docs/screenshots/rls-refused-app-phone.jpg).
- **Since then:** the test grew to cover the four tables and six functions added after 11/19 and
  the two holes this audit found (57 checks). The same attacks also run on every pull request as
  194 live database tests against TripTab dev (`npm run test:rls`).

## 3. What was checked

The course's seven checks, in its order.

| # | Check | Result |
|---|-------|--------|
| 1 | **Access controls.** A second account against another's trip on the live site; a Viewer trying to act as an Owner; a stranger and a signed-out visitor against every table and function; what live updates push to whom. | Refused throughout, except the three findings in section 4 (A, D, J), now fixed. |
| 2 | **Secret keys stay on the server.** Searched the repository, all 152 commits of its history, and the 20 files triptab.org serves, for `sb_secret_`, `service_role`, `sk-or-`, `sk-ant-`, `sk-proj-`, `sk_live_`, Resend, Google and Supabase access-token shapes, private keys, and TripTab's own secrets by name. | None. Only the three values meant to be public: the two Supabase publishable keys and PostHog's `phc_` key. Secrets live in Supabase's and Cloudflare's secret stores; Mike types each one, and the agent checks them by name only. |
| 3 | **File storage is private.** | Nothing to make private: no storage bucket exists. A forwarded email from an unknown sender is held up to 7 days in a table only the server can read. |
| 4 | **Production is out of the agent's reach.** | See section 6. One gap: no manual backup of production has been made yet (section 8). |
| 5 | **Spending caps and rate limits.** | See section 7. Two findings (B and C) fixed. |
| 6 | **Dependencies.** `npm audit`, all dependencies and `--omit=dev`. | 0 vulnerabilities. Ten in dev tools (two critical, through Vitest 3) were fixed 11/19 by moving to Vitest 4.1.12 and typescript-eslint 8.73. |
| 7 | **An agent security review that tries to break the app.** Two passes (11/19, 11/22): 16 attacks, a line-by-line read of every database function as deployed, and two independent code reviews (Edge Functions and the email Worker; the front end and the delivery pipeline). | Section 4 has what it found; section 5 is the attack log. |

Also checked: Supabase's security advisor on production (no table without row-level security; its
warnings are by design or listed in section 8); which rights the public key holds on each table
(none); and that every function with raised rights pins its `search_path`.

## 4. What was found, and what was fixed

Severity is how bad it would have been if used. Production showed no sign that any of these was:
0 expenses with shares from another trip, 0 plans attributed to someone not on the trip, and 0
accounts in the state finding D needs.

| | Found | How bad | Fixed |
|---|-------|---------|-------|
| **A** | **A Viewer could rewrite the split of an expense on a trip where they may only look.** `save_expense` checked the caller was an Owner of the trip named in the call, but not that the expense belonged to that trip. Calling it from a trip of your own, with another trip's expense id, wiped that expense's shares and wrote yours. Shown on TripTab dev. | High | 11/22. The expense is checked against the trip before anything is written (migration `20261122080000`). A live test fails before the fix and passes after (`app/src/audit.live.test.ts`). |
| **B** | **The AI spending caps stopped counting after 1,000 calls in a day.** The functions fetched the day's cost log and added it up themselves, and the database's API returns 1,000 rows at most. A refused call is logged too, so one account sending refused calls could fill the day, after which nobody's calls or dollars were counted until midnight. The monthly limit at the AI provider would still have held. | High | 11/22. The sum happens in the database (`ai_spend_today`, callable only by the server). |
| **C** | **A to-do with no one assigned could be ticked off by anyone signed in**, on any trip, given its id (a NULL comparison that skipped the refusal). | Medium | 11/19 (migration `20261119154505`), with a live test. |
| **D** | **An account could be made with someone else's email, and kept.** Sign-up lets a new account in at once, so it marked the email confirmed for Supabase before anyone proved the address. Supabase links a Google sign-in to an account with the same email and drops that account's password only when the email is unconfirmed. So someone could sign up with another person's Gmail address and their own password, wait for that person to tap Continue with Google, and still get in. Found by reading the code against Supabase's documented rule; it takes a real Google account to run end to end. | High | 11/22. When a sign-in provider that vouches for the same address is linked to an account TripTab is still waiting to confirm, the password, other sign-in methods and earlier sessions go (migration `20261122080100`). |
| **E** | **Group link tokens were going to PostHog** in page addresses and replays. A group link is a key to its trip. | High | 11/19. Addresses carry `/join/[link]`; the link's elements are left out of replays; every link was replaced (migration `20261119162226`), so the 66 tokens PostHog held stopped working. |
| **F** | **PostHog was getting more than the privacy page said:** one-time sign-in codes in page addresses (8 events), Venmo links with a payee's name and amount (3 click events), and any email or phone number shown on a screen that a replay recorded. | Medium | 11/22. One-time codes and typed names are taken out of addresses; clicks record an element's text and tag, never its attributes; emails and phone numbers are removed from replays and click text. The privacy page says so. |
| **G** | **Sign-ins from before the move sit in storage shared with other sites.** Until 11/18 the app ran on GitHub Pages, where every project page on the same GitHub account shares one browser storage. Four sign-ins by three people made there are still valid. | Medium | 11/22, in part. The old address now clears those tokens before it forwards to triptab.org. Ending the four sign-ins on the server is listed in section 8. |
| **H** | **On TripTab dev, an email's button could be pointed at someone else's site.** Dev links back to the Preview that asked, and the rule matched a Preview-style name on any Cloudflare account, not only TripTab's. Production always links to triptab.org and was never affected. | Medium | 11/22. Only TripTab's own account is accepted. |
| **I** | **triptab.org sent no security headers**, so any site could show it in a frame, and nothing told browsers to stay on HTTPS. | Low | 11/22. `app/public/_headers`: no framing (PostHog's heatmap viewer excepted), HTTPS for a year, no page address in the Referer, files read as their declared type, no camera, microphone or location. |
| **J** | **Who suggested a plan could be forged.** An Owner could add a plan or to-do marked as created by another account. | Low | 11/22. A signed-in insert always carries the caller. |
| **K** | **The five-tries limit on a forwarding address's code could be beaten** by sending guesses at the same moment: they all read the same count. | Low | 11/22. Every guess takes a try before it is compared. |
| **L** | **Text nobody checked could reach an email or a calendar file.** An account's name is cut to 60 characters at sign-up but could be changed to anything afterwards, and went into emails as it was. A plan's title could carry a stray line break into the calendar export. An email with an impossible numbered character stopped its own reading without telling the sender. | Low | 11/22. Names are cut to 60 characters and one line where they are read; calendar text drops every control character and line break; the character becomes a space. |
| **M** | **Rights nobody uses were still granted.** Signed-in people held the right to empty nine tables whole. The API offers no way to use it, but row-level security doesn't cover it. | Low | 11/22. Taken back, with the unused references and trigger rights. |

## 5. Attack log

What was tried against the app and what happened. "Dev" is TripTab dev, which holds the same
migrations and functions as production; attacks that make accounts or change data ran there.

| # | Date | Attack | Where | What happened |
|---|------|--------|-------|---------------|
| 1 | 11/19 | A stranger reads another person's trip straight at the database's API, then lists every table unfiltered | triptab.org | Refused: every read empty, or "permission denied" |
| 2 | 11/19 | The stranger writes to that trip: rename it, join as an Owner, add a plan, delete it | triptab.org | Refused: 0 rows changed, or "violates row-level security policy" |
| 3 | 11/19 | Signed out, with only the public key the site ships, read trips and group links | triptab.org | Refused: 401 |
| 4 | 11/19 | The stranger calls the 12 functions that run with raised rights against that trip | dev, then triptab.org | **11 of 12 refused; one hole (finding C).** After the fix, 12 of 12 |
| 5 | 11/19 | Look for secret keys in the live site's code | triptab.org | None |
| 6 | 11/19 | Read group links out of the analytics | PostHog | **Found (finding E).** After the fix, a visit to a link is stored as `/join/[link]` |
| 7 | 11/22 | A Viewer makes a trip of their own and calls `save_expense` there with another trip's expense id | dev | **Worked (finding A):** the split of a $90 expense was replaced. After the fix: "That expense is gone", split unchanged |
| 8 | 11/22 | Outrun the AI caps: is there a ceiling on the rows they add up? | dev | **Yes (finding B):** asked for 1,100 rows, got 1,000. The caps now count in the database. The 1,000 calls were not sent |
| 9 | 11/22 | Sign up with someone else's email, then have them use Google | dev (the precondition), Supabase's docs | **Precondition confirmed (finding D):** the account is stored as confirmed with no proof. Not run end to end |
| 10 | 11/22 | A Viewer, a stranger and a signed-out visitor against everything added since 11/19: contacts, pay details, the group link, the trip's email address, held mail, forwarding addresses, foreign costs, the AI functions; and what live updates push to them. 64 requests | dev | Refused throughout: no row read or changed, emails and phones never in a pushed update, a stranger pushed nothing. One finding beside the point of the attack (J) |
| 11 | 11/22 | Dodge the 20-an-hour sign-up limit per address with a made-up `X-Forwarded-For` header | dev | Refused: the stored address was the caller's real one all three times |
| 12 | 11/22 | Skip TripTab's sign-up and its limits by calling Supabase's own sign-up and magic-link endpoints | dev | Partly: an account is made but can't sign in until its emailed link is opened, so it can't claim an address it doesn't own. Each request does send one email (section 8) |
| 13 | 11/22 | Post a forged booking email straight to the email function, with no secret and with a guessed one | dev | Refused: 401 both times |
| 14 | 11/22 | Save a plan link that runs script (`javascript:`, `data:`) for another traveler to click | dev | Refused by the database: links must start with `http://` or `https://` |
| 15 | 11/22 | Search what PostHog already holds for tokens, codes, emails and pay details | PostHog | **Found (finding F).** One group link token since 11/19, from a browser tab still running the old build; the token was already dead |
| 16 | 11/22 | Look for sign-ins left at the old GitHub Pages address, and for what the site sends with a page | production (counts only), triptab.org | **Found (findings G and I)** |

## 6. Production is out of the agent's reach

- **Production's database is read-only for the coding agent** (since 11/19). Its connector runs every
  query in a read-only transaction and has no tool to apply a migration, deploy a function or make a
  branch. The agent has full access to TripTab dev only.
- **Production changes only through a merge to `main`.** Cloudflare's build runs every check first,
  then applies new migrations and deploys the Edge Functions from the repo, then builds and deploys
  the site. A failing check means no deploy. Each deployed function is downloaded and compared with
  the repo afterwards.
- **A pull request's build holds a key that opens TripTab dev only**, so it can't reach production
  even by mistake.
- **The "Ask me first" list** in [`AGENTS.md`](./AGENTS.md) stops the agent before: anything that
  costs money; a migration on production; deleting or rewriting data in either database; changing a
  secret; changing who can see or change what; an AI prompt change without its eval; turning off a
  test or the deploy gate; anything sent in Mike's name. This audit's own migrations waited for
  Mike's OK.
- **Secrets:** Mike types every one. The agent never reads, prints or logs a value.
- **Rollback:** in Cloudflare, the `triptab` Worker, Deployments, Rollback. It changes which build is
  served, never the database. This audit found no written record of a rollback being tried, so trying
  one is on the runbook.

### Checks on every pull request

GitHub Actions (job **Tests**) and Cloudflare's Workers Builds both run
`app/scripts/cloudflare-build.sh` on every pull request and every push to `main`:

1. **Lint** (ESLint).
2. **Unit tests** (Vitest, 299): money math, the data model, the timeline, the AI functions' rules
   and output checks, the email rules, and what is scrubbed before PostHog sees it.
3. **Type check** (`tsc`).
4. **Live database security tests** against TripTab dev (194): who can read and change what as an
   Owner, a Viewer, a joiner and a stranger, across every table and function, including this
   audit's findings.
5. **A Preview build** against TripTab dev. Cloudflare deploys it to its own address and posts the
   link on the pull request.

On Cloudflare's build the branch's migrations and Edge Functions go to TripTab dev before step 4,
so the tests run against what the branch changes. On `main`, production's deploy follows only if
all of that passed, and a smoke check then confirms triptab.org serves the new build.

## 7. Spending caps and rate limits

| What | Limit | Where it is enforced |
|------|-------|----------------------|
| AI spend, whole app | $7 a day (`AI_DAILY_CAP_USD`; 0 turns AI off) | Each AI function, before any call, from the cost log |
| AI calls, one person | 20 a day, across all AI features | The same check |
| AI spend, hard stop | $100 a month, and only Claude Haiku 5.5 enabled | The AI provider's workspace limit. It is the plan's included credit, so no cash is at risk |
| One AI call | 20,000 characters of text, a 3 MB file, 4,000 output tokens, 3 web searches, 60 seconds, one retry | Each AI function |
| Sign-ups | 20 an hour per caller address, 200 an hour in all | The sign-up function |
| Confirmation emails and codes | 3 a day per person, 20 a day in all | The sign-up and confirm-email functions |
| Invite emails | Owners only; 3 a day to one person, 30 a trip, 50 a sender, 65 in all | The send-invite function |
| Email into a trip | 20 a day per trip, 5 held from unknown senders, 8 MB each; only with Cloudflare's own DMARC pass and the Worker's shared secret | The Worker and the inbox-email function |
| Forwarding addresses | 3 per account, 3 codes a day, 5 tries a code, 30 minutes | The confirm-email function |
| Sign-in attempts | Supabase Auth's own limit per address | Supabase |
| Hosting, database, analytics, email | Free plans: past their limits they stop serving rather than bill | Cloudflare, Supabase, PostHog, Resend |

Every AI call is logged with its tokens and list-price cost. The text sent is never stored.

## 8. What's left

Known and not fixed, most important first.

1. **Ending the four old sign-ins (finding G).** The old address now clears its tokens when someone
   returns to it, but a token in a browser that never returns stays valid until that person signs
   out. Ending them on the server signs three people out once; it deletes rows, so it waits for
   Mike's OK.
2. **No manual backup of production yet.** Supabase's free plan keeps none. A full dump needs the
   database password, and the file holds people's emails, so it belongs on Mike's laptop and not in
   this public repository. It is a step on the runbook.
3. **Finding D's fix has not been run with a real Google account.** The database check is simulated
   (an insert shaped like Google's); the real check is three taps on a Preview and is on the runbook.
4. **Limits are checked, then counted, in two steps.** Requests sent at the same instant can each
   pass a limit before any of them is counted, so a burst can overshoot the AI caps or the email
   limits by the size of the burst. The monthly AI limit and the email provider's daily limit are
   the hard stops. The fix is to reserve before calling, in one database step.
5. **Signed-in people can write as fast as the database lets them.** A trip, a plan and a to-do each
   have size limits, but nothing limits how many of them one account makes (1,100 to-dos went in
   with one request during this audit). On the free plan the worst case is a full database, not a
   bill.
6. **Supabase's own sign-up, magic-link and password-reset endpoints send email outside TripTab's
   limits** (attack 12). They can't make a usable account, but they can use up the day's 100 emails.
   Supabase's email rate limit is a dashboard setting to lower.
7. **Anyone holding a group link joins as an Owner by default** (Mike's 11/16 call: friends plan
   together). An Owner can delete the trip and set the pay details of someone who hasn't saved their
   own. An Owner can switch the link's role to Viewer, replace the link, or turn it off.
8. **Smaller ones.** Sign-up says whether an email already has an account. A password-reset link
   signs the browser in as the link's account without asking first. The site's
   Content-Security-Policy doesn't yet list which scripts and hosts are allowed. The email check
   trusts Cloudflare's verdict header as the first of its kind, and a message with two From lines
   hasn't been tried against it; anything it let through would still wait for an Owner's review.
   The GitHub Actions steps are pinned by version, not by commit, and the Supabase CLI in the deploy
   script sits outside the lockfile. Leaked-password protection is a paid Supabase setting.

**Settings that can only be read in a dashboard**, and so were not checked from here: the redirect
addresses Supabase Auth accepts (the old GitHub Pages address should be gone), that each build's
Supabase key opens one project only, who may push to this repository, and PostHog's and
Cloudflare's own settings. They are one step on the runbook for a session on Mike's laptop.

## 9. Run it again

```
cd app
npm audit                                   # dependencies
npm test                                    # unit tests
npm run test:rls                            # live database security tests, against TripTab dev
RLS_PROOF=yes E2E_BASE=https://triptab.org node e2e/rls-proof.cjs   # the second-account test, on purpose only
```

The last one makes two labeled accounts on production and prints them for deleting
([`AGENTS.md`](./AGENTS.md), Commands). The attack log with raw output:
[`journal/security/README.md`](./journal/security/README.md).
