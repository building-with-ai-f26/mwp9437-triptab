# AGENTS.md: Coding Agent Operating Manual

> Give this file to your coding agent and check that it is using these instructions. Keep the stack, commands, and ground rules current.

## 1. Project Overview
- **What this repo builds:** TripTab, a group-trip tool: anyone starts a trip with dates and stops, pulls the group in (added directly, or one group link where people pick their name), and plans live on a day-by-day timeline. Confirming a plan logs who paid and who joined, and a settle-up view shows the fewest payments that square everyone.
- **Primary user & core workflow:** [See the living PRD in `docs/index.html`] and the scope in `docs/PRODUCT_VISION.md`.
- **Tech stack:** React 19 + TypeScript + Vite in `app/`, styled with Tailwind CSS v4 (the spring look, `docs/DESIGN.md`), lucide-react icons, react-router. Backend is **Supabase** (project "TripTab", free plan, us-east-1): Postgres with row-level security on every table, a few Postgres functions (`create_trip`, `join_preview`, `join_trip`, `reset_group_link`), Supabase Auth (email + password), and one Edge Function (`sign-up`). Analytics: PostHog (`posthog-js`). Tests: Vitest; click-throughs with Playwright. Money is stored in whole cents. Product Page is plain HTML in `docs/` (GitHub Pages).
- **Roles:** Owner and Viewer, stored in `travelers.role` and enforced by the database. Owners change the trip; Viewers read it (and opt in or out from Build 3).

## 2. Commands
- **Install dependencies:** `cd app && npm install`
- **Run locally:** `cd app && npm run dev`, then open http://localhost:5173, click **Start a trip**, create an account, and use **Fill in the ski trip example**.
- **Run deterministic tests:** `cd app && npm test` (money math, data model, timeline; offline).
- **Run the database security tests:** `cd app && npm run test:rls` (row-level security against the live Supabase project; needs `app/.env.local`; creates throwaway `rls-...@example.com` accounts).
- **Click through the app:** with `npm run dev` running, `cd app && npm run e2e` (Playwright; saves screenshots at 1280 and 390 wide to `docs/screenshots/`). On a laptop, Playwright needs `npm i -D playwright && npx playwright install chromium` first.
- **Check PostHog events:** start a dev server with a dummy key (`VITE_POSTHOG_KEY=phc_dummy npx vite --port 5174`), then `node e2e/posthog-check.cjs`. PostHog calls are intercepted; nothing is sent.
- **Build:** `cd app && npm run build` (type-checks, then bundles).
- **Run model evals:** none yet (no AI model in the product until Build 4).

## Project structure

```
app/                      the web app (Vite)
  src/main.tsx            routes: / , /sign-in, /trips, /trips/new, /trips/:id, /join/:token
  src/pages/              one file per screen (Landing, SignIn, Trips, NewTrip, TripPage, Join)
  src/components/         ui.tsx (button, dialog, fields), TopBar, Brand, AuthForm
  src/components/trip/    Timeline (day chips, days, item cards, stays), ItemDialog, People (people, group link)
  src/lib/model.ts        types that mirror the tables, date helpers, validation, price labels
  src/lib/timeline.ts     lays a trip out day by day: morning, day, evening, night, and stays
  src/lib/money.ts        splits and the fewest-payments settle-up, in cents
  src/lib/api.ts          every Supabase read and write the app makes
  src/lib/auth.tsx        sign-up (via the Edge Function), sign-in, session
  src/lib/analytics.ts    PostHog: track() and identify(); a no-op without a key
  src/*.test.ts           unit tests (npm test); src/*.live.test.ts runs only with npm run test:rls
  e2e/                    Playwright click-throughs and the PostHog check
supabase/migrations/      the database: tables, row-level security, functions (applied in order)
supabase/functions/       Edge Functions (sign-up)
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
