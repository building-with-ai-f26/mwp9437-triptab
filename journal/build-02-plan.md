# Morning report (overnight build, 11/11 to 11/12)

_Last update 11/15, late evening (New York): Builds 2 and 3 are built and checked, plus the non-AI half of Build 4, trip settings, live updates and owner-only contacts. Newer work is in draft PR [building-with-ai-f26/mwp9437-triptab#1](https://github.com/building-with-ai-f26/mwp9437-triptab/pull/1). **For today's noon deadline, start with `journal/build-02-product-page-draft.md`.**_

## Done and verified

| Piece | Evidence | Commit |
| --- | --- | --- |
| Setup check | `npm install` clean; `npm test` passed **10 tests, not 8** (the 11/10 "Accept $, commas and spaces" commit added two); app loads in headless Chromium with no console errors; Supabase connector answers; supabase.co reachable | (no commit) |
| Supabase project "TripTab" | Free plan, us-east-1, quoted $0 (the connector created it without asking for a cost confirmation). Ref `pptzbogslzicfyjooqra`. Your two older projects stay paused | (no commit) |
| docs/DESIGN.md and Plan.md | Spring palette, type, glass, timeline and status styling, each with its spring file; Plan.md filled in | `728c8f3` |
| Design foundation | Tailwind theme with the spring tokens and glass; landing and sign-in screens. Screenshots: `landing-*`, `sign-in-*` | `26f0959` |
| Data model | One record per itinerary item with a status; stays as items with a check-out day; timeline by morning, day, evening, night. **26 offline tests pass** (10 money + 16 new) | `d90400e` |
| Supabase tables with row-level security | Trips, stops, travelers (Owner/Viewer), group link, items; `create_trip`, `join_preview`, `join_trip`, `reset_group_link`; the `sign-up` Edge Function. **24 live tests pass** (`npm run test:rls`): owner, viewer, link joiner, stranger and signed-out visitor, each checked on what they can read and change. Security advisor re-run after a hardening migration | `c983918`, `7dedc6e` |
| Trip screens (Build 2 row) | Start a trip with dates and stops; the timeline with day chips ("Fri 2/5"), Morning/Day/Evening/Night, stays with check-in and check-out, suggested faint and planned solid; add people directly with Add as Owner/Viewer; the group link with pick-your-name, default role, off switch and reset; viewers get no edit controls. **Full click-through passes** (`npm run e2e`): owner on desktop, Vic claiming his name on a 390-wide phone (stays a Viewer), Jules adding himself through the link (gets Owner, the link default); no console errors, no sideways scroll at 390. 18 screenshots in `docs/screenshots/` | `3cbbcea` |
| PostHog | **Checked in PostHog itself on 11/15**, through its API with your personal key (saved as a network secret on the TripTab cloud environment, never in a file or the chat). The click-through's events arrived: `$pageview`, `$autocapture` (clicks), `trip created`, `person added`, `plan added`, `group link opened`, `name claimed`, and **3 session recordings**. Product Page snippet added to `docs/index.html` (head only) and checked locally. Dashboard **"TripTab: Build 2"**: https://us.posthog.com/project/721211/dashboard/2359712 | `fd76a1a`, `249824c` |
| AGENTS.md and README | Stack, commands, project structure, local setup; README walkthrough replaces "Load sample trip" | `b77e48b` |
| Build 3: split math | Even, shares, percent and exact splits in whole cents, always adding back to the total. 8 tests | `dab080d` |
| Build 3: database | Expenses with each person's share, general expenses, who's going to each plan, `confirm_item` (cost and Confirmed status in one transaction), `unconfirm_item`, `save_expense`, and a guard so a plan can't be Confirmed without its cost. **18 live tests** (42 with Build 2's): confirm, undo, splits that must add up, general expenses, opt in and out, who may do each, deleting a trip | `73e8b86`, `287419f` (PR #1) |
| Build 3: screens | Confirm a plan with its real cost (total or per person), who paid, who's in and the split; edit or undo; general expenses; opt in or out (faded when out; owners can set anyone's); Money card with your balance, trip spend, your share and everyone's balance; Settle up; your flights and everyone's. 4 ledger tests (**38 offline tests**). Click-through `e2e/build3-flow.cjs` matches a worked example: Mike owed $38, Vic owes $61, Vic pays Mike $38 and Priya $23; no console errors, no sideways scroll at 390. Screenshots: `confirm-dialog-*`, `expense-shares-desktop`, `trip-money-desktop`, `settle-up-desktop`, `viewer-opted-out-phone`, `viewer-money-phone`, `everyones-flights-phone` | `8752b30`, `835bff5` |
| Build 3: PostHog | Events `plan confirmed`, `expense added`, `settle up viewed`, `opted in`, `opted out`, `plan status changed` (checked arriving in PostHog). Dashboard **"TripTab: Build 3"** with the course plan's funnel, suggested to planned to confirmed (paid): https://us.posthog.com/project/721211/dashboard/2359981 | `835bff5` |

| Build 4: week view | Day by day / Week toggle; seven days side by side, Morning to Night, stays along the bottom; add from an empty cell; scrolls inside its card on a phone. Screenshots `week-view-*` | `c9f4981` (PR #1) |
| Build 4: action items | Database with 6 live tests (**48 live tests** in all): owners add and assign; everyone sees who has what; the assignee ticks it off, even as a viewer. Screen: Action items card on desktop, To do tab on phones, yours first. Screenshots `action-items-*` | `7c74c3d`, `1051c40` (PR #1) |
| Build 4: calendar and PDF | `.ics` for your plans (header) or one plan (its dialog); stays all day, suggestions tentative; 3 tests (**42 offline tests**). PDF itinerary page, printed in the click-through to a 2-page PDF. Screenshot `pdf-itinerary-desktop` | `c99e678` (PR #1) |

| Trip settings | Owners rename a trip, change its stops (the dates follow), or delete it; refused if a plan would fall outside the new dates. 3 live tests; `e2e/settings-flow.cjs`. Screenshots `trip-settings-*` | `c621302` (PR #1) |
| Live updates | A friend's change appears without a refresh (Supabase Realtime, row-level security applies). `e2e/live-flow.cjs`: a new plan reached the other phone in about 2 s | `778fdac` (PR #1) |
| Contacts owner-only in the database | Emails and phones are readable only by owners (`trip_contacts()`); 1 live test (**52 live tests**). Security advisor rerun: nothing new | `a8dba2f` (PR #1) |
| Draft PRD v2 and Build 2 log | `journal/build-02-product-page-draft.md`: checked against the Build 2 minimum, with every blank you need to fill marked [MIKE] | this commit |

## Decisions I made for you

1. **Sign-in: email and password, no email sent.** A server-side `sign-up` function creates the account already confirmed (your new project has "Confirm email" on and anonymous sign-in off, and the built-in email sender only reaches your own team). Trade-offs: nobody proves they own the email, and there's no "forgot password" email yet (you reset it in the dashboard). Plan.md, "Sign-in method".
2. **Stack: Tailwind CSS v4 yes, shadcn/ui no;** lucide-react icons, react-router. One native `<dialog>` for every popup, pinned to the bottom on phones. Plan.md, "Stack call".
3. **Brown pill buttons:** spring's primary button was brown with 12px corners and its header pills were charcoal; CLAUDE.md says brown pills, so I combined them.
4. **Planned (new status) styling:** solid glass and the kind's stripe, price still "~ est."; Confirmed adds the green "$ ✓".
5. **A claimed name keeps the role you picked when you added that person; only brand-new names get the link's default.** The vision says joiners get the link default "either way"; I chose the safer reading so "Add as Viewer" can't be undone by the link. One line to flip in `join_trip` if you want the vision's wording.
6. **The group link shows the trip and the names before you sign in,** so friends see what they're joining first (spring made you sign up before seeing anything). It shows names only, never emails or phones.
7. **Viewers can't see the group link,** so a viewer can't hand out owner access. Owners can turn it off or make a new one.
8. **Invites go out from your own phone or mail app:** Text opens Messages with the link filled in; Email opens your mail app (`mailto:`). TripTab sending email itself waits for a real email sender.
9. **Contact details show to owners only** in the app. The database still lets every member read them; moving them to an owner-only table is a follow-up.
10. **A trip always keeps at least one signed-in owner** (the database refuses the change that would leave none). Trips are capped at 60 days and 20 stops.
11. **Removed the Build 1 localStorage screen** from the app; its money math and tests stay and feed Build 3. The Product Page's Build 1 section is untouched.
12. **Screenshots are JPEG** (PNG was 15 MB for 20 shots).
13. **Pushing to `main`**, as you asked; the session's branch `claude/admiring-hypatia-85xxk4` is kept level with `main` (a stop hook asked for it).
14. **Automated test runs are tagged in PostHog** (`test_run`), and the dashboard leaves them out and starts at 11/15 21:31 UTC, after my first, untagged run. So the dashboard is empty until you or the pod use the app: everything on it is real use. My first run's 3 test people and their events were deleted from PostHog; the tagged rerun stays so you can watch its replays (filter `test_run = true`).
15. **Fixed a PostHog bug I'd written:** the app reset PostHog on every signed-out page load, which gave each visitor a new anonymous id per page and would have broken the landing-to-sign-up funnel. Now only a real sign-out resets it.
16. **Plans default to everyone in; flights default to nobody but whoever added them** (flights are per person). Confirming a plan starts with whoever's in, and you can change it there.
17. **Viewers can opt themselves in or out** (the vision) but can't confirm costs or add expenses; owners do the money.
18. **Deleting a trip deletes its expenses;** removing one person who paid or owes is refused until that expense changes.
19. **Your PostHog project is still named "Default project"** in UTC. Renaming it to TripTab and setting New York time needs the key's project-write scope, which it doesn't have; it's two fields in PostHog's project settings if you want them.
20. **Week view weeks start on the trip's first day** (Fri to Thu for the ski trip), not on Sunday, so no week is mostly empty.
21. **Action items: owners add and assign; whoever has one can tick it off,** even a viewer. Due dates are limited to the trip's days.
22. **Calendar times by part of the day:** Morning 9 to 12, Day 12 to 5, Evening 6 to 9, Night 9 to midnight, in floating local time. The header button exports only the plans you're in.
23. **The PDF is a print page** (the browser's "Save as PDF"), not a generated file, so it needs no server.
24. **Changing a trip's dates never strands a plan:** the change is refused until plans outside the new dates are moved or removed.
25. **Supabase deletes wait for you:** Supabase's server asks you to confirm any statement that deletes data, and that question can't be pre-approved. While you're away I run no deletes; test accounts and trips from the click-throughs pile up until you're back (all named `rls-...` or `demo-...@example.com`).

## For Mike: blocked / what you need to do

**For Build 2 (due today, noon):**
1. Open `journal/build-02-product-page-draft.md`: PRD v2 and the Build 2 log, drafted and checked against the minimum. Fill the [MIKE] blanks (your hours, what you learned, real PostHog numbers), edit to your voice, paste into the Product Page, and add a screenshot.
2. Use the app on your laptop for a few minutes (the `app/.env.local` lines are below), then screenshot the [Build 2 dashboard](https://us.posthog.com/project/721211/dashboard/2359712). It shows real use only.
3. Submit on Icerynk: Product Page URL, repo URL, dashboard screenshot.

**Any time:**
4. Merge PR #1 (Builds 3 and 4 work), or tell me to push to `main`. Not needed for Build 2.
5. Say "go" when you're back and I'll clear the test accounts (Supabase will ask you to confirm the delete).
6. Optional in PostHog: rename the project to TripTab and set New York time (my key can't).
7. Build 4's AI features need an OpenRouter prepaid balance with a hard cap, or your call on whether your Claude plan covers them (runbook step 54).
8. The runbook's Steps table isn't updated; this list is the record for now.

## What I'd do next

1. Build 4's AI pieces once there's a capped key: Plan with AI, packing list, local tips, alternatives, each call through a Supabase Edge Function and logged with tokens and cost.
2. Build 5 prep: where to host the app (runbook step 67), a custom email sender for magic links and password resets, and a rollback check.
3. Pod test prep for 11/17: a short script for the pod (join through the link on your laptop in a private window).

## app/.env.local on your laptop

Create `app/.env.local` with these lines (all public values that ship in the browser; no secret):

```
VITE_SUPABASE_URL=https://pptzbogslzicfyjooqra.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_-_AJFvHpurCuAHnKjIEuvQ__xAzXCJ_
VITE_POSTHOG_KEY=phc_pN7znkKDFxYdyXzvBva5VMxpxBRu5tVPhMo5V5DcwfbT
VITE_POSTHOG_HOST=https://us.i.posthog.com
```

The PostHog project key is public too (it can only send events).

---

# Build 2: Plan.md & Smallest Local Version & PostHog

Optional working notes. Publish your required build log on `docs/index.html`; no separate journal submission is required.

**Build due:** Monday, Nov 16, 2026 at 12:00 PM (Noon)

---

## 1. What you made
- **PRs / Commits shipped:** 
- **Product Page URL / local demo evidence:** 
- **Summary of what works now:** 

## 2. Metacognition ("Learn with AI"): Requests, APIs, `.env` & Analytics
- **End-to-end trace of one user action in your app (explaining the main components and data flow):** 
- **3 "What would break if..." questions your AI tutor asked about your architecture (and your answers):**
  1. 
  2. 
  3. 

## 3. What the agent did
- **Agent(s) & Model(s) used:** 
- **How you briefed/directed it (key prompts or `AGENTS.md` updates):** 
- **Where you had to step in, edit by hand, or reset context:** 

## 4. What didn't work
- **Bugs, agent loops, or broken assumptions:** 
- **How you diagnosed and fixed (or rolled back) them:** 

## 5. What it cost
- **Agent / Token spend this week:** `$___`
- **Hosting / API runtime spend this week:** `$___`
- **Your hours spent this week:** `___ hrs`
- **Cumulative project spend to date:** `$___`

## 6. Pod Critique Sign-off
- **Tested by podmate(s):** 
- **Key feedback to address next:**
