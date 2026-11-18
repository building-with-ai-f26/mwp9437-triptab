# Plan.md: Risk, Architecture & Budget (Build 2)

Working draft for PRD v2, kept as the Build 2 plan. PRD v2 and the Build 2 log are on `docs/index.html`; this file is not a separate hand-in. Lines marked "Since" say what changed after Build 2 was submitted on 11/16.

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
  4. **What Build 2 can't test yet:** whether the ski group actually joins. **Since:** the app went online on 11/16 (Mike's call), and the pod tested joining on the live site in class on 11/17; their notes are on the runbook's Product Vision tab under Raised 11/17.

## 2. The Smallest Working Version (Architecture)

- **Stack (Frontend / Backend / DB):**
  - **Frontend:** React 19 + TypeScript + Vite in `app/`, styled with **Tailwind CSS v4**, icons from **lucide-react**, routes with **react-router**.
  - **Backend and DB:** **Supabase** (project "TripTab", free plan, us-east-1): Postgres with row-level security on every table, a few Postgres functions for the steps that must be atomic or must check a token (create a trip with its stops, join through the group link, confirm a plan with its expense), Supabase Auth for accounts, and one Edge Function (`sign-up`). **Since:** three more Edge Functions, `ai-status`, `import-bookings` and `plan-with-ai`.
  - **Analytics:** PostHog (`posthog-js`) in the browser, key read from `app/.env.local`.
  - **Tests:** Vitest. `npm test` runs the fast, offline tests (money math, the data model, timeline layout). `npm run test:rls` runs the row-level security suite against the live Supabase project.
- **How one action flows (adding a plan):** the owner taps a Morning slot and saves "Ski school" → the React app calls `supabase.from('items').insert(...)` with the signed-in user's token → Supabase checks the `items` insert policy (is this user an Owner on this trip?) → the row is stored with status `suggested` → the app re-reads the trip and draws the item with a dotted outline (Suggested) in the Morning row → PostHog records `plan added`.
- **Local run command:** `cd app && npm install && npm run dev`
- **Local URL (Build 2):** http://localhost:5173
- **Models used (via OpenRouter or provider):** none in Build 2 as submitted. **Since 11/16:** **Claude Haiku 5.5** on the Claude API (Mike's call, 11/16: the $100 monthly API credit his Max plan includes, instead of OpenRouter), called only from the `import-bookings` and `plan-with-ai` Supabase Edge Functions so the key never reaches the browser. Prices, limits and caps are in section 5.

### Stack call: Tailwind yes, shadcn/ui no

The spring app used Tailwind and shadcn/ui. The rebuild takes **Tailwind** (one dependency, and the spring classes in `docs/DESIGN.md` port almost line for line, which is the fastest way to a faithful look) and **leaves out shadcn/ui**. shadcn pulls in a Radix package per component plus helper libraries, and the rebuild needs about three components: a button, a dialog and a menu. Spring's phone dialog broke through four fixes inside that stack; one small dialog built on the browser's own `<dialog>` element is easier to explain and to check at 390px. If a component gets hard (a date picker, say), adding one shadcn component later is cheap.

### Sign-in method: email and password, with no email sent

- **How:** you sign up with your name, email and a password. A small server-side function (`supabase/functions/sign-up`) creates the account already marked confirmed, then the app signs you in with the password. No email goes out.
- **Why this one:**
  - **Testable on localhost tonight.** Magic links and email codes need email delivery, and Supabase's built-in sender is rate-limited to a few emails an hour and only delivers to the project team's own addresses. Google sign-in needs an OAuth app set up in Google Cloud. Neither can be tested end to end tonight.
  - **No dashboard setting to flip.** The new project has "Confirm email" on and anonymous sign-ins off (checked through its public settings). The sign-up function works either way.
  - **Durable on a phone.** Anonymous sign-in has the least friction, but the account lives in that browser: clear it or switch phones and you lose your claimed spot. For a trip people use for months, a password is the safer floor.
- **Trade-offs, logged:** (1) nobody proves they own the email they typed, so claiming happens through the group link and pick-your-name, never by matching emails; (2) there's no "forgot password" email yet, so a reset goes through Mike in the Supabase dashboard; (3) both are fixed by an email sender. **Since:** Mike's call, 11/17: emails from triptab.org through Resend (confirm your email, password resets), with Google sign-in, in Build 3.

## 3. Time & Money Budget

| Item | Estimate | Notes |
| :--- | :--- | :--- |
| **Build budget (coding agent / OpenRouter)** | `$100 / mo` | Claude Max, already paid and shared with other work, so $0 marginal for TripTab. No OpenRouter. **Since 11/16:** Claude API calls on the Max plan's monthly credit, $0 cash (section 5). |
| **Unit cost per user action (inference/API)** | `$0 / run` | Each action is a few Supabase reads and writes on the free plan, and PostHog events on its free tier. No AI calls in Build 2 as submitted. **Since 11/16:** each AI call is priced and logged (section 5). |
| **Hosting cost (monthly)** | `$0 / mo` | GitHub Pages since 11/16, $0. **Since 11/17:** Mike bought triptab.org (the price goes in the Build 3 log) and the app moves to Cloudflare on it in Build 3. Supabase free plan: 500 MB database, 50,000 monthly active users, 2 active projects; **a free project pauses after 7 days without activity**, so it needs a visit each week. PostHog free tier: 1M events and 5,000 recordings a month. |
| **Your engineering time budget** | `~6 hrs/wk` | Claude's estimate from Build 1 (about 5 hours) plus testing with the pod; Mike to adjust. Overnight agent sessions don't count against it. |

## 4. Security & Recovery Checklist

- [x] `.env` and API keys are excluded via `.gitignore` (`.env.*` at the root and `*.local` in `app/`; `app/.env.local` checked with `git check-ignore`).
- [x] Only public values in the app: the Supabase URL and **publishable** key, and the PostHog project key, are designed to ship in the browser. The service-role key exists only inside Supabase's Edge Function runtime, never in a file, a commit or the chat.
- [x] Spending limits or alerts are configured where the provider supports them: Supabase is on the free plan (no card, no overage); PostHog free tier. **Since 11/16:** the AI spend limits are in section 5 (no OpenRouter).
- [x] Least-privilege permissions on any external data/APIs: row-level security on every table; Owners change the trip, Viewers only read and opt in or out; the group link is a random token that grants only the role the owner set on the server; joiners can't edit a claimed name or another person's row; column privileges stop anyone setting `user_id` directly. Checked by `npm run test:rls` and Supabase's security advisor.
- [x] Git save point for undoing a broken local change: small commits, one per verified piece. **Since:** one pull request per piece; reverting the last merge restores the previous live build, and Build 3 adds a tested rollback on Cloudflare.

## 5. AI import: model, prices and limits

The first AI feature (Mike's call, 11/16) is import of bookings: paste a confirmation, a receipt, flight numbers or a summary, or attach a PDF or photo; TripTab proposes plans, and nothing is saved until an Owner reviews them.

**Prices, read from the provider's own pages on Nov 16, 2026** ([pricing](https://platform.claude.com/docs/en/about-claude/pricing), [web search tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool)):

| What | List price |
| :--- | :--- |
| Claude Haiku 5.5, input (prompts up to 100,000 tokens) | $0.10 per million tokens |
| Claude Haiku 5.5, output (prompts up to 100,000 tokens) | $0.50 per million tokens |
| Claude Haiku 5.5, prompts over 100,000 tokens | $0.50 in and $2.50 out per million tokens |
| Cache reads and 5-minute cache writes (not used yet) | $0.01 and $0.125 per million tokens |
| Web search tool | $10 per 1,000 searches ($0.01 each), plus the tokens of the results it reads; a search that fails is not billed |

- **How it's called:** one Supabase Edge Function, `import-bookings`. It checks the caller is an Owner on the trip, sends the input to Claude Haiku 5.5 with effort set to low and output capped at 4,000 tokens, and gets the proposals back through a strict tool (a fixed schema), which the function checks again before the app sees them. Web search is allowed for one thing only, a bare flight number's schedule, at most 3 searches an import.
- **Nothing invented:** the prompt forbids any time, price or address that isn't in the input. Looked-up flight times are kept only when their source is a page the search returned in that same call; otherwise the times are blanked and the review screen says "add times". Other currencies are never converted.
- **Everything in the input is data:** instructions inside an email or PDF are not followed (two of the ten eval cases test this).
- **Runaway protection, on the server:** a daily dollar cap for the whole app, summed from the `ai_calls` table and read from the Edge Function secret `AI_DAILY_CAP_USD` on every call ($7 a day to start; 0 turns AI off); 20 imports a person a day; pasted text up to 20,000 characters and files up to 3 MB; a 60-second timeout; one automatic retry at most. On top of that, the Console workspace has a $100 monthly spend limit and only Haiku 5.5 enabled.
- **Cost log from the first call:** every call writes its model, effort, input and output tokens, searches, list-price cost, latency and result to `ai_calls`. The input text is never stored. Owners can read their own trip's rows.
- **Cash cost:** $0 while the Max plan's credit covers it. The log still records list price, since the Sponsor Memo's unit economics can't rest on a subscription perk.
- **Cost per import, measured (Nov 16, 2026):** about **$0.0010** at list price for a pasted confirmation, a PDF or a photo (37 calls, $0.0006 to $0.0012), and about **$0.0122** when a bare flight number needs one web search (3 calls). At those rates the $7 daily cap is roughly 7,000 plain imports or 570 lookups, and a ten-person trip with 30 imports costs about 3 to 37 cents. First evening in total: 53 calls, $0.1351, all test runs. Details and the eval results are in `journal/evals/README.md`.
- **Plan with AI (built 11/16, late):** the same model, effort and caps through a second Edge Function, `plan-with-ai`, with up to 3 web searches a request, since every idea must cite a search result. Measured: about **$0.022** a request at list price (22 calls, $0.0007 to $0.035, 41 searches in all), so the $7 daily cap is roughly 300 requests. Its 20-a-day limit per person is shared with import.
