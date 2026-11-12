# Morning report (overnight build, 11/11 to 11/12)

_Updated after every piece. Last update: Build 2 row done and verified; starting Build 3._

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
| PostHog | `trip created`, `person added`, `plan added` (plus pageviews, `signed up`, `group link opened`, `name claimed`) wired, key read from `VITE_POSTHOG_KEY`. Checked with a dummy key and PostHog's network calls intercepted: all three Build 2 events fire. **Not yet checked in PostHog itself** (needs your key) | `fd76a1a` |
| AGENTS.md and README | Stack, commands, project structure, local setup; README walkthrough replaces "Load sample trip" | next commit |

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
13. **Pushing to `main`**, as you asked; the session's own branch `claude/admiring-hypatia-85xxk4` is left where it started.

## Blocked / what you need to do

1. **PostHog:** put your project key (`phc_...`) in `app/.env.local`, turn on session replay in PostHog's project settings, click around, and check pageviews, clicks and a replay in PostHog. The Product Page snippet (`docs/index.html` head) also needs your key; I left the page alone as you asked.
2. **Supabase security advisor, two warnings left on purpose:** the app's own entry functions are callable (they check the caller inside), and "leaked password protection" is off (Supabase offers it on paid plans, as far as I can tell; check Auth settings).
3. **Test accounts:** the tests create throwaway accounts named `rls-...@example.com` and `demo-...@example.com`. I delete them at the end of the night; if I hit a limit first, delete them from Authentication, Users.
4. **PRD v2 and the Build 2 log on Sunday** (not touched, as you asked).

## What I'd do next

- Build 3's row: confirm a plan with the real cost, who paid and who's in (even, shares, percent or exact), general expenses, opt in and out, settle-up, your own view and flights.

## app/.env.local on your laptop

Create `app/.env.local` with these lines (both Supabase values are public and ship in the browser; no secret):

```
VITE_SUPABASE_URL=https://pptzbogslzicfyjooqra.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_-_AJFvHpurCuAHnKjIEuvQ__xAzXCJ_
VITE_POSTHOG_KEY=
VITE_POSTHOG_HOST=https://us.i.posthog.com
```

Put your PostHog project key after `VITE_POSTHOG_KEY=`.

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
