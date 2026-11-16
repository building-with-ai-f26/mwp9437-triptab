# Draft for the Product Page: PRD v2 and the Build 2 log

Drafted by Claude on 11/15 from Plan.md, the commits and the test results, for Mike to edit and
paste into `docs/index.html`. Nothing here is on the Product Page yet. Lines marked **[MIKE]** need
facts only Mike has; don't paste them as they are.

## Check against the Build 2 minimum (CLAUDE.md)

| Required | Where it stands |
| --- | --- |
| One complete user action working locally, with a real API call | Done: start a trip, add people and plans, all through Supabase (database, auth, an Edge Function). Click-throughs in `app/e2e/` |
| A screenshot or recording on the Product Page | **[MIKE]** add one; suggested `docs/screenshots/trip-plans-desktop.jpg` (and `join-pick-phone.jpg`) |
| PostHog on the Product Page and the local app | Done: snippet live on the Product Page (on `main`); app events checked arriving in PostHog on 11/15 |
| Pageviews, clicks and session replay checked in PostHog | Checked with Claude's tagged test runs. **[MIKE]** use the app yourself so the dashboard shows real use, then screenshot it |
| PRD v2: biggest risk, how this build tests it, how the app works, cost per user run | Drafted below |
| AGENTS.md: project structure and local setup | Done |
| Submit Product Page URL, repo URL, PostHog dashboard screenshot | **[MIKE]** on Icerynk |

**Placeholders still on the Product Page** (blockers before submitting): the Build 2 log's "What shipped", "What broke / changed in PRD" and "Cost & time" lines are still the template's bracketed text, and section 3's "Simple Architecture" still describes Build 1 (localStorage). Builds 3 to 5 placeholders are expected for now.

---

## PRD v2 (replaces section 3 and updates sections 2 and 4)

**PRD v2 · November 16, 2026.**

### 2. Scope & Explicit Non-Goals (changed)

- **In Scope (Core Workflow):** unchanged in spirit: plan, confirm, split, settle. Added around it: a trip with dates and stops, people added directly or through one group link, Owner and Viewer roles, the itinerary timeline with stays.
- **Out of Scope #1 (narrowed):** *full AI-built itineraries.* PRD v1 ruled out AI itinerary generation entirely; the vision now has AI suggest and fill gaps (Build 4), so only whole-trip generation stays out.
- Out of Scope #2 and #3: unchanged (no bookings or payments; no native app).

### 3. How It Works Under the Hood & Riskiest Assumption

**Riskiest assumption:** friends actually get into one shared trip. The spring version had 38 trips and 0 accepted invites; every other feature (who paid, the split, settle-up) assumes the group is on the trip.

**How Build 2 tests it:** two ways in, and people are on the trip right away. The owner adds people directly by name (they can be put on plans before they ever open TripTab), or drops one group link in the chat; opening it shows the trip and the names already added, you pick yours, make an account, and you're in. Roles live on the server: the database checks every read and write (row-level security), and the link only grants the role the owner set. 24 automated tests sign in as an owner, a viewer, a link joiner, a stranger and a signed-out visitor and check what each can read and change. PostHog tracks `person added`, `group link opened` and `name claimed`, so the funnel from added to joined is measurable once the pod and the ski group use it.

**Simple architecture:** [Traveler's browser] → [React app] → [Supabase: Postgres with row-level security, sign-in, one sign-up function] → back to the browser; [PostHog] records events and replays. No AI model yet (Build 4).

**One action, end to end (adding a plan):** the owner taps a Morning slot and saves "Ski school" → the app sends it to Supabase with the owner's sign-in token → the database checks the owner is an Owner on this trip → the plan is saved as Suggested → the app redraws the day, with the plan faint → PostHog records `plan added`.

**How I'll know it works:** the pod joins Mike's trip through the group link at class on 11/17 without help; then the ski group, once the app is online.

### 4. Unit Economics & Analytics Snapshot

- **Cumulative build spend:** $0 marginal (Claude Max, $100/month, shared with other work). No API spend.
- **Est. cost per user run:** $0. Each action is a few Supabase reads and writes on the free plan, and a few PostHog events on its free tier. No AI calls until Build 4.
- **User evidence (Build 2):** **[MIKE]** real numbers from the PostHog dashboard (people, trips created, people added, plans added). Claude's automated test runs are tagged and excluded.

---

## Build 2 log entry

**What shipped:** a rebuild on a real backend. Supabase (database, sign-in, row-level security) replaces Build 1's browser storage. You can start a trip with dates and stops, add people directly as Owner or Viewer, or send one group link where people pick their name. The itinerary is a day-by-day timeline with the actual day on each chip ("Fri 2/5"), Morning, Day, Evening and Night, and where everyone's staying. Suggested plans are faint and planned ones are solid, in the spring app's look (glass over travel photography, Playfair and DM Sans, brown pill buttons). PostHog is on this page and in the app. Verified by 38 offline tests, 24 database permission tests and click-throughs at laptop and phone width (screenshots in `docs/screenshots/`). Work for Builds 3 and 4 started early and is in review (pull request #1).

**What broke / changed in PRD:**
- Changed: the riskiest assumption moved from "friends will tap Confirm in the moment" to "friends get into one shared trip" (0 accepted invites in spring). The AI non-goal narrowed to full AI-built itineraries.
- Broke, and fixed: Claude's PostHog code reset the visitor on every signed-out page load, which would have broken the landing-to-sign-up funnel; caught when test events arrived untagged in PostHog. A pill-button group was wrapped in a form label, so tapping the label "Kind" silently chose "Activity"; caught by an automated click-through. One pushed commit broke the production build for a few minutes (a test file used a Node-only variable). Deleting a trip with expenses was refused by the database; caught while cleaning test data.
- Process: the coding agent's Auto mode blocked direct pushes to `main` partway through, so later work went into a pull request.

**Cost & time this week:** Agent: Claude Code (Claude Max, $100/month), so $0 extra; Supabase and PostHog free plans. **[MIKE]** your hours.

**Things learned with AI:** **[MIKE]** in your own words (the course asks for your learning, not the agent's).
