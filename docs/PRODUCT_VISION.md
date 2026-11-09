# Product Vision

Draft v3, Nov 9, 2026. Your 11/9 review is applied on top of the 11/8 voice note; what's still open is at the bottom.

**TripTab is an AI-powered group trip and expense manager: one place to plan a trip, run it, and settle it, before, during and after.** Anyone can start a trip and pull the group in. Plans, bookings and who paid what live together, and the tab settles itself. It must never become a chore for whoever organizes it or for anyone else on the trip.

## What exists today

- **Spring app, still live:** [triptabai.lovable.app](https://triptabai.lovable.app/). The design reference until the rebuild replaces it (you're keeping the TripTab name and sunsetting this one); its share links have a security gap (runbook step 24).
- **Build 1:** the [Product Page](https://building-with-ai-f26.github.io/mwp9437-triptab/) with PRD v1 and the build log, and a rough prototype in [the class repo](https://github.com/building-with-ai-f26/mwp9437-triptab): create a trip, suggest plans, confirm one with cost, payer and who joined, and see the fewest payments to settle. Eight tests on the money math; plain styling.
- **Spring archive:** the legacy chat digest, usage export and Lovable's notes, in the course output folder (triptab-spring-archive).

## Who it's for

- **Any group traveling together.** Friends, classmates, families, teams, coworkers: it works the same for all of them, so none of them waits for later.
- **The organizer and everyone else.** Anyone can start a trip; the rest join, see the plan, opt in and add what they paid. No one should have to maintain it alone: on most trips everyone gets full control.
- **First real group: the Euro ski trip in February.** Marcos's idea, still forming, about 7 to 10 people, with stops like Chamonix, Barcelona and Andorra. Different people will book different pieces (one the rental cars, one the Airbnb, one a dinner reservation) and several will pay. You don't expect trouble getting them on it.

## The problem

The group chat holds the ideas, Splitwise holds the money, and nobody holds the plan. One person ends up keeping a spreadsheet, chasing friends to join yet another app, and rebuilding who joined what after the trip.

## How it works: before, during, after

| Phase | What happens |
| --- | --- |
| Before | Anyone starts the trip with dates and stops (say Chamonix 2/5 to 2/12, Barcelona 2/12 to 2/13, Andorra 2/13 to 2/16). They add people by name, email or phone, or drop one link in the group chat, and those people are on the trip right away. Bookings go in as they happen: the Chamonix Airbnb, who's staying, who paid, split evenly by default, or by shares, percentages or exact amounts, as Splitwise does. Open action items can be assigned out: Thursday night plans to one friend, the Barcelona flight to another, and the Action items tab shows who has what. |
| During | The timeline shows each day's morning, day, evening and night, and where everyone is staying. Events show for everyone and people opt in: 5 of 10 for the fancy Tuesday dinner, and the ones you've skipped look faded on your view. After dinner the payer logs the bill and the split, even by default. Costs that aren't events go on the tab too: someone picks up groceries for the house and splits them with the group. Your view shows your flights, your share of each cost and what you owe or are owed; if you haven't booked a flight yet, one tap shows when everyone else is flying. |
| After | The tab has been settling all along, so the trip ends with the fewest payments to square everyone up (Splitwise calls it simplify debts). |

**Help along the way**

- **Plan with AI,** a button on the itinerary: describe what's already booked and it fills that in, or ask for ideas for empty slots (nothing planned Thursday or Friday night yet), shaped by an optional group survey. It fills gaps only; it never overwrites a plan or makes one up.
- **See alternatives** on any plan, for when Friday's ramen stops sounding good on Thursday.
- **Packing list** built from the itinerary and the weather.
- **Local tips:** rent a car or take transit, tipping norms, language: hello, goodbye and thank you.
- **Action items:** what still needs booking and who's on it (the concert tickets to one friend, the reservation to another), on their own tab.
- **A downloadable PDF itinerary,** and **add to calendar** for any plan.

## Design principles

1. **Straight to the trip.** Start a trip lands on a blank itinerary: tap a slot to add something by hand, or use the Plan with AI button. Help is a button inside the trip, never a gate in front of it. The spring home screen made you choose "already planned" or "plan it for me" before you could reach anything.
2. **No chore for anyone.** Members can get the same control as whoever started the trip (most trips make everyone an owner), and action items can be handed out.
3. **Only what matters goes in.** Costs people pay on their own stay out; an even split is the default, with shares, percentages or exact amounts when it isn't even.
4. **A plan and its cost are one thing.** Every itinerary item carries a status: Suggested → Planned → Confirmed → Expensed → Complete. Concert tickets go from Planned to Confirmed when someone buys them, and Complete once the show is over; a slot that's only Planned can still move. Confirming captures the cost, who paid and who's in. Costs with no event, like a grocery run, go straight on the tab as general expenses.
5. **AI suggests; the group decides.** It fills empty slots and enters what you tell it; it never overwrites a plan or makes one up (the spring version invented a flight nobody asked for).
6. **Yours first, the group's one tap away.** Your itinerary shows your flights, the activities you're in (the rest look faded), your share of each cost, and what you owe or are owed. Everyone's flights are one tap away, for when you haven't booked yet.
7. **Phone first, desktop too.** Most people will sign up and use it on their phones, on the move; there's a lot to show, so the desktop view has to be good as well.

## Look and feel: keep the spring design

You said the spring timeline was close visually; the rebuild brings that look in from Build 2 (confirmed 11/9). Build 1's prototype is deliberately plain.

- **Liquid glass.** Frosted, translucent cards with backdrop blur over full-bleed photography.
- **Luxury travel photography.** A destination photo behind every trip, a golden-hour beach behind the landing page.
- **Editorial type and a warm palette.** Serif italic headlines ("Plan it. Split it. Live it."), small uppercase labels, sand and brown tones, brown pill buttons.
- **The itinerary as a timeline.** Sticky day chips across the top showing the actual days (Thu 2/5, not just Day 1). Within a day, morning, day, evening and night run down the left of the activity chips, so the day reads at a glance without timestamps, with where you're staying. A toggle switches to a week view like an Outlook calendar: seven days side by side, morning to night.
- **State you can see.** Suggested plans are faint with "\~$25 est."; confirmed plans are solid with the exact price and a green "$ ✓" badge. Activities you've opted out of fade, so your own day stands out.
- **Money beside the plan.** A glass sidebar with your spending, your share, what you owe or are owed, the group's balances and Settle up.

## In the course vs beyond it

What we're building for Demo Day (12/8) versus the wider product.

| In the course, by 12/8 | Beyond the course |
| --- | --- |
| Start a trip with dates and stops | TripTab texting invites itself |
| Add people directly by name, email or phone, or one group link where people pick their name | Date polls and bedroom assignments |
| Owner, Editor and Viewer roles | Privacy controls, like keeping your flights to yourself |
| Itinerary timeline with stays and morning, day, evening, night, plus a week view | Receipt scanning |
| Statuses from Suggested to Complete; opt in and out | Entering costs in other currencies at the day's exchange rate |
| Plans and bookings with cost, payer and split (even, shares, percent or exact) | Importing bookings from forwarded emails |
| General expenses not tied to a plan, like a grocery run | Full AI-built itineraries and an in-trip AI concierge |
| Settle-up in the fewest payments | Post-trip recap |
| Your own view: your flights, costs and balance, with a tap for everyone's flights | A native phone app |
| Action items, with who's assigned | Making money: sponsored suggestions and booking fees |
| AI: Plan with AI, packing list, local tips, suggestions from a group survey, see alternatives |  |
| PDF itinerary and add to calendar |  |
| The spring look and feel, phone first with a good desktop view, online for the ski group |  |

You chose the aggressive cut and confirmed it on 11/9: core loop, trip logistics and AI help. The trim check is after class 3 (11/17): anything not working and verified by then moves right.

## The course plan

| Build (due) | What ships | Evidence it works |
| --- | --- | --- |
| Build 2 (11/16) | Trip, add people directly plus a group link, roles, itinerary timeline with stays, the spring look, PostHog | Events for trip created, person added, plan added |
| Build 3 (11/23) | Statuses; plans and bookings with cost, payer and split; general expenses; opt in and out; settle-up; your own view and flights | A funnel from plan to confirmed to expensed |
| Build 4 (11/30) | Plan with AI, packing list and tips, then survey suggestions and alternatives; action items with who's assigned; PDF and add to calendar; week view (stretch) | Ten-case evals on the AI features |
| Build 5 (12/7) | Online, rollback check, two-minute video | The ski group using it from their phones |

## Does the aggressive cut fit the course?

Yes, with conditions. No rule caps scope, and the syllabus says size and difficulty aren't graded; verification is.

- **One core workflow stays the anchor.** Every PRD names one core workflow and three non-goals. Ours stays plan, confirm, split, settle; logistics and AI are additions to it.
- **Every feature needs evidence.** A 4 needs working software, PostHog or test evidence, cost logs, and commits on two days a week. Breadth without proof scores a 3.
- **A stranger has to use it unaided on Demo Day.** Rough edges across many features hurt more than a missing one.
- **PRD v2 narrows a non-goal.** PRD v1 put AI itinerary generation out of scope; PRD v2 narrows that to full AI-built itineraries, since AI suggestions are now in. The living PRD is meant to change, with the reason in the build log.

*Source: course syllabus (grading; what doesn't matter) and the Build 1 brief.*

## What AI will cost

- **You pay per request, by length.** Each AI call is billed on the text sent and returned. A packing list or a set of local tips is a short request; on a small, fast model that's a fraction of a cent.
- **A whole trip is likely a few dollars at most.** Even a few hundred calls stays in that range. These figures are approximate; Claude prices them from the provider's page before Build 4.
- **A hard cap removes the risk.** The course setup guide suggests a prepaid OpenRouter balance of $10 to $20 with a hard spend cap. The key stays on the server, never in the app or on GitHub.
- **Every call gets logged with its cost,** which feeds the Sponsor Memo's cost section.

**Who pays, open since 11/9:** you asked whether your Claude subscription can cover these calls, at least for the demo. If it can't, the app sends AI requests to OpenRouter on prepaid credits, and class credits are the fallback to ask about. Claude checks before PRD v2 (runbook step 29).

## Inviting people

- **Two ways in, and people are on the trip right away.** Add someone directly by name plus email or phone and send them a one-off text, or drop one group link in the chat for all ten.
- **The group link asks who you are.** People pick their name from the travelers already added; "Don't see your name?" lets them add themselves.
- **Direct invites go out two ways.** TripTab emails them the trip link, and a Text invite button opens your phone's Messages with the link filled in, for anyone you only have a number for.
- **Opening a link claims a spot.** They sign in and take over the traveler with their name, so they can be put on plans and costs before they ever open TripTab.
- **Three roles, set by the trip's owners.** Owner: full control. Editor: adds plans, activities and costs. Viewer: sees the trip. Most trips make everyone an owner; a leader running a corporate trip keeps the rest as viewers.
- **Why TripTab won't text people itself, for now:** that needs a paid SMS service, and US carrier registration for app texts can take days to weeks. Texting from your own phone sends the same link for free.
- **Roles live on the server, never in the link.** Share links, roles and collaborators were never ironed out in spring, so they're rebuilt from scratch; that closes the spring security gap.

## What the spring version proved

The spring app shipped a lot of features but never reached a real group. From its database, Mar 7 to Apr 2, 2026:

| Measure | Spring result |
| --- | --- |
| Trips created | 38, under 35 owner ids; most look like your own testing |
| Friends who accepted an invite | 0 |
| Feedback messages | 0 |
| Trips with 2 or more travelers | 11 |
| Expenses logged | 10 ($880) on 8 trips |
| Expenses logged by confirming a plan | 2 |

**Why, in your words (11/9):** you never launched it on a real trip; it still had too many bugs to trust, so nobody used it for real. **Claude's read:** reliability comes before reach. The core loop has to work every time before the ski group sees it, and getting friends into a shared trip is still untested; that's why adding people directly comes early and the ski trip is the first real test.

*Source: read-only export from the spring database and Claude's digest of all 348 turns of the legacy chat, both in the course output folder (triptab-spring-archive). Owner ids may include automated test accounts.*

## Rules for the rebuild

| What broke in spring | Rule for the rebuild |
| --- | --- |
| Plan status sat in a JSON blob while expenses sat in tables; reloads lost confirmations and duplicated expenses | One record per plan with a status; confirming writes the plan and its expense together |
| Lovable and Claude Code said "fixed" at least four times when they hadn't | Nothing is done until a test or a click-through shows it, which is also how the course grades |
| A share link let anyone holding it make themselves an editor | The trip owner sets roles on the server, never the link |
| Mobile pop-ups broke through four fix attempts | One phone-friendly dialog, checked at phone width every build |
| The Lovable-managed backend hid the dashboard, CLI and email settings, and skipped redeploys | Own the database and the deploy path |
| The AI invented a flight and booked a hotel for a trip where you had lodging | Leave out what the user didn't give, and re-run fixed test trips on every prompt change |

## Keep, adapt or park: each spring piece

Updated with your voice note. Nothing is thrown away: parked pieces stay in triptab-RETIRED to port later.

| Spring piece | Call | When |
| --- | --- | --- |
| Look and feel: glass, photography, timeline, day chips | Keep | Build 2 on |
| Suggested → Confirmed → Expensed, est. vs exact, the $ badge | Keep, rebuilt on one record per plan | Builds 1 to 3 |
| Settle-up math and split tests | Kept | Done in Build 1 |
| Expense sidebar: spending summary, balances, Settle up | Adapt to the new data model | Build 3 |
| Accommodation hub, as who's staying and what it cost | Adapt | Build 3 |
| Activity opt-in and opt-out | Keep | Build 3 |
| Packing list, local tips, action items | Keep; action items gain who's assigned | Build 4 |
| See alternatives (spring's Remix) | Keep | Build 4 |
| PDF and calendar export | Keep | Build 4 |
| Landing with two ways in | Replace: Start a trip opens a blank itinerary, with help-planning buttons inside it | Build 2 |
| Share links, roles, collaborators | Rebuild from scratch: Owner, Editor and Viewer roles, one group link plus direct adds | Build 2 |
| Data model and Lovable hosting | Replace; no Lovable hosting unless the course requires it | Build 2 |
| Date poll, bedroom assignments | Later | After the course |
| Full AI-built itineraries, floating chat | Park | After the course |

## What it won't do

- **Book trips or move money.** It says who pays whom; Venmo or Cash App does the paying.
- **Build whole itineraries on its own.** AI fills gaps and suggests; people build the plan. Maybe later, not in the course.
- **Ask for every coffee.** Costs people pay on their own stay out.
- **Ship as a native app.** A phone-first web app with a good desktop view.

## How it could make money

TripTab doesn't move money, so it would earn around the plan. Your ideas from 11/9, for after the course:

- **Sponsored suggestions.** When the group needs dinner Thursday night, TripTab knows the town, what you like, the rest of the day and the budget, so its picks can be targeted, and a restaurant can pay to be promoted.
- **Booking fees.** If someone books through a TripTab link, the venue pays a fee; the same for events, hotels and flights.

You see a real gap in the market and would keep TripTab running after the course if it works; how it makes money is the open part. **Claude's note:** sponsored picks need a visible label, or they undercut "AI suggests; the group decides."

## Competitive frame

| App | What it does well | TripTab takeaway |
| --- | --- | --- |
| Splitwise | Splits and the fewest-payment settle-up | Match the settle-up; win by tying each cost to a plan, and by adding people without waiting on a link |
| Wanderlog | Collaborative, map-based itineraries | Don't out-map it; plans here are a timeline tied to money |
| Troupe | Group votes on dates and places | Light polls later |
| AvoSquado | Bedroom assignments and house details | Who's staying where, in Build 3; bedrooms later |
| TripIt | Builds an itinerary from forwarded booking emails | Later; manual entry first |
| FlowTrip | AI group planning, very early | Confirms AI plus groups is a live direction |

*From the spring 2026 competitor research in the legacy chat; not re-checked since. The field has likely moved, so a dedicated market research session is on the runbook (step 31).*

## How we'll know it's working

- **Keeping the trip current takes seconds or minutes,** not hours, for anyone on it.
- **Everyone in the ski group is on the trip** without anyone chasing a link.
- **At least 3 friends add or confirm costs** before the trip.
- **The settle-up matches** what everyone agrees they owe.
- **At least one friend says it beats** the group chat plus Splitwise.
- **PostHog tracks** people added, plans confirmed, expenses logged at confirm time, settle-up views, and every AI call with its cost.

## Questions for you

**Answered in your 11/9 review**

- The ski group: still forming, about 7 to 10 people. Different people book the cars, the Airbnb and reservations, and several will pay; you don't expect trouble getting them on.
- Currency: US dollars, since cards bill in dollars even when the price is in euros. Entering another currency at that day's rate could come later; it would miss card fees.
- Who can add: three roles, Owner, Editor and Viewer. Most trips make everyone an owner; a corporate trip leader keeps the rest as viewers.
- The Sponsor Memo call: investing hinges on finding a way to make money, since TripTab doesn't handle payments (see How it could make money).
- Beyond the course: a side project you'd keep running if it works; you see a real gap in the market.
- Name: keep TripTab and sunset the spring app.
- Phone first: yes, with a good desktop view too, since there's a lot to show.
- Scope: keep building aggressively and dial back at the trim check if needed. General expenses and action items with who's assigned are in; day polls and bedrooms stay out.

**Answered by your 11/8 voice note and answers**

- What it is: an AI-powered group trip and expense manager, before, during and after the trip.
- Course cut: aggressive (core loop, trip logistics and AI help), with a trim check after class 3.
- AI in the course: yes, light features and suggestions, inside a hard spend cap.
- Invites: add people directly so they're in right away, then email and text-from-your-phone.
- Ways in: Start a trip goes straight to a blank itinerary; planning help is a button inside, not a home-screen choice.
- Spring pieces you want back: packing list, local tips, action items, alternatives, PDF, calendar.
- Look: keep the spring design; get the timeline right.

**Still open**

1. **Roles:** what can an Owner do that an Editor can't? Claude's pick: owners also add and remove people, change roles and delete the trip; editors add and change plans, activities and costs; viewers only look, and opt themselves in or out.
2. **The group link:** what role does someone get when they join through it, or add themselves under "Don't see your name?"? Claude's pick: a default each trip's owner sets (Owner, for a casual trip), and a claimed name is locked to that person's sign-in, so only an owner can undo a wrong claim.
3. **Statuses:** are Expensed and Complete two steps or one? Claude's pick: four statuses (Suggested → Planned → Confirmed → Complete) with the cost shown as a separate "$ ✓" badge, since concert tickets get paid at Confirmed but a dinner gets paid after it's Complete.
4. **Week view:** in the course or after? Claude's pick: a Build 4 stretch, first to move right at the 11/17 trim check.
5. **Other currencies:** in the course or after? Claude's pick: US dollars only through Demo Day, since the ski group's cards bill in dollars; the currency option after.
6. **Day chips:** did you mean they show the actual day (Thu 2/5), not just Day 1? Applied that way; say if not.
7. **The Sponsor Memo:** it's the course's last deliverable (12/14), a one-page call to invest, maintain or sunset, backed by real usage and costs. You said investing hinges on a way to make money; what would make you sunset it? Claude's pick: invest if 3 or more friends add costs without being chased and a money test looks worth running; maintain if it works but only you enter things; sunset if the group won't use it even once it's online.
