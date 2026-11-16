# Pod test, Tue 11/17: can a friend get into the trip without help?

The riskiest assumption is that friends actually join one shared trip (spring: 0 accepted invites).
This session tests it with real people. Record only what happens; the course treats invented test
results as an integrity violation.

## Before class (5 minutes)

1. On your laptop: `cd app && npm run dev`, open http://localhost:5173, sign in, and open the Euro ski trip (or start one with **Fill in the ski trip example**).
2. In **People**, add each podmate by first name as a **Viewer**. Add one as an **Owner** for task 5.
3. Copy the **Group link**.
4. PostHog is on; the pod's clicks count as real use (only Claude's automated runs are tagged and left out).

## The test (one podmate at a time, about 5 minutes each)

Give them the laptop with a **private browser window** open on the group link, and say only: "You've been invited to a ski trip. Get yourself on it." Then stay quiet and take notes.

| # | Task (say it, don't show it) | Watch for | Note |
| --- | --- | --- | --- |
| 1 | "Get yourself on the trip." | Do they find their name? Does making an account stop them? Seconds until they see the itinerary | |
| 2 | "What's planned for Saturday morning?" | Day chips vs scrolling; do they read Suggested (faint) vs Planned (solid)? | |
| 3 | "You're skipping the fondue. Tell the group." | Do they open the plan and find **I'm out**? | |
| 4 | "How much do you owe so far?" | Do they find **Money** (a tab on phones, the sidebar on a laptop)? | |
| 5 | (Owner podmate) "You paid $120 for the fondue for everyone. Log it." | **Confirm with the real cost**, paid by, the split | |

Afterwards, one question: "What would stop your group from using this on a real trip?"

## After class

- Write what happened in the Build 2 log (pod sign-off) and Build 3 notes: who joined unaided, where they got stuck, the quote that matters most.
- Check the [Build 2 dashboard](https://us.posthog.com/project/721211/dashboard/2359712): `group link opened` vs `name claimed` is the joining funnel.
- Watch one or two session replays in PostHog to see hesitations you missed live.
- The 11/10 pod feedback on the spring app (less glass, darker text, popup position) is now testable on this build: note whether it still comes up.
