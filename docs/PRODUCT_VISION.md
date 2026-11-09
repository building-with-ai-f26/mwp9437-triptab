# Product Vision

Draft v2 for your review, Nov 8, 2026. Rebuilt around your 11/8 voice note, with the spring work and Build 1 folded in.

**TripTab is an AI-powered group trip and expense manager: one place to plan a trip, run it, and settle it, before, during and after.** Anyone can start a trip and pull the group in. Plans, bookings and who paid what live together, and the tab settles itself. It must never become a chore for whoever organizes or its members.

## What exists today

- **Spring app, still live:** [triptabai.lovable.app](https://triptabai.lovable.app/). The design reference; its share links have a security gap (runbook step 22).
- **Build 1:** the [Product Page](https://building-with-ai-f26.github.io/mwp9437-triptab/) with PRD v1 and the build log, and a rough prototype in [the class repo](https://github.com/building-with-ai-f26/mwp9437-triptab): create a trip, suggest plans, confirm one with cost, payer and who joined, and see the fewest payments to settle. Eight tests on the money math; plain styling.
- **Spring archive:** the legacy chat digest, usage export and Lovable's notes, in the course output folder (triptab-spring-archive).

## Who it's for

- **Any group traveling together.** Friends, classes, families, teams, coworkers.
- **The organizer and everyone else.** Anyone can start a trip; the rest join, see the plan, opt in and add what they paid. No one should have to maintain it.
- **First real group: the Euro ski trip in February.** Marcos's idea, roughly ten people, with stops like Chamonix, Barcelona and Andorra. Lodging, flights and lift passes get booked and split over the coming weeks.

## The problem

The group chat holds the ideas, Splitwise holds the money, and nobody holds the plan. One person ends up keeping a spreadsheet, chasing friends to join yet another app, and rebuilding who joined what after the trip.

## How it works: before, during, after

| Phase | What happens |
| --- | --- |
| Before | Anyone starts the trip with dates and stops (say Chamonix 2/5 to 2/12, Barcelona 2/12 to 2/13, Andorra 2/13 to 2/16). They add people by name, email or phone, and those people are on the trip right away. Bookings go in as they happen: the Chamonix Airbnb, who's staying, who paid, split evenly or custom. Open action items can be assigned out: Thursday night plans to one friend, the Barcelona flight to another. |
| During | The timeline shows each day's morning, day, evening and night, and where everyone is staying. Events show for everyone and people opt in: 5 of 10 for the fancy Tuesday dinner. After dinner the payer logs the bill and the split, even by default. Your flights show on your view; one tap shows the group's. |
| After | The tab has been settling all along, so the trip ends with the fewest payments to square everyone up. |

**Help along the way**

- **AI suggestions for open slots,** based on an optional group survey (nothing planned Thursday or Friday night yet).
- **See alternatives** on any plan, for when Friday's ramen stops sounding good on Thursday.
- **Packing list** built from the itinerary and the weather.
- **Local tips:** rent a car or take transit, tipping norms, language: hello, goodbye and thank you.
- **Action items:** what still needs booking.
- **A downloadable PDF itinerary,** and **add to calendar** for any plan.

## Design principles

1. **Straight to the trip.** Start a trip lands on a blank itinerary; help with planning is a button inside it, never a gate in front of it. The spring home screen made you choose "already planned" or "plan it for me" before you could reach anything.
2. **No chore for the organizer.** Anyone on the trip can add plans and costs, and planning can be handed out.
3. **Only what matters goes in.** Costs people pay on their own stay out; an even split is the default.
4. **A plan and its cost are one thing.** Suggested → Confirmed → Expensed: confirming captures the cost, who paid and who's in.
5. **AI suggests; the group decides.** It never assumes (the spring version invented a flight nobody asked for).
6. **Yours first, the group's one tap away.** Flights and costs open on your own view.

## Look and feel: keep the spring design

You said the spring timeline was close visually; the rebuild keeps that look from Build 2. Build 1's prototype is deliberately plain.

- **Liquid glass.** Frosted, translucent cards with backdrop blur over full-bleed photography.
- **Luxury travel photography.** A destination photo behind every trip, a golden-hour beach behind the landing page.
- **Editorial type and a warm palette.** Serif italic headlines ("Plan it. Split it. Live it."), small uppercase labels, sand and brown tones, brown pill buttons.
- **The itinerary as a timeline.** Sticky day chips across the top, numbered days, and each day split into morning, day, evening and night with where you're staying.
- **State you can see.** Suggested plans are faint with "\~$25 est."; confirmed plans are solid with the exact price and a green "$ ✓" badge.
- **Money beside the plan.** A glass sidebar with the spending summary, balances and Settle up.

## In the course vs beyond it

What we're building for Demo Day (12/8) versus the wider product.

| In the course, by 12/8 | Beyond the course |
| --- | --- |
| Start a trip with dates and stops | assigning action items to people (Thursday night to one friend) |
| Add people directly by name, email or phone, plus a link | TripTab texting invites itself |
| Itinerary timeline with stays and morning, day, evening, night | Date polls and bedroom assignments |
| Plans and bookings with cost, payer and split; opt in and out | Receipt scanning and multiple currencies |
| Settle-up in the fewest payments | Importing bookings from forwarded emails |
| Your flights, with a tap for everyone's | Full AI-built itineraries and an in-trip AI concierge |
| AI: packing list, local tips, suggestions from a group survey, see alternatives | Post-trip recap |
| PDF itinerary and add to calendar | A native phone app |
| The spring look and feel, online for the ski group | Groups beyond friends: classes, teams, families |

You chose the aggressive cut: core loop, trip logistics and AI help. The trim check is after class 3 (11/17): anything not working and verified by then moves right.

## The course plan

| Build (due) | What ships | Evidence it works |
| --- | --- | --- |
| Build 2 (11/16) | Trip, add people directly plus link, itinerary timeline with stays, PostHog | Events for trip created, person added, plan added |
| Build 3 (11/23) | Plans and bookings with cost, payer and split; opt in and out; settle-up; per-person flights; the spring look | A funnel from plan to confirmed to expensed |
| Build 4 (11/30) | AI packing list and tips, then survey suggestions and alternatives; PDF and add to calendar | Ten-case evals on the AI features |
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

## Inviting people

- **Add people directly, and they're on the trip right away.** Name plus email or phone. They can be put on plans and costs before they ever open TripTab.
- **They hear about it two ways.** TripTab emails them the trip link, and a Text invite button opens your phone's Messages with the link filled in, for anyone you only have a number for.
- **Opening the link claims their spot.** They sign in and take over the traveler you added.
- **Why TripTab won't text people itself, for now:** that needs a paid SMS service, and US carrier registration for app texts can take days to weeks. Texting from your own phone sends the same link for free.
- **The trip owner sets who can edit, never the link.** That closes the spring security gap.

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

**Claude's read:** features weren't the gap; getting friends into a shared trip was. The legacy chat agrees: every session was your own testing, and the planned rollout to a few friends never shows up. That's why adding people directly comes first, and why the ski trip is the first real test.

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
| Packing list, local tips, action items | Keep | Build 4 |
| See alternatives (spring's Remix) | Keep | Build 4 |
| PDF and calendar export | Keep | Build 4 |
| Landing with two ways in | Replace: Start a trip opens a blank itinerary, with help-planning buttons inside it | Build 2 |
| Share links, roles, collaborators | Rebuild | Build 2 |
| Data model and Lovable hosting | Replace | Build 2 |
| Date poll, bedroom assignments | Later | After the course |
| Full AI-built itineraries, floating chat | Park | After the course |

## What it won't do

- **Book trips or move money.** It says who pays whom; Venmo does the paying.
- **Build whole itineraries on its own.** AI fills gaps and suggests; people build the plan.
- **Ask for every coffee.** Costs people pay on their own stay out.
- **Ship as a native app.** A phone-friendly web app first.

## Competitive frame

| App | What it does well | TripTab takeaway |
| --- | --- | --- |
| Splitwise | Splits and the fewest-payment settle-up | Match the settle-up; win by tying each cost to a plan, and by adding people without waiting on a link |
| Wanderlog | Collaborative, map-based itineraries | Don't out-map it; plans here are a timeline tied to money |
| Troupe | Group votes on dates and places | Light polls later |
| AvoSquado | Bedroom assignments and house details | Who's staying where, in Build 3; bedrooms later |
| TripIt | Builds an itinerary from forwarded booking emails | Later; manual entry first |
| FlowTrip | AI group planning, very early | Confirms AI plus groups is a live direction |

*From the spring 2026 competitor research in the legacy chat; not re-checked since.*

## How we'll know it's working

- **The organizer spends minutes, not hours,** keeping the trip current.
- **Everyone in the ski group is on the trip** without anyone chasing a link.
- **At least 3 friends add or confirm costs** before the trip.
- **The settle-up matches** what everyone agrees they owe.
- **At least one friend says it beats** the group chat plus Splitwise.
- **PostHog tracks** people added, plans confirmed, expenses logged at confirm time, settle-up views, and every AI call with its cost.

## Questions for you

**Answered by your 11/8 voice note and answers**

- What it is: an AI-powered group trip and expense manager, before, during and after the trip.
- Course cut: aggressive (core loop, trip logistics and AI help), with a trim check after class 3.
- AI in the course: yes, light features and suggestions, inside a hard spend cap.
- Invites: add people directly so they're in right away, then email and text-from-your-phone.
- Ways in: Start a trip goes straight to a blank itinerary; planning help is a button inside, not a home-screen choice.
- Spring pieces you want back: packing list, local tips, action items, alternatives, PDF, calendar.
- Look: keep the spring design; get the timeline right.

**Still open**

1. **The ski group:** how many people, who books, who fronts the money, and who will be hardest to get on it?
2. **Currency:** the trip's costs are in euros and friends settle in dollars. One trip currency (euros) for the course, with multi-currency later?
3. **Who can add:** anyone on the trip adds plans and costs, or only people the organizer allows?
4. **The Sponsor Memo call:** what would make you invest after 12/14, and what would make you sunset it?
5. **Beyond the course:** a side project you'd keep running, or a vehicle for this class?
6. **Name:** keep TripTab? The spring app is live at triptabai.lovable.app and already brands itself TripTab, AI Trip Manager.
7. **Phone-first?** The ski group will mostly use it on their phones during the trip.
