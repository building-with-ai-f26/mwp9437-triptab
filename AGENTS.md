# AGENTS.md: Coding Agent Operating Manual

> Give this file to your coding agent and check that it is using these instructions. Keep the stack, commands, and ground rules current.

## 1. Project Overview
- **What this repo builds:** TripTab, a group-trip tool: anyone starts a trip with dates and stops, pulls the group in (added directly, or one group link where people pick their name), and plans live on a day-by-day timeline. Every plan says who pays: one bill that gets split (confirming it logs who paid and who joined), or everyone pays their own (each person logs their own private price, and the plan is Confirmed once everyone going has booked). A settle-up view shows the fewest payments that square everyone; own costs never enter it.
- **Primary user & core workflow:** [See the living PRD in `docs/index.html`] and the scope in `docs/PRODUCT_VISION.md`.
- **Tech stack:** React 19 + TypeScript + Vite in `app/`, styled with Tailwind CSS v4 (the spring look, `docs/DESIGN.md`), lucide-react icons, react-router. Backend is **Supabase** (project "TripTab", free plan, us-east-1): Postgres with row-level security on every table, Postgres functions (`create_trip`, `join_preview`, `join_trip`, `reset_group_link`, `confirm_item`, `log_own_line`, `clear_own_line`, `own_marks` and others), Supabase Auth (email + password, and Google where the project has it turned on, with PKCE), and eight Edge Functions (`sign-up`; `confirm-email`, the link that confirms a new account's email, and a fresh one on request; `send-invite`, which emails an invite from invites@triptab.org through Resend, Owners only, rate-limited from the `invite_emails` log; `import-bookings`, which calls the Claude API for AI import; `plan-with-ai`, which suggests real places for a trip's empty slots; `describe-trip`, which sets a new trip up from the traveler's own description; `inbox-email`, which reads a booking confirmation forwarded to a trip's own address, trip+<code>@triptab.org, with AI import and leaves its plans for an Owner to review (email-in, 11/20); and `ai-status`, which says which AI secrets exist, by name only). Analytics: PostHog (`posthog-js`). Tests: Vitest; click-throughs with Playwright. Money is stored in whole cents. Product Page is plain HTML in `docs/` (GitHub Pages). **Two Supabase projects** (Build 3): **TripTab** (`pptzbogslzicfyjooqra`) is production, for real users; **TripTab dev** (`iivseqkvixmvcpldarqy`) holds the same migrations and Edge Functions and is what local runs, tests, evals and pull request Previews use. **Hosting:** Cloudflare Workers with static assets (`app/wrangler.jsonc`), at https://triptab.org; the one bit of Worker code, `app/worker/index.ts`, takes mail that Cloudflare Email Routing sends to trip+<code>@triptab.org and hands it to `inbox-email` with a shared secret (`INBOX_SECRET`, a Worker secret and a Supabase secret Mike sets; never in a file), built and deployed by Cloudflare's Workers Builds from this repo (`app/scripts/cloudflare-build.sh`); GitHub Actions runs the same checks on every pull request (`.github/workflows/ci.yml`).
- **Roles:** Owner and Viewer, stored in `travelers.role` and enforced by the database. Owners change the trip and its money; Viewers read it, opt themselves in or out, and log their own cost on plans where everyone pays their own.

## 2. Commands
- **Install dependencies:** `cd app && npm install`. To add or upgrade a package, use `npx -y npm@11.6.2 install ...`: npm 10.9 (Node 22's own) fails on Vitest's optional peers with "Cannot read properties of null (reading 'edgesOut')" (11/19). The lockfile it writes installs fine with `npm ci` on npm 10. `npm audit` should stay at 0; it was cleared 11/19 (Vitest 3 to 4.1.12, typescript-eslint 8.73).
- **Run locally:** `cd app && npm run dev`, then open http://localhost:5173, click **Start a trip**, create an account, and use **Fill in the ski trip example**.
- **Run deterministic tests:** `cd app && npm test` (money math, data model, timeline; offline).
- **Run the database security tests:** `cd app && npm run test:rls` against TripTab dev (190 tests of row-level security, who can send invite emails, the money rules, who can write and read own costs, who can call AI import, plans that span time and extending a trip, email-in, Also forward from addresses, held forwards and costs in another currency, against the Supabase project in `app/.env.local`, which is TripTab dev; 189 run every time, and the AI daily-cap test runs only with `VITE_CAP_FIXTURE=1`; needs `app/.env.local`; creates throwaway `rls-...@example.com` accounts).
- **Click through the app:** with `npm run dev` running, `cd app && npm run e2e` (Playwright: the Build 2 flow, the Build 3 money flow, Build 4, trip settings, live updates, who pays, AI import and Plan with AI with canned replies (one AI help button with two choices, a day and part for each idea, AI ideas marked on their cards), plans that span time, extending a trip, a joined spot asking you to sign in, Google sign-in first with email one tap away (Google faked on and off), Forgot password, invite emails (with the function's answers faked), the privacy page, and starting a trip (place suggestions faked, the photo, the phone dialog opening in place), the Add a plan dialog (parts as select all that apply, times on any plan, the cost folded), recording payments (Pay with Venmo, Record it, removing one), Venmo names an Owner adds, how people pay you (asked when joining, locked once you set it, Zelle in Settle up), the confirm-your-email reminder, a booking merging into a plan with a general name, Also forward from (a code typed back), a forward from an unknown address held for an Owner (`held-flow`, two real AI calls per width), and costs in another currency (`fx-flow`, the day's rate canned); saves screenshots at 1280 and 390 wide to `docs/screenshots/`; events are tagged `test_run` so PostHog dashboards leave them out). On a laptop, Playwright needs `npm i -D playwright && npx playwright install chromium` first.
- **Check text contrast:** with `npm run dev` running, `cd app && node e2e/contrast-check.cjs` measures every text run against the photo or glass behind it at 1280 and 390 wide and lists anything under 4.5:1 (3:1 for large text). Plan cards are listed apart from the rest.
- **Check PostHog events:** start a dev server with a dummy key (`VITE_POSTHOG_KEY=phc_dummy npx vite --port 5174`), then `node e2e/posthog-check.cjs`. PostHog calls are intercepted; nothing is sent.
- **Build:** `cd app && npm run build` (type-checks, then bundles).
- **Publish online:** merge a pull request to `main`. Cloudflare's Workers Builds runs `app/scripts/cloudflare-build.sh` (every check, then the production build), deploys to https://triptab.org and checks the live site (`app/scripts/smoke.sh`); a failing check means no deploy. There is no manual publish step. The old GitHub Pages address, https://building-with-ai-f26.github.io/mwp9437-triptab/app/, forwards to triptab.org with the rest of the link kept (`node e2e/forward-check.cjs`); `npm run build:pages` is retired.
- **Run every check the way the deploy does:** `cd app && bash scripts/cloudflare-build.sh` (lint, unit tests, type check, the database tests against TripTab dev, then a Preview build).
- **Roll back production:** in Cloudflare, the `triptab` Worker, **Deployments**, then **Rollback** on the version to go back to. It changes only which build is served, never the database.
- **Run model evals:** `cd app && npm run eval:import` runs the 10 import cases in `app/evals/import/cases/` through the deployed `import-bookings` function and scores four rubric rules in code (`src/lib/importEval.ts`). It makes real calls (logged in `ai_calls` as test runs), refuses to start if the run could cost over $1, prints the real cost, and saves results to `journal/evals/`. `EVAL_LABEL=baseline` names a run; `EVAL_ONLY=06,07` runs some cases. It needs the `ANTHROPIC_API_KEY` secret in Supabase and stops with a message if it's missing. `npm run eval:plan` does the same for Plan with AI: 10 cases in `app/evals/plan/cases/` through the deployed `plan-with-ai` function, scored in `src/lib/planEval.ts`. `npm run eval:describe` does the same for Describe your trip: 10 cases in `app/evals/describe/cases/` through the deployed `describe-trip` function, scored in `src/lib/describeEval.ts`; each case pins today's date so its dates don't drift.
- **Click through the AI features:** `node e2e/import-flow.cjs` and `node e2e/plan-ai-flow.cjs` check the screens with a canned reply (no cost); add `--live` to call the real function (a cent or a few a run). `node e2e/describe-flow.cjs` does the same for Describe your trip, from Start a trip to the review and the to-dos (canned only; the eval covers the model). `node e2e/drag-flow.cjs` drags plans with a mouse at 1280 and with real touch events at 390 (press and hold), checking slots, day chips, Undo and that a swipe still scrolls. Results so far are in `journal/evals/README.md`.
- **Security test (C14, run on purpose only):** `RLS_PROOF=yes E2E_BASE=https://triptab.org node e2e/rls-proof.cjs` signs up two labeled accounts on production (Resend test inboxes, PostHog blocked), has the second try the first's trip in the app and straight at the API (33 checks), saves `docs/screenshots/rls-refused-*`, and deletes the trip. Then the two accounts it prints and their `account_events` rows need deleting: production is read-only for Claude since 11/19, so Mike deletes them in the Supabase dashboard, or they go in a migration he OKs. Try it on a Preview first, with `RLS_SUPABASE_URL` and `RLS_SUPABASE_KEY` set to dev's. Results: `journal/security/`.

## Project structure

```
app/                      the web app (Vite)
  src/main.tsx            routes: / , /sign-in, /reset-password, /trips, /trips/new, /trips/:id, /trips/:id/print, /join/:token
  src/pages/              one file per screen (Landing, SignIn, ResetPassword, Trips, NewTrip, TripPage, PrintTrip, Join)
  src/components/         ui.tsx (button, dialog, fields), TopBar, Brand, AuthForm
  src/components/trip/    Timeline (day chips, days, item cards, stays), ItemDialog, PlanPanel (who pays, cost, own lines, in/out),
                          Money (confirm/expense dialog, money card, settle up, flights), People (people, group link),
                          WeekView, Actions (action items), TripSettings, Import and PlanWithAi (the two AI review screens)
  src/lib/model.ts        types that mirror the tables, date helpers, validation, price labels
  src/lib/timeline.ts     lays a trip out day by day: morning, day, evening, night, and stays; a plan shows in every slot it covers
  src/lib/money.ts        even split and the fewest-payments settle-up, in cents
  src/lib/split.ts        splits by shares, percent or exact amounts
  src/lib/ledger.ts       who's going, balances, settle-up, own lines and your own numbers
  src/lib/api.ts          every Supabase read and write the app makes
  src/lib/auth.tsx        sign-up (via the Edge Function), sign-in, session
  src/lib/importPlans.ts  AI import on the app's side: proposals to review drafts, duplicates, what blocks saving
  src/lib/importEval.ts   scoring for the import eval (four rubric rules, in code); planEval.ts does the same for Plan with AI
  src/lib/live.ts         live updates; ics.ts: add to calendar; photos.ts: the destination photos
  src/lib/analytics.ts    PostHog: track() and identify(); a no-op without a key
  src/*.test.ts           unit tests (npm test); src/*.live.test.ts runs only with npm run test:rls
  e2e/                    Playwright click-throughs and the PostHog check
supabase/migrations/      the database: tables, row-level security, functions (applied in order)
supabase/functions/       Edge Functions: sign-up; confirm-email; ai-status; send-invite (invite emails, rules.ts holds the limits); import-bookings, plan-with-ai and describe-trip (index.ts calls Claude; rules.ts holds the
                          system prompt, prices, caps and output checks)
app/evals/                the AI evals: import/ and plan/, 10 cases each, with their runners
docs/                     Product Page (index.html), PRODUCT_VISION.md, DESIGN.md, screenshots/, app/ (the published build)
journal/evals/            eval results (README.md has the summary)
```

## Set up and run locally

1. Node.js 20 or 22 (`node -v`), then `cd app && npm install`.
2. Copy `app/.env.example` to `app/.env.local` (git ignores it): `cp app/.env.example app/.env.local`. It points at **TripTab dev**, with PostHog off, so local runs and tests never touch real users. Every value in it is public by design (it ships in the browser); row-level security decides what each person can do. The service-role key is never used in the app; it lives only in Supabase's Edge Function runtime. Production's public values live only in `app/scripts/cloudflare-build.sh`, which builds what Cloudflare deploys.
3. `npm run dev` and open http://localhost:5173.
4. Both Supabase projects are already set up: every migration in the repo is applied to TripTab and to TripTab dev, so don't re-apply them. A new migration goes to TripTab dev first; it reaches production only after Mike's OK (Ask me first, below). Migration file names carry production's version numbers (renamed 11/18 for C12), so a deploy from the repo sees them as already applied; name a new one with a timestamp later than the last. `supabase/config.toml` holds each Edge Function's JWT setting (off for `sign-up`, `confirm-email` and `inbox-email`, which check their callers themselves). On main, `app/scripts/supabase-deploy.sh` deploys production's Edge Functions and migrations from the repo after the tests pass (C12), using `SUPABASE_ACCESS_TOKEN`, a secret on Cloudflare's production builds only; on a pull request's Cloudflare build it deploys the branch's to TripTab dev just before the live database tests (C15), with a second key in Previews Base that opens only dev (added 11/19); `supabase/DEPLOY` says how far it goes (`dry-run` reports, `on` deploys). To rebuild it elsewhere, apply `supabase/migrations/*.sql` in order and deploy `supabase/functions/sign-up` with JWT verification off (it's called before anyone has signed in). **Two Supabase connectors** (since 11/19, C12): *Supabase TripTab dev* has full access to TripTab dev, and *Supabase TripTab production (read-only)* can only read production (its SQL runs in a read-only transaction; it has no tools to apply migrations, deploy functions or make branches). So production changes only through merges. Something that must change production's data, like deleting the security test's two accounts, goes in a migration Mike OKs, or Mike does it in the Supabase dashboard. Prefer letting a pull request's build deploy functions to dev; if you deploy one through the dev connector, send every file of it whole and compare what you sent with the repo afterwards.
5. Free Supabase projects pause after 7 days with no activity; open the dashboard and restore it if the app can't connect.

## 3. Non-Negotiable Engineering Rules
1. **Plan before coding:** Before touching multiple files, propose a brief plan. When Mike is watching, wait for his approval; in a session he isn't watching, the session's prompt and the runbook are the approval (Mike's calls, 11/11 and 11/16).
2. **Small batches:** Make small, focused changes that can be reviewed and explained by a human in a single Pull Request.
3. **Explainability:** Avoid unnecessary abstractions or dependencies. Help the human builder understand the main components, what changed, why it matters, what could break, and how it was checked.
4. **Verify changes:** Run relevant checks. For a reproducible logic bug, use a failing test to demonstrate the fix when practical. Record manual checks and known limitations. Build 4's evaluation track is Track A, domain evals: `app/evals/`, results in `journal/evals/`.
5. **Zero secrets in code:** Never hardcode API keys, tokens, or credentials. Always read from environment variables (`.env`) and update `.env.example` when new variables are needed.
6. **Stop when looping:** If a fix fails twice in a row, stop that piece and summarize what failed: to Mike if he's watching, otherwise in the runbook, then move on to the next piece. No third approach without him.
7. **Deploy what's in the repo, then check what landed** (born from a real mistake, 11/18): copying an Edge Function to TripTab dev through the Supabase connector, the agent escaped one regex twice (`\\u0300` for `̀`), so the deployed copy no longer matched the repo. After any connector deploy, fetch the deployed copy and compare it with the repo file by file. Don't trust a bundle hash alone: functions that load an npm version range (`@^1.9.0`) hash differently from production even when the source is identical.
8. **Never commit a file the root `.gitignore` excludes** (born from a real mistake, 11/18): the agent first wrote the public Supabase values into committed `app/.env` files, which the course's `.gitignore` (`.env`, `.env.*`) forbids. Public values for the build go in `app/scripts/cloudflare-build.sh`; local values go in the gitignored `app/.env.local`.
9. **The privacy page stays true:** `app/src/pages/Privacy.tsx` (triptab.org/privacy, linked from Google's consent screen) describes what the code does. A change that stores a new kind of personal data, sends data to a new service, or changes who can see what updates that page, and its date, in the same pull request.

## 4. Shipping

How a change reaches people, in order. Nothing skips a step.

1. **Branch and pull request.** Work happens on a branch; every change reaches `main` through a pull request.
2. **Checks on every pull request**, twice over: GitHub Actions (`.github/workflows/ci.yml`, job **Tests**) and Cloudflare's build both run `app/scripts/cloudflare-build.sh`: lint, unit tests, type check, then the live database security tests against TripTab dev.
3. **A Preview per pull request:** Cloudflare's Workers Builds builds the branch against TripTab dev, deploys it as a Preview on workers.dev and posts the link on the pull request. Previews never touch real users.
4. **Click-through.** A Playwright click-through at 1280 and 390 wide, against the Preview or a local run, before merging.
5. **Merge to `main` deploys production:** Workers Builds runs the same script; only if every check passes does it build with production's values, run `wrangler deploy`, and then `app/scripts/smoke.sh`, which checks triptab.org serves the new build and that app links like `/join/...` still open the app.
6. **Roll back if needed:** in Cloudflare, the `triptab` Worker, **Deployments**, **Rollback**; the next merge deploys forward again.
7. **Database changes go separately.** A migration is applied to TripTab dev first and tested there; it reaches production only after Mike's OK. Edge Functions follow the same order: dev, then production, comparing each deployed copy with the repo (rule 7).

## 5. Ask me first

Stop and ask Mike before any of these, even when a session's prompt seems to allow it:

- Anything that costs money, or a new paid service (it needs a hard spend cap before first use; TripTab's budget is $50 beyond Claude Max).
- A migration on production, or anything that deletes or rewrites existing data in either database.
- Changing a secret: the AI keys, Cloudflare's build token, Google or Resend keys. Mike types every secret himself; the agent never reads, prints or logs one.
- Changing who can see or change what: row-level security, roles, the group link's rules.
- A change to an AI prompt that hasn't passed its eval with no drop.
- Turning off a test, a check or the deploy gate to get something through.
- Anything sent in Mike's name: an email, a post, a submission on Icerynk (Mike does all submitting).
- Opening other students' repositories or work.
