# Plan.md: Risk, Architecture & Budget (Build 2)

Working draft for PRD v2. PRD v2 and the Build 2 log go on `docs/index.html`; this file is not a separate hand-in.

**Due:** Monday, Nov 16, 2026 at 12:00 PM (Noon)  
**Builder:** Mike Pezza (with Claude Code as the coding agent)

---

## 1. What is the riskiest part?

- **#1 Product risk: friends never get into one shared trip.** The spring app had 38 trips and 0 accepted invites. A trip with one person on it is a spreadsheet; every other feature (who paid, the split, settle-up) assumes the group is on the trip. Spring's invite path made people create an account before they saw anything, and its share link let anyone holding it make themselves an editor, so it was also unsafe to share widely.
- **#1 Technical risk under it: roles and joining done wrong.** If the link itself carries the role, or the browser decides who can edit, the first forwarded link breaks the trip. Roles have to live on the server.
- **How Build 2 tests it right now:**
  1. **Two ways in, and people are on the trip right away.** The owner adds people directly by name (with email or phone), so they can be put on plans before they ever open TripTab; or drops one group link in the chat. Opening the link shows the trip and the names already added; you pick yours (or "Don't see your name?" adds you) and you're in.
  2. **Roles are checked by the database, not the app.** Owner and Viewer live in the `travelers` table and every read and write goes through Postgres row-level security. The group link is a random token; the role a joiner gets is the default the owner set on the server. A test suite signs in as an owner, a viewer, a joiner and a stranger against the real database and checks who can read and change what (`npm run test:rls`).
  3. **Measured.** PostHog events for `trip created`, `person added`, `plan added`, plus `group link opened` and `name claimed`, so the funnel from added to claimed is visible once real people use it.
  4. **What Build 2 can't test yet:** whether the ski group actually joins. The app stays on localhost until Build 5 (or sooner if Mike puts it online for the ski group, runbook step 67). Until then the pod tests joining from separate browser profiles on Mike's laptop at class on 11/17.

## 2. The Smallest Working Version (Architecture)

- **Stack (Frontend / Backend / DB):**
  - **Frontend:** React 19 + TypeScript + Vite in `app/`, styled with **Tailwind CSS v4**, icons from **lucide-react**, routes with **react-router**.
  - **Backend and DB:** **Supabase** (project "TripTab", free plan, us-east-1): Postgres with row-level security on every table, a few Postgres functions for the steps that must be atomic or must check a token (create a trip with its stops, join through the group link, confirm a plan with its expense), Supabase Auth for accounts, and one Edge Function (`sign-up`).
  - **Analytics:** PostHog (`posthog-js`) in the browser, key read from `app/.env.local`.
  - **Tests:** Vitest. `npm test` runs the fast, offline tests (money math, the data model, timeline layout). `npm run test:rls` runs the row-level security suite against the live Supabase project.
- **How one action flows (adding a plan):** the owner taps a Morning slot and saves "Ski school" → the React app calls `supabase.from('items').insert(...)` with the signed-in user's token → Supabase checks the `items` insert policy (is this user an Owner on this trip?) → the row is stored with status `suggested` → the app re-reads the trip and draws the item faint in the Morning row → PostHog records `plan added`.
- **Local run command:** `cd app && npm install && npm run dev`
- **Local URL (Build 2):** http://localhost:5173
- **Models used (via OpenRouter or provider):** none in Builds 2 and 3. The AI features (Plan with AI, packing list, tips, alternatives) come in Build 4, behind a prepaid OpenRouter balance with a hard cap, called from a Supabase Edge Function so the key never reaches the browser.

### Stack call: Tailwind yes, shadcn/ui no

The spring app used Tailwind and shadcn/ui. The rebuild takes **Tailwind** (one dependency, and the spring classes in `docs/DESIGN.md` port almost line for line, which is the fastest way to a faithful look) and **leaves out shadcn/ui**. shadcn pulls in a Radix package per component plus helper libraries, and the rebuild needs about three components: a button, a dialog and a menu. Spring's phone dialog broke through four fixes inside that stack; one small dialog built on the browser's own `<dialog>` element is easier to explain and to check at 390px. If a component gets hard (a date picker, say), adding one shadcn component later is cheap.

### Sign-in method: email and password, with no email sent

- **How:** you sign up with your name, email and a password. A small server-side function (`supabase/functions/sign-up`) creates the account already marked confirmed, then the app signs you in with the password. No email goes out.
- **Why this one:**
  - **Testable on localhost tonight.** Magic links and email codes need email delivery, and Supabase's built-in sender is rate-limited to a few emails an hour and only delivers to the project team's own addresses. Google sign-in needs an OAuth app set up in Google Cloud. Neither can be tested end to end tonight.
  - **No dashboard setting to flip.** The new project has "Confirm email" on and anonymous sign-ins off (checked through its public settings). The sign-up function works either way.
  - **Durable on a phone.** Anonymous sign-in has the least friction, but the account lives in that browser: clear it or switch phones and you lose your claimed spot. For a trip people use for months, a password is the safer floor.
- **Trade-offs, logged:** (1) nobody proves they own the email they typed, so claiming happens through the group link and pick-your-name, never by matching emails; (2) there's no "forgot password" email yet, so a reset goes through Mike in the Supabase dashboard; (3) both are fixed at Build 5 by adding a custom SMTP sender (Resend's free tier) for magic links and resets.

## 3. Time & Money Budget

| Item | Estimate | Notes |
| :--- | :--- | :--- |
| **Build budget (coding agent / OpenRouter)** | `$100 / mo` | Claude Max, already paid and shared with other work, so $0 marginal for TripTab. No OpenRouter or API spend in Builds 2 and 3. |
| **Unit cost per user action (inference/API)** | `$0 / run` | Each action is a few Supabase reads and writes on the free plan, and PostHog events on its free tier. No AI calls until Build 4; their per-call cost gets priced from the provider's page then, and logged per call. |
| **Hosting cost (monthly)** | `$0 / mo` | Localhost through Build 4. Supabase free plan: 500 MB database, 50,000 monthly active users, 2 active projects; **a free project pauses after 7 days without activity**, so it needs a visit each week. PostHog free tier: 1M events and 5,000 recordings a month. |
| **Your engineering time budget** | `~6 hrs/wk` | Claude's estimate from Build 1 (about 5 hours) plus testing with the pod; Mike to adjust. Overnight agent sessions don't count against it. |

## 4. Security & Recovery Checklist

- [x] `.env` and API keys are excluded via `.gitignore` (`.env.*` at the root and `*.local` in `app/`; `app/.env.local` checked with `git check-ignore`).
- [x] Only public values in the app: the Supabase URL and **publishable** key, and the PostHog project key, are designed to ship in the browser. The service-role key exists only inside Supabase's Edge Function runtime, never in a file, a commit or the chat.
- [x] Spending limits or alerts are configured where the provider supports them: Supabase is on the free plan (no card, no overage); PostHog free tier. OpenRouter gets a prepaid balance with a hard cap before its first call (Build 4).
- [ ] Least-privilege permissions on any external data/APIs (being built 11/12; ticked once the tests pass): row-level security on every table; Owners change the trip, Viewers only read and opt in or out; the group link is a random token that grants only the role the owner set on the server; joiners can't edit a claimed name or another person's row; column privileges stop anyone setting `user_id` directly. Checked by `npm run test:rls` and Supabase's security advisor.
- [x] Git save point for undoing a broken local change: small commits on `main`, one per verified piece; Build 5 adds a cloud rollback path.
