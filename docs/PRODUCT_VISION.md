# Product Vision

Draft v3, Nov 9, 2026. Your 11/9 review is applied on top of the 11/8 voice note; one question is parked at the bottom.

**TripTab is an AI-powered group trip and expense manager: one place to plan a trip, run it, and settle it, before, during and after.** Anyone can start a trip and pull the group in. Plans, bookings and who paid what live together, and the tab settles itself. It must never become a chore for whoever organizes it or for anyone else on the trip.

## What exists today (Nov 17)

- **TripTab, online since 11/16:** [the app](https://building-with-ai-f26.github.io/mwp9437-triptab/app/), on a real backend (Supabase), in the spring look, on a phone or a laptop. What it does, and what's left, is in the next section.
- **The Product Page:** [PRD and weekly build log](https://building-with-ai-f26.github.io/mwp9437-triptab/), with Builds 1 and 2 submitted, and the code in [the class repo](https://github.com/building-with-ai-f26/mwp9437-triptab).
- **Spring app, still live:** [triptabai.lovable.app](https://triptabai.lovable.app/), the design reference, being sunset (you're keeping the TripTab name); its share links have a security gap (the spring app cleanup step on the runbook).
- **Spring archive:** the legacy chat digest, usage export and Lovable's notes, in the course output folder (triptab-spring-archive).

## Built so far, and what's left

As of Nov 17. Everything in the Built column is live and checked by automated tests and click-throughs at laptop and phone width; no friend has used it on a real trip yet.

| Area | Built (live) | Still to build |
| --- | --- | --- |
| Trips and people | Start a trip with dates and stops; change its dates, or extend it in one tap when a plan falls a day outside; add people by name, email or phone, or share one group link where they pick their name; Owner and Viewer roles; the group link inside People | Confirming your email and resetting a password and Google sign-in (Build 3; emails from triptab.org through Resend, your 11/17 call; you use TripTab right away and get a reminder until you confirm, while Google sign-ins count as confirmed, your 11/18 call); TripTab emailing invites itself from triptab.org (Build 3, your 11/18 call); texting them itself stays beyond the course |
| Itinerary | Day by day, morning to night, with where everyone's staying; a week view; Suggested (dotted), Planned (solid) and Confirmed (paid, the green $ ✓); opting in or out; one plan across several parts or days (skiing all week); flights with an arrival day and time | Place autocomplete when typing a town (from your 11/16 walkthrough) |
| Money | Confirm a plan with its cost, payer and split (even, shares, percent or exact); Who pays: one bill, or everyone pays their own, with private prices and paid with points; general expenses like a grocery run; your own view and balance; Settle up in the fewest payments | Costs in other currencies at the day's rate (stretch goal); one person buying for part of the group (a general expense for now) |
| AI | Import of bookings: paste an email or summary, or attach a PDF or photo, with flight times looked up and a review before saving; Plan with AI: real places for empty slots, each with its source, added as Suggested. Both capped at $7 a day, logged with their cost, and scored by 10-case evals | Packing list; local tips; see alternatives; suggestions from a group survey; import by forwarding an email or from Gmail (both your calls) |
| Getting it done | Action items with who's on it and due dates before the trip; a PDF itinerary; add to calendar | Nothing in the course plan |
| Running it | Online on GitHub Pages; PostHog, with test runs left out; the spring look, phone first | The move to triptab.org on Cloudflare, with deploy on merge, previews, a dev database, a tested rollback and a security audit (Build 3, your 11/17 call); the two-minute video (Build 5, due 12/7); the ski group using it; the Sponsor Memo (12/14) |

**Ahead of the course plan.** Builds 3 and 4's features are live early, so Build 3 (due 11/23) is the Advanced lane (your 11/17 call): triptab.org on Cloudflare, deploy on merge, a dev database and a security audit, plus the features raised 11/17. The trim check after class 3 (11/17) moved nothing right.

**Not started, on purpose (beyond the course):** date polls, bedroom assignments, keeping your flights private, receipt scanning, full AI-built itineraries and an in-trip concierge, a post-trip recap, a native app, and making money.

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

- **Import, first (decided 11/16).** Paste a confirmation email, a receipt, flight numbers or a quick summary, or attach a PDF or screenshot; TripTab proposes the plans with their costs and who pays, and nothing is saved until you review them. It never invents a time, price or address that isn't in what you gave it.
- **Plan with AI,** a button on the itinerary: ask for ideas for empty slots (nothing planned Thursday or Friday night yet) and get real places, each with its source, added as Suggested; a group survey can shape them later. Telling it what's already booked is Import, above. Build 3 puts both behind one AI button with two choices, I have bookings and Give me ideas (your 11/18 call). It fills gaps only; it never overwrites a plan or makes one up.
- **See alternatives** on any plan, for when Friday's ramen stops sounding good on Thursday.
- **Packing list** built from the itinerary and the weather.
- **Local tips:** rent a car or take transit, tipping norms, language: hello, goodbye and thank you.
- **Action items:** what still needs booking and who's on it (the concert tickets to one friend, the reservation to another), on their own tab.
- **A downloadable PDF itinerary,** and **add to calendar** for any plan.

## Design principles

1. **Straight to the trip.** Start a trip lands on a blank itinerary: tap a slot to add something by hand, or use the Plan with AI button. Help is a button inside the trip, never a gate in front of it. The spring home screen made you choose "already planned" or "plan it for me" before you could reach anything.
2. **No chore for anyone.** Members can get the same control as whoever started the trip (most trips make everyone an owner), and action items can be handed out.
3. **Only what matters goes in.** What you pay on your own can go in, like a $900 flight, so you still see your total cost; it just never gets split and never enters Settle up (your 11/18 call); an even split is the default, with shares, percentages or exact amounts when it isn't even.
4. **A plan and its cost are one thing.** Every itinerary item carries a status: Suggested → Planned → Confirmed, and Confirmed means paid. Confirming captures the cost, who paid and who's in, in one step. Concert tickets go from Planned to Confirmed when someone buys them; a dinner stays Planned until the bill is paid; a free hike confirms at $0. A slot that's only Planned can still move. Whether something already happened comes from its date, not a status. Costs with no event, like a grocery run, go straight on the tab as general expenses.
5. **AI suggests; the group decides.** It fills empty slots and enters what you tell it; it never overwrites a plan or makes one up (the spring version invented a flight nobody asked for).
6. **Yours first, the group's one tap away.** Your itinerary shows your flights, the activities you're in (the rest look faded), your share of each cost, and what you owe or are owed. Everyone's flights are one tap away, for when you haven't booked yet.
7. **Phone first, desktop too.** Most people will sign up and use it on their phones, on the move; there's a lot to show, so the desktop view has to be good as well.

## Look and feel: keep the spring design

You said the spring timeline was close visually; the rebuild brings that look in from Build 2 (confirmed 11/9). Build 1's prototype is deliberately plain.

- **Liquid glass.** Frosted, translucent cards with backdrop blur over full-bleed photography.
- **Luxury travel photography.** A destination photo behind every trip, a golden-hour beach behind the landing page.
- **Editorial type and a warm palette.** Serif italic headlines ("Plan it. Split it. Live it."), small uppercase labels, sand and brown tones, brown pill buttons.
- **The itinerary as a timeline.** Sticky day chips across the top showing the actual day (Thu 2/5) rather than Day 1. Within a day, morning, day, evening and night run down the left of the activity chips, so the day reads at a glance without timestamps, with where you're staying. A toggle switches to a week view like an Outlook calendar: seven days side by side, morning to night.
- **State you can see.** Text is always dark and easy to read. Suggested plans have a dotted outline and "\~$25 est."; Planned ones are solid; confirmed plans show the exact price and a green "$ ✓" badge on top (Mike's call, 11/16). Activities you've opted out of fade, so your own day stands out.
- **Money beside the plan.** A glass sidebar with your spending, your share, what you owe or are owed, the group's balances and Settle up.

## In the course vs beyond it

What we're building for Demo Day (12/8) versus the wider product.

| In the course, by 12/8 | Beyond the course |
| --- | --- |
| Start a trip with dates and stops | TripTab texting invites itself |
| Add people directly by name, email or phone, or one group link where people pick their name | Date polls and bedroom assignments |
| Owner and Viewer roles, picked from an Add as menu | Privacy controls, like keeping your flights to yourself |
| Itinerary timeline with stays and morning, day, evening, night, plus a week view | Receipt scanning |
| Statuses: Suggested, Planned, Confirmed (paid); opt in and out | Entering costs in other currencies at the day's exchange rate (a stretch goal for the course) |
| Plans and bookings with cost, payer and split (even, shares, percent or exact) | Importing bookings by forwarding emails to TripTab or from Gmail (paste and upload are in the course) |
| General expenses not tied to a plan, like a grocery run | Full AI-built itineraries and an in-trip AI concierge |
| Settle-up in the fewest payments | Post-trip recap |
| Your own view: your flights, costs and balance, with a tap for everyone's flights | A native phone app |
| Action items, with who's assigned | Making money: sponsored suggestions and booking fees |
| AI: import of bookings (emails, receipts, PDFs, flight numbers), Plan with AI, packing list, local tips, suggestions from a group survey, see alternatives |  |
| PDF itinerary and add to calendar |  |
| The spring look and feel, phone first with a good desktop view, online for the ski group |  |

You chose the aggressive cut and confirmed it on 11/9: core loop, trip logistics and AI help. The trim check is after class 3 (11/17): anything not working and verified by then moves right.

## The course plan

| Build (due) | What ships | Evidence it works |
| --- | --- | --- |
| Build 2 (11/16) | Trip, add people directly plus a group link, roles, itinerary timeline with stays, the spring look, PostHog | Events for trip created, person added, plan added |
| Build 3 (11/23) | Statuses; plans and bookings with cost, payer and split; general expenses; opt in and out; settle-up; your own view and flights (all live by 11/16). Added 11/17: the Advanced lane (triptab.org on Cloudflare, deploy on merge, previews, a dev database, a security audit) and the features raised 11/17 | A funnel from suggested to planned to confirmed (paid) |
| Build 4 (11/30) | AI import of bookings (started early, 11/16), then Plan with AI, packing list and tips, then survey suggestions and alternatives; action items with who's assigned; PDF and add to calendar; week view | Ten-case evals on the AI features |
| Build 5 (12/7) | Two-minute video (online since 11/16; the rollback check moved to Build 3) | The ski group using it from their phones |

## Does the aggressive cut fit the course?

Yes, with conditions. No rule caps scope, and the syllabus says size and difficulty aren't graded; verification is.

- **One core workflow stays the anchor.** Every PRD names one core workflow and three non-goals. Ours stays plan, confirm, split, settle; logistics and AI are additions to it.
- **Every feature needs evidence.** A 4 needs working software, PostHog or test evidence, cost logs, and commits on two days a week. Breadth without proof scores a 3.
- **A stranger has to use it unaided on Demo Day.** Rough edges across many features hurt more than a missing one.
- **PRD v2 narrows a non-goal.** PRD v1 put AI itinerary generation out of scope; PRD v2 narrows that to full AI-built itineraries, since AI suggestions are now in. The living PRD is meant to change, with the reason in the build log.

*Source: course syllabus (grading; what doesn't matter) and the Build 1 brief.*

## What AI will cost

- **You pay per request, by length.** Each AI call is billed on the text sent and returned. A packing list or a set of local tips is a short request; on a small, fast model that's a fraction of a cent.
- **A whole trip is likely a few dollars at most.** Even a few hundred calls stays in that range. Measured 11/16 at list price: about a tenth of a cent per import, about a cent with a flight lookup, and about two cents per Plan with AI request (Plan.md, section 5).
- **A hard cap removes the risk.** Your Max plan's $100 monthly Claude API credit is the cap: with no other credits on the account, calls stop when it runs out (decided 11/16; the course setup guide's alternative was a prepaid OpenRouter balance of $10 to $20). The key stays on the server, never in the app or on GitHub.
- **Every call gets logged with its cost,** which feeds the Sponsor Memo's cost section.

**Who pays, decided 11/16:** the Claude API, through the $100 monthly API credit your Max plan includes, instead of OpenRouter (Decided calls, AI provider). Cash cost is $0, and the credit doubles as the hard cap. Every call still logs its tokens and list-price cost, since the Sponsor Memo's unit economics can't rest on a subscription perk.

## Inviting people

- **Two ways in, and people are on the trip right away.** Add someone directly by name plus email or phone and send them a one-off text, or drop one group link in the chat for all ten.
- **The group link asks who you are.** People pick their name from the travelers already added; "Don't see your name?" lets them add themselves. A claimed name keeps the role picked for that person; people who add themselves get the link's default, set by the trip's owner (Owner, for a casual trip; your 11/16 call). A claimed name locks to that person's sign-in, so nobody else can take the spot.
- **Direct invites go out two ways.** TripTab emails them the trip link from triptab.org (Build 3; your 11/18 call), and a Text invite button opens your phone's Messages with the link filled in, for anyone you only have a number for.
- **Opening a link claims a spot.** They sign in and take over the traveler with their name, so they can be put on plans and costs before they ever open TripTab.
- **Two roles to start, picked from an Add as menu.** Owner: everything, from adding activities, costs and people (so a friend can bring a friend) to changing roles and deleting the trip. Viewer: sees the trip, opts in or out of activities and logs their own cost where everyone pays their own, but never sees the group link (11/16). Most trips make everyone an owner; a leader running a corporate trip keeps the rest as viewers. An in-between Editor role can come later if trips need one.
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
| Share links, roles, collaborators | Rebuild from scratch: Owner and Viewer roles, one group link plus direct adds | Build 2 |
| Data model and Lovable hosting | Replace; no Lovable hosting unless the course requires it | Build 2 |
| Date poll, bedroom assignments | Later | After the course |
| Full AI-built itineraries, floating chat | Park | After the course |

## What it won't do

- **Book trips or move money.** It says who pays whom; Venmo or Cash App does the paying.
- **Build whole itineraries on its own.** AI fills gaps and suggests; people build the plan. Maybe later, not in the course.
- **Ask for every coffee.** What you pay on your own is optional: log it to see your total, and it never gets split.
- **Ship as a native app.** A phone-first web app with a good desktop view.

## How it could make money

TripTab doesn't move money, so it would earn around the plan. Your ideas from 11/9, for after the course:

- **Sponsored suggestions.** When the group needs dinner Thursday night, TripTab knows the town, what you like, the rest of the day and the budget, so its picks can be targeted, and a restaurant can pay to be promoted.
- **Booking fees.** If someone books through a TripTab link, the venue pays a fee; the same for events, hotels and flights.

You see a real gap in the market and would keep TripTab running after the course if it works; how it makes money is the open part. **Claude's note:** sponsored picks need a visible label, or they undercut "AI suggests; the group decides."

## Competitive frame

| App | What it does well | Where it's weak (11/16 scan) | TripTab takeaway |
| --- | --- | --- | --- |
| Splitwise | Splits in every mode and the fewest-payment settle-up; free item-by-item receipts since Oct 2026 | Free users get 4 expenses a day with ads, which stalls trips; joining needs an account; anyone can edit anything | Match the settle-up; win on no cap, joining by link, and costs tied to plans |
| Venmo Groups | Up to 30 people, fewest payments, and the money moves in the same app | US only, no currencies found, everyone needs Venmo | The payment rail, not the rival: TripTab says who pays whom, Venmo moves it |
| Tricount, Splid | Free and simple; Splid needs no account | Tricount balances don't match between members; neither has a web app | Join from a link in the browser, with balances traceable line by line |
| Wanderlog | Collaborative, map-based itineraries | Forwarded bookings go missing or duplicate; splitting is thin; trial billing (Trustpilot 1.8) | Don't out-map it; plans here are a timeline tied to money |
| TripIt | Itinerary from forwarded booking emails | Parsing errors; photo and PDF import are Pro; no group splitting | Free AI import with a review step before saving (live since 11/16) |
| Lambus | Plans, bookings and expenses in one trip; AI assistants can write into a trip | Few reviews; currencies and to-dos are paid | Per-trip pricing that covers the group ($8.99) is a model to test |
| Travita (2026) | The closest match: AI day drafts, polls, tasks with owners, splits, PDF | iPhone only, no ratings yet | Watch it; TripTab's edge is the web link and costs per person |
| Troupe | Group votes on dates and places | Invite links reported broken; one guide reports it discontinued | Light polls later |
| AvoSquado | Bedroom assignments and house details | 10 ratings, no recent reviews | Who's staying where is built; bedrooms later |

*Updated 11/16 from a scan of 22 trip and expense apps: [TripTab market research](https://claude.ai/artifact/3Tj2RR8JBihagngKniXdRJ). The widest gap across both categories is costs inside a shared plan (each friend's own price next to a split bill, a paid mark, points); import, inviting and a visible plan status come next. Ratings and prices as read 11/16; Reddit was blocked for the scan.*

## How we'll know it's working

- **Keeping the trip current takes seconds or minutes,** not hours, for anyone on it.
- **Everyone in the ski group is on the trip** without anyone chasing a link.
- **At least 3 friends add or confirm costs** before the trip.
- **The settle-up matches** what everyone agrees they owe.
- **At least one friend says it beats** the group chat plus Splitwise.
- **PostHog tracks** people added, plans confirmed, expenses logged at confirm time, settle-up views, and every AI call with its cost.

## Questions for you

**Decided 11/18**

- **TripTab emails invites itself,** from triptab.org through Resend, now that the domain is bought; it goes in with the sign-in work in Build 3. The Text button still opens your own Messages; TripTab texting people itself stays beyond the course.
- **Build mode.** Nothing waits on a pod test any more; build the vision as far as it goes, each piece verified before the next.

* **Your own costs can go in.** What you pay on your own, like a $900 flight, can be logged so you see your total cost; it is never split.
* **One AI button.** Import and Plan with AI open from one button with two choices, I have bookings and Give me ideas; underneath they stay two separate functions.
* **Calls happen in chat.** At most five at a time, each with a recommendation. Ones you haven't answered wait in Open calls on the Run book tab; answered ones are archived on the For Claude tab.

**Raised 11/19** (your phone review on triptab.org, with Julia joining; built from 11/19)

- Google sign-in made a second account: you'd signed up with your alias address, and Google used your NetID address. Link or merge them (C19).
- People: the lock next to a Venmo name does nothing when tapped; an Owner can add someone's Venmo but not their Zelle.
- Pay with Venmo: the note shows + signs for spaces and the trip's dates; drop the date.
- Money: every cost in one list, plans with a cost, other expenses and payments, sorted by date with who paid and what you owe, filterable by kind (several at once), like Splitwise. On desktop, Money stays a summary that opens the full list.
- Your flights doesn't belong under Money: make it Travel and lodging (car rentals, stays, flights). On desktop, To do sits above Money.
- Describe it: don't park a question about the trip's dates on the To do list (fix the dates instead); skip needless questions (a lift ticket for a ski day); parts of the day select all that apply in the review, as in the dialog; a where for each plan (what: Skiing, where: Loon Mountain); Drive to Newton, not Depart for Newton; never show the AI cost.
- The plan dialog, progressively disclosed: lead with what, kind, date (not Day), parts of the day and status (Suggested, Planned, Confirmed). Cost details behind Add cost details; confirm a plan with no cost (a christening, a season-pass ski day) or before you know it; times and multi-day behind a toggle; transport uses the same parts as everything else; times in 15-minute steps.
- 0 of 1 booked on plans without a cost is confusing.
- Plan cards fully opaque white, across the board.
- Who's going: initials on each plan's card (MP, JB), so a big group sees who's in.
- To-dos from Describe it open the plan they're about when tapped; addresses autocomplete.
- To do's example text (Book the Barcelona flight) reads like a real to-do; use a neutral example.
- Drag on iPhone: a press held still brings up iOS's own menu.
- Adding Julia with her email sent no email; Text it to the group worked. Link previews in iMessage should show an image.
- Worked well: drag and drop (scrolling behind it, dropping onto a filled slot), the frosted part-of-day tags, Zelle copying the number, Pay with Venmo opening Venmo, Julia joining with Google.

**Raised 11/17** (setting up the pod test trip; scheduled for Build 3 in the Features row on the Run book tab)

- **Adding plans needs more flexibility.** An Add a plan button at the top of the trip, not only tapping a slot. A plan can run across several days with a start and end time (skiing 9 AM to 4 PM every day in Chamonix) instead of picking Morning and Day on each day. The four parts of the day stay as how the itinerary is laid out, and empty slots still show, so a gap like Thursday night stands out.
- **Parts of the day are select all that apply.** The four part-of-day bubbles take more than one pick (Morning and Day for skiing), replacing the "Runs through the" dropdown.
- **Plans save as you go.** A plan saves automatically, with no Save button to hit at the bottom.
- **Cost starts collapsed.** The cost section is folded when the plan opens, so it doesn't overwhelm, especially for plans with no cost (skiing on a season pass).
- **A red-eye night needs no lodging.** Importing a flight worked fine (11/17), but the night of an overnight flight (UA 956 Newark to Geneva, landing Fri 2/5 at 6:25 AM) still prompts "Add where everyone's staying". That night should show the flight in the stay row, or mark lodging not needed, for the people on it.
- **Start a trip by describing it.** Starting a trip offers two ways: enter dates and stops by hand, or type or dictate what's already planned in free form (from Granola or Wispr Flow, say: "Chamonix Feb 5 to 12, then Andorra; skiing every day in Chamonix, a dinner reservation Thursday, flights and the Airbnb booked"). AI sets up the trip and its plans, then asks follow-up questions to fill the gaps (flight numbers? the Airbnb link?). Why: a 12-day trip is 48 slots plus lodging and travel, too much clicking by hand.
- **Claude's note:** part of the first exists today (a plan's "Runs through the" and "Every day through" fields make skiing every day one plan, and it works well per your 11/17 try), so the gaps are clock times, a top-level Add button, multi-select parts and making the multi-day option easy to find. Describing a trip extends AI import, which today works only inside a trip that already exists.

**Raised 11/17, after the pod test** (scheduled for Build 3 in the Features row on the Run book tab)

- **Start a trip: the photo waits for the place.** The background photo changes with every keystroke while typing a stop; it should change only once a place is picked. Stops should autocomplete as you type.
- **Plan with AI: pick a day for each idea.** Each suggested idea can take a day (and part of the day), not only a checkbox to keep it.
- **Suggested plans show who suggested them.**
- **Drag and drop plans** to move them between slots and days.
- **Phone: the Add a plan dialog opens at the top of the page.** Adding to a day lower on the itinerary means scrolling all the way back up to reach it; it should open where you are.
- **Google sign-in.** A podmate who claimed her spot on her phone couldn't get in on her laptop: the link said her spot was taken instead of asking her to sign in. Signing in on the laptop fixed it. Google sign-in, and a "Sign in" prompt on a taken spot, would avoid this.
- **A "Show me around" guide for new users.** A short walkthrough of the app the first time someone joins or starts a trip, so they get comfortable with it.
- **Settle up mid-trip and record payments.** When you pay for the Airbnb up front and collect from people in advance, each payment gets recorded (who paid whom, how much), the way Splitwise's Record a payment works, and balances update right away instead of waiting for the end of the trip. TripTab still doesn't move money: each payment links out to Venmo to pay, and cash or another app (Zelle, say) can be recorded by hand. Today Settle up only lists the payments; there is no way to record one.
- **How people pay you (Mike, 11/18).** Each person adds a Venmo username and a Zelle phone or email, asked once right after they join a trip and changed from People or Settle up (where it lives is C9). Once you save your own, it's locked to you: until then an Owner can add or fix someone's Venmo, and only you add your Zelle. A Venmo payment's note says TripTab, the trip's name and its dates.

**Decided 11/16** (from your walkthrough and the market scan)

- **Who pays:** every plan is One bill, split or Everyone pays their own; flights default to their own. Own lines never create debts. Everyone sees who has booked; each price shows only to its owner. A plan is Confirmed once everyone going has booked. Points are a tag on your own line.
- **The first AI feature is import of bookings,** started 11/16 ahead of Build 4, on the Claude API through your Max plan's monthly credit.
- **Quick fixes go live before the pod test:** separate Sign in and Create account, readable dropdowns and labels, to-do dates before the trip. Everything else was to wait until after the pod test; your later 11/16 call published it that evening.

**Answered in your 11/9 review**

- The ski group: still forming, about 7 to 10 people. Different people book the cars, the Airbnb and reservations, and several will pay; you don't expect trouble getting them on.
- Currency: US dollars, since cards bill in dollars even when the price is in euros. Entering another currency at that day's rate is a stretch goal, details TBD; it would miss card fees.
- Roles: start with two, Owner and Viewer, picked from an Add as menu when you add someone; you chose two to keep it simple. Owners add activities, costs and people, so a friend can bring a friend; most trips make everyone an owner, and a corporate trip leader keeps the rest as viewers. People who come in through the group link get a default role the owner sets, and a claimed name locks to that person's sign-in.
- Viewers: see the trip and opt in or out of activities, nothing else.
- Statuses: three, Suggested → Planned → Confirmed, and Confirmed means paid; what matters is whether it's paid for, not whether it happened. Free things confirm at $0, and the date shows what's past.
- Week view: in the course, not a stretch.
- Day chips: the actual day, like Thu 2/5.
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

**Parked until December (nothing before then depends on it)**

1. **The Sponsor Memo:** it's the course's last deliverable (12/14), a one-page call to invest, maintain or sunset, backed by real usage and costs. You said investing hinges on a way to make money; what would make you sunset it? Claude's pick: invest if 3 or more friends add costs without being chased and a money test looks worth running; maintain if it works but only you enter things; sunset if the group won't use it even once it's online.
