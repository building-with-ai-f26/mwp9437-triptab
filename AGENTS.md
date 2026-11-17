# AGENTS.md: Coding Agent Operating Manual

> Give this file to your coding agent and check that it is using these instructions. Keep the stack, commands, and ground rules current.

## 1. Project Overview
- **What this repo builds:** TripTab, a group-trip tool: anyone starts a trip with dates and stops, pulls the group in (added directly, or one group link where people pick their name), and plans live on a day-by-day timeline. Every plan says who pays: one bill that gets split (confirming it logs who paid and who joined), or everyone pays their own (each person logs their own private price, and the plan is Confirmed once everyone going has booked). A settle-up view shows the fewest payments that square everyone; own costs never enter it.
- **Primary user & core workflow:** [See the living PRD in `docs/index.html`] and the scope in `docs/PRODUCT_VISION.md`.
- **Tech stack:** React 19 + TypeScript + Vite in `app/`, styled with Tailwind CSS v4 (the spring look, `docs/DESIGN.md`), lucide-react icons, react-router. Backend is **Supabase** (project "TripTab", free plan, us-east-1): Postgres with row-level security on every table, Postgres functions (`create_trip`, `join_preview`, `join_trip`, `reset_group_link`, `confirm_item`, `log_own_line`, `clear_own_line`, `own_marks` and others), Supabase Auth (email + password), and three Edge Functions (`sign-up`; `import-bookings`, which calls the Claude API for AI import; and `ai-status`, which says which AI secrets exist, by name only). Analytics: PostHog (`posthog-js`). Tests: Vitest; click-throughs with Playwright. Money is stored in whole cents. Product Page is plain HTML in `docs/` (GitHub Pages).
- **Roles:** Owner and Viewer, stored in `travelers.role` and enforced by the database. Owners change the trip and its money; Viewers read it, opt themselves in or out, and log their own cost on plans where everyone pays their own.

## 2. Commands
- **Install dependencies:** `cd app && npm install`
- **Run locally:** `cd app && npm run dev`, then open http://localhost:5173, click **Start a trip**, create an account, and use **Fill in the ski trip example**.
- **Run deterministic tests:** `cd app && npm test` (money math, data model, timeline; offline).
- **Run the database security tests:** `cd app && npm run test:rls` (103 tests of row-level security, the money rules, who can write and read own costs, who can call AI import, plans that span time and extending a trip, against the live Supabase project; 102 run every time, and the AI daily-cap test runs only with `VITE_CAP_FIXTURE=1`; needs `app/.env.local`; creates throwaway `rls-...@example.com` accounts).
- **Click through the app:** with `npm run dev` running, `cd app && npm run e2e` (Playwright: the Build 2 flow, the Build 3 money flow, Build 4, trip settings, live updates, who pays, AI import with a canned reply, and plans that span time; saves screenshots at 1280 and 390 wide to `docs/screenshots/`; events are tagged `test_run` so PostHog dashboards leave them out). On a laptop, Playwright needs `npm i -D playwright && npx playwright install chromium` first.
- **Check text contrast:** with `npm run dev` running, `cd app && node e2e/contrast-check.cjs` measures every text run against the photo or glass behind it at 1280 and 390 wide and lists anything under 4.5:1 (3:1 for large text). Plan cards are counted apart until the pod has tested how Suggested and Planned look.
- **Check PostHog events:** start a dev server with a dummy key (`VITE_POSTHOG_KEY=phc_dummy npx vite --port 5174`), then `node e2e/posthog-check.cjs`. PostHog calls are intercepted; nothing is sent.
- **Build:** `cd app && npm run build` (type-checks, then bundles).
- **Publish online:** `cd app && npm run build:pages`, then commit `docs/app` and merge to `main`; GitHub Pages serves it at https://building-with-ai-f26.github.io/mwp9437-triptab/app/ (hash routes). The build carries only public values from `app/.env.local`. Check it with `node e2e/online-flow.cjs` (live) or against a local copy of the Pages layout.
- **Run model evals:** `cd app && npm run eval:import` runs the 10 import cases in `app/evals/import/cases/` through the deployed `import-bookings` function and scores four rubric rules in code (`src/lib/importEval.ts`). It makes real calls (logged in `ai_calls` as test runs), refuses to start if the run could cost over $1, prints the real cost, and saves results to `journal/evals/`. `EVAL_LABEL=baseline` names a run; `EVAL_ONLY=06,07` runs some cases. It needs the `ANTHROPIC_API_KEY` secret in Supabase and stops with a message if it's missing.
- **Click through AI import:** `node e2e/import-flow.cjs` checks the screens with a canned reply (no cost); add `--live` to call the real function (about a cent a run). Results so far are in `journal/evals/README.md`.

## Project structure

```
app/                      the web app (Vite)
  src/main.tsx            routes: / , /sign-in, /trips, /trips/new, /trips/:id, /join/:token
  src/pages/              one file per screen (Landing, SignIn, Trips, NewTrip, TripPage, Join)
  src/components/         ui.tsx (button, dialog, fields), TopBar, Brand, AuthForm
  src/components/trip/    Timeline (day chips, days, item cards, stays), ItemDialog, PlanPanel (who pays, cost, own lines, in/out),
                          Money (confirm/expense dialog, money card, settle up, flights), People (people, group link)
  src/lib/model.ts        types that mirror the tables, date helpers, validation, price labels
  src/lib/timeline.ts     lays a trip out day by day: morning, day, evening, night, and stays; a plan shows in every slot it covers
  src/lib/money.ts        even split and the fewest-payments settle-up, in cents
  src/lib/split.ts        splits by shares, percent or exact amounts
  src/lib/ledger.ts       who's going, balances, settle-up, own lines and your own numbers
  src/lib/api.ts          every Supabase read and write the app makes
  src/lib/auth.tsx        sign-up (via the Edge Function), sign-in, session
  src/lib/importPlans.ts  AI import on the app's side: proposals to review drafts, duplicates, what blocks saving
  src/lib/importEval.ts   scoring for the import eval (four rubric rules, in code)
  src/lib/analytics.ts    PostHog: track() and identify(); a no-op without a key
  src/*.test.ts           unit tests (npm test); src/*.live.test.ts runs only with npm run test:rls
  e2e/                    Playwright click-throughs and the PostHog check
supabase/migrations/      the database: tables, row-level security, functions (applied in order)
supabase/functions/       Edge Functions: sign-up; import-bookings (index.ts calls Claude, rules.ts holds prices, caps and output checks)
app/evals/import/         the AI import eval: 10 cases, a scanned-PDF fixture and the runner
docs/                     Product Page (index.html), PRODUCT_VISION.md, DESIGN.md, screenshots/
```

## Set up and run locally

1. Node.js 20 or 22 (`node -v`), then `cd app && npm install`.
2. Create `app/.env.local` (git ignores it) from `app/.env.example`:
   ```
   VITE_SUPABASE_URL=https://pptzbogslzicfyjooqra.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=<the publishable key, sb_publishable_...>
   VITE_POSTHOG_KEY=<PostHog project key, phc_...; leave blank to turn analytics off>
   VITE_POSTHOG_HOST=https://us.i.posthog.com
   ```
   Both Supabase values are public by design (they ship in the browser); row-level security decides what each person can do. The service-role key is never used in the app; it lives only in Supabase's Edge Function runtime.
3. `npm run dev` and open http://localhost:5173.
4. The database is already set up in the Supabase project. To rebuild it elsewhere, apply `supabase/migrations/*.sql` in order and deploy `supabase/functions/sign-up` with JWT verification off (it's called before anyone has signed in).
5. Free Supabase projects pause after 7 days with no activity; open the dashboard and restore it if the app can't connect.

## 3. Non-Negotiable Engineering Rules
1. **Plan before coding:** Before touching multiple files, propose a brief plan and wait for approval.
2. **Small batches:** Make small, focused changes that can be reviewed and explained by a human in a single Pull Request.
3. **Explainability:** Avoid unnecessary abstractions or dependencies. Help the human builder understand the main components, what changed, why it matters, what could break, and how it was checked.
4. **Verify changes:** Run relevant checks. For a reproducible logic bug, use a failing test to demonstrate the fix when practical. Record manual checks and known limitations; follow the selected Build 4 evaluation track.
5. **Zero secrets in code:** Never hardcode API keys, tokens, or credentials. Always read from environment variables (`.env`) and update `.env.example` when new variables are needed.
6. **Stop when looping:** If a fix fails twice in a row, stop, summarize what failed, and ask the human before trying a third approach.
