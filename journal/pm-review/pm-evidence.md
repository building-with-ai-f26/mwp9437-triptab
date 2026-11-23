# TripTab: user evidence (read 11/23/2026)

Sources: PostHog project 721211 (HogQL, test runs excluded with `coalesce(properties.test_run, false) = false`), docs/PRODUCT_VISION.md, docs/index.html (Product Page and build log), git log. Nothing was changed. All numbers are tiny; treat them as anecdotes, not rates.

## 1. Who the "users" actually are (live, triptab.org, 11/18 to 11/22)

- 52 distinct PostHog persons, 65 sessions. The last non-test live event was 11/21 23:09; the only 11/22 events are test runs.
- Only **3 persons were ever identified (signed in)**, and they account for nearly all activity:
  - Person 9f2f... : 515 of 706 live events, 14 sessions, created the only live trip and used the AI features, which are Owner-only. This is almost certainly Mike.
  - Person 3d1f... : signed up with Google on 11/19 on **the same device id** as 9f2f... It matches the 11/19 note in PRODUCT_VISION.md (Raised 11/19): "Google sign-in made a second account". So it is Mike's second account, not a separate user.
  - Person 04e5... : the one invited friend, joining through the group link during Mike's 11/19 phone review (Raised 11/19 says a friend joined during it). Mike was there, so this was not an unaided session.
- The other **49 persons are anonymous**. None of them made a single tracked click. 31 of them use outdated or crawler-like browser strings (for example Chrome 117, or "Chrome/125 ... Edge/12.246"), so many are bots. Four more hit triptab.org on scanner ports (2052, 2086, 2095, 8080) and are not counted in the 52.
- Bottom line: since go-live, the real behavior on record is **Mike plus one friend he was with**. No stranger and no ski-group member has used the app on their own yet.

## 2. Funnels

### Live (host = triptab.org, since 11/18, persons)

| Step | Persons | Who |
| --- | --- | --- |
| Landing pageview (/) | 44 | mostly anonymous, many bots |
| Signed up | 2 | Mike's second account, the friend |
| Signed in | 1 | Mike |
| Trip created | 1 | Mike |
| Plan added | 2 | Mike (13), friend (1) |
| Group link opened | 1 | friend |
| Name claimed | 1 | friend |
| Plan confirmed | 2 | Mike (5), friend (1) |
| Payment recorded | 2 | Mike (2), friend (1) |

From the landing page to sign-up, the count is **0**: no anonymous landing visitor clicked anything, signed up or reached sign-in through a click. Recorded page-leave times on the landing page were 2.5 to 7 seconds.

The friend completed the whole guest path in about 11 minutes on desktop (opened the link, signed up with Google, joined, saved pay info, Settle up, recorded a cash payment, added a plan, confirmed a plan, downloaded the calendar). This happened before Show me around shipped that evening.

### Without the host filter (not live)

- GitHub Pages, non-test, 11/16 to 11/22: 19 persons, 3 sign-ups, 2 trips, 3 group link opens, 2 names claimed, 1 plan confirmed, 0 payments. Most of it is the **11/17 pod test** (11/17: 8 group link opens by 3 persons, 2 names claimed).
- Test runs (kept out of everything above): 7,568 events on localhost:5173, 788 on GitHub Pages and 53 on triptab.org (10 sessions).

### Session replays

33 replay sessions from 11/18 to 11/22 (raw_session_replay_events). The ones with real activity belong to Mike and the friend. Two anonymous phone visitors (Chrome on iOS, 11/18 and 11/20) had 14 and 5 taps over 20 and 6 active seconds on the landing page, with **no tracked click**. That means the taps hit nothing clickable. Their replays are worth watching; the data alone can't say why.

## 3. Friction points the data or written feedback shows

1. **Nobody arrives on their own, and the landing page converts no one.** Live landing visitors: 44. Anonymous clicks: 0. Sign-ups from the landing page: 0. Two phone visitors tapped areas that aren't buttons and left. *Source:* HogQL on `$pageview` with `$pathname='/'`, `$autocapture` by person, `$pageleave.$prev_pageview_duration`, and raw_session_replay_events click_count. Caveat: many of these visitors are bots.
2. **The join step lost people at the 11/17 pod test.** Five persons opened the join page; 2 claimed a name in that session. One phone user tapped a name, waited about 10 minutes and left without signing up. Two others got only a pageview, with no "group link opened" event (the trip may not have loaded, or they left at once). One user clicked "Don't see your name?", then switched between Create account and Sign in. *Sources:* PostHog, GitHub Pages host, 11/17 event sequences; PRODUCT_VISION.md "Raised 11/17, after the pod test" (the spot shown as taken); the Product Page's Riskiest Assumption. Google sign-in and a Sign in prompt on a taken spot have shipped since, but **no new group has gone through the join flow since then.**
3. **Signing in had friction, and Google made a duplicate account.** On 11/19 the second account tapped "Use email and a password instead", "Sign in", "Create account" and then "Continue with Google" within 11 seconds. It reached the trip, went to My trips and signed out within a minute. *Sources:* live PostHog, person 3d1f..., plus "Raised 11/19" (second account, C19; linking was built in #56).
4. **"Start the trip" was rage-clicked at the pod test.** A podmate clicked it 9 times over 30 seconds before the trip was created ($rageclick at 11:22 on 11/17, /trips/new). The form does show a problems note after a failed try, in the current code and on 11/17, but that didn't stop the repeat clicks. This item is **not in any Raised list.** *Source:* PostHog `$rageclick` on the GitHub Pages host.
5. **AI ideas sometimes came back empty, and imports and descriptions are slow.** Plan with AI on 11/17 ran 4 times; 2 returned 0 ideas (3 to 5 seconds, no searches) and were closed. Trip described took 14.4 s on live; imports took 8.3 s and 4.5 s. One import was opened and abandoned before the first one was saved (already logged as C29). *Source:* properties on the `ai plan`, `trip described`, `ai import` and `import opened` events. Since 11/18 nobody has used Plan with AI on live.
6. **Taps that seemed to do nothing, already investigated by Mike.** A live rage click on a person chip in the plan dialog (11/21, phone) was a toggle tapped out and back in. PRODUCT_VISION.md "Raised 11/21" says each tap registered. The 11/19 "Add 10 to the trip" with no visible response and the trip that wouldn't open after a deploy are both fixed (Raised 11/19, in review 11/20). These are listed so they aren't counted twice.

## 4. Raised items still not built

The build log (Product Page, Build 3: "Every one of them is live") and git log #20 to #71 show almost every item in Raised 11/17, 11/19 and 11/21 shipped. There are no "Raised 11/18" or "Raised 11/20" lists in docs/PRODUCT_VISION.md. Still open:

- **Listing photos** on a plan: "one day, its photos too (C32; photos later)", Raised 11/21, second test. #61 added the link but not the photos.
- **The "Start the trip" repeat-click** above was never raised and never addressed.
- From the vision's Still to build column (written 11/17 and partly out of date): packing list, local tips, see alternatives, suggestions from a group survey, import from Gmail; one person buying for part of the group.
- **The real test hasn't started**: the ski group on the trip, 3 or more friends adding costs, a friend saying it beats the group chat plus Splitwise ("How we'll know it's working"). None of these has any data yet.

Note: the Product Page's User Evidence line ("52 visitors, 2 sign-ups ...") counts bots and Mike's own two accounts. Read plainly, it says: 1 outside person, who joined with Mike there.

## 5. What the data can't tell us

- Why the anonymous visitors left: there are no replays of most of them, and many are bots. PostHog doesn't separate them reliably.
- Whether anyone struggles today: since 11/18 every real session is Mike or someone he was with, and pod behavior predates most Build 3 changes (11/17, GitHub Pages).
- Errors: `$exception` and `$dead_click` don't fire at all. Exception capture isn't turned on in app/src/lib/analytics.ts, so a count of 0 means not measured, not no errors.
- What was typed or seen: replays mask all text and inputs by design (since the 11/22 audit).
- Any rate or percentage: with n = 1 to 5 at each step, none would mean anything.
- Optional cross-check not done here (outside the brief): aggregate counts of accounts, trips and claimed members in the production database, read-only.
