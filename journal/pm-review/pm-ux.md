# TripTab UX review for the PM review (11/23)

**These are expert judgment from one reviewer, not user evidence.** I drove the app myself against TripTab dev (local `npm run dev`) with Playwright at 390 px (phone) and 1280 px wide. No real friend has tried these screens; the rankings say where I'd expect friction, not where it was seen. Test accounts were `uxtest-ycgf4-{owner,julia,vic}@example.com` on dev only. AI calls used: 1 (Describe it). Nothing in the repo changed; the dev server is stopped.

Screenshots are in `(screenshots kept in the session, not committed)/` (file names below are relative to that folder). The project's own `contrast-check.cjs` was also run: 5 text runs under the bar, all minor (the "0" counts on Money's filter chips at 3.6:1, and "Show me around" at 3.5:1 in week view).

## What I walked

1. Landing, Start a trip, sign up with email, Describe it (1 live AI call, 7.6 s), the ski trip example.
2. The owner taps an empty slot, adds a dinner as Planned with an estimate, uses Add a plan, then confirms the dinner with a real cost, paid by Julia, with Sam left out.
3. People panel: added Julia, Vic and Sam by name and copied the group link. Then, in a fresh signed-out phone, opened the link, picked Julia, signed up, joined and landed. Did the same as Vic on a desktop.
4. Money: balances, Settle up, recording a payment, adding Venmo and Zelle.
5. Signing out, signing back in, My Trips. Also checked the error states: a wrong password, a dead group link, and a trip id that doesn't exist.

Timing for a new friend: from opening the link to seeing the trip took **13 s with a script** (a person typing will take more like 60 to 90 s). That was 6 screens: Who are you, Create account, Use email (a tap), the form, "Join as Julia?", "How should people pay you back?". Then the tour (1 of 6) and the email banner come before the trip itself.

## Ranked issues

Ranked by impact on a new friend joining, then on the owner's core loop.

### 1. The invite shows nothing worth joining for (L)
- **Screen:** Join, "Who are you?" (`31-join-who-phone.png`, `54-join-who-desk.png`).
- **What I saw:** Only the trip name, dates and stops, then a grid of names. It doesn't say who invited you, show any plans or say who's coming. The friend can't see that Julia paid $380 for dinner and is owed $253. At 390 the owner's name is cut to "Mi..." because of the "Joined · Sign in" tag, so the one familiar name is the one you can't read.
- **Why it matters:** The riskiest assumption is that friends get into the trip. Right now a friend has to create an account before seeing any value.
- **Fix:** Before sign-up, show a read-only preview. Add a line like "Mike invited you", show the next 3 plans and who's in, and, once costs exist, "you'd owe about $X". Put the Joined tag on its own line so the names never get cut.

### 2. Too many steps between the link and the trip (M)
- **Screens:** `32-join-after-pick-phone.png` → `33-join-email-form-phone.png` → `34-join-after-signup-phone.png` ("Join as Julia? Back / Join the trip") → `35-join-payback-phone.png` → `36-friend-lands-phone.png` (tour 1 of 6 plus the email banner).
- **Why it matters:** The friend has already picked "Julia" and made an account, so "Join as Julia?" asks the same question again. The payback step comes before they've seen the trip. On top of that, the tour and a 250 px email banner cover the first view.
- **Fix:** Join automatically after sign-up and drop the confirm screen. Move "How should people pay you back?" to the first time Settle up or Money opens, or to a card inside the trip. Hide the email banner during the first session. Shorten the tour for friends to 2 steps.

### 3. Sharing the group link is buried for the owner (M)
- **Screens:** `12-tripB-empty-phone.png` (the trip just after it's created) and `50-owner-trip-desk.png` (desktop).
- **What I saw:** After Start the trip, nothing prompts the owner to bring people in. On a phone, the link is under the 4th tab, People. On desktop, the People card starts at y=1056, below Action items, Travel and lodging, and Money, so it's off the first screen (`56-people-desk.png`).
- **Fix:** Put an "Invite the group" card with Copy and Text at the top of a trip that has only 1 person, and add an Invite button in the trip header. On desktop, put People first in the sidebar until someone joins.

### 4. Who's in on a plan and who's in on its bill disagree (M)
- **Screens:** `27c-confirm-filled-bottom-phone.png` and `28b-card-confirmed-phone.png`.
- **What I saw:** I confirmed the dinner split 3 ways with Sam unticked. The card still says "Everyone", and the plan still says "Who's in (4 of 4)". Money shows Sam as "even".
- **Why it matters:** A friend reading the card will think Sam paid in, or that they owe for something they skipped. Trust in the money is the product.
- **Fix:** Use one list for both. Unticking someone in the confirm step takes them out of the plan too, or asks "Also mark Sam as out?".

### 5. Confirming with a cost is hidden, and there are two "confirm" paths (M)
- **Screens:** `24-plan-open-phone.png` and `26b-plan-cost-open-phone.png`.
- **What I saw:** Opening a plan shows a long edit form. The Status chips include "Confirmed", which marks the plan confirmed without a cost. The "Confirm with the real cost" button sits inside the collapsed "Cost and who pays" section, about 1.5 screens down.
- **Fix:** On a Planned plan, show a primary "Confirm and log the cost" button at the top of the sheet. Put the editing fields below it.

### 6. The phone sheet's main button is off screen (S)
- **Screens:** `13-slot-dialog-phone.png` and `16-addplan-bottom-phone.png`.
- **What I saw:** In Add a plan, the "Add to trip" button sits at y=1150 on an 844 px screen, below about 12 fields, even when the only thing typed is "What". Edit plan and Confirm work the same way.
- **Fix:** Pin Discard and Add to trip to a footer at the bottom of the sheet.

### 7. Tap targets under 44 px on the phone (S)
- **What I saw:** From a scan of the itinerary and People tabs at 390:
  - Tabs: 38 px.
  - Header icons and AI help, Add a plan, Day by day, Week: 36 px.
  - Copy invite, Text, Link settings, Add Venmo or Zelle, Remove: 32 px.
  - "Send it again": 16 px.
- **Why it matters:** DESIGN.md section 5 sets 44 px as the minimum.
- **Fix:** A `min-h-11` on the shared button sizes. Space Remove further from Add Venmo or Zelle (`22-people-4-full-phone.png`).

### 8. An empty trip is very long, and the AI review can be lost (M)
- **Screens:** `12-tripB-empty-full-phone.png` and `06-describe-review-phone.png` (then `08-tripA-after-describe-phone.png`).
- **What I saw:** 12 empty days take about 4,900 px of dashed boxes on a phone. Separately, I left Describe it's review sheet without saving (I closed the browser). When I reopened the trip, the Chamonix Airbnb plan and the 3 to-dos were gone, with no way back to them.
- **Fix:**
  - Collapse empty days into a single "+ Add" row.
  - Keep a pending AI review on the trip, with a banner like "1 plan from your description waits for review".

## Smaller notes
- My Trips cards show no state: no balance, no plan count, no "3 of 4 joined". Both trips use the same aurora photo, so they're hard to tell apart (`62-return-lands-phone.png`). The Google-link and "Also forward from" panels are too much for a first visit (`07-mytrips-one-phone.png`).
- The day chips highlight the wrong day while scrolling: Fri stays lit while you're looking at Sat (`14-after-add-phone.png`, `16-addplan-bottom-phone.png`).
- The sign-up button stays disabled with no reason given. With a 5-letter password, only the grey hint "At least 8 characters" shows (`03b-signup-short-pw-phone.png`).
- On New trip, the grey placeholders ("Euro ski trip", "Chamonix") look like filled-in values (`04-newtrip-full-phone.png`).
- After Describe it, the "Fill it in" chip is still highlighted (`05d-describe-result-phone.png`).
- On the payback step, "Skip for now" and "Save and open the trip" are stacked and right-aligned (`35-join-payback-phone.png`).

## Works well, keep it
- **Money and Settle up** (`40-friend-money-phone.png`, `42-settle-up-phone.png`). "You're owed $253.33" in large green, the per-person list, "You → Julia $126.67", and Record it filling in the amount are clear and fast. The one-line summary in the confirm step ("Logs $380, paid by Julia, split 3 ways") is excellent.
- **Error and edge states:**
  - A wrong password explains itself and points to Google (`63-wrong-password-phone.png`).
  - A dead link says "This link isn't active... Ask them for the current link" (`64-bad-join-link-phone.png`).
  - A joined name offers "Joined · Sign in" instead of a dead end.
- **The look and readability.** Plan cards are opaque white with dark text, the dialogs are dark, the photo stays behind everything, and the legend reads clearly. It is consistent with DESIGN.md and the contrast check is nearly clean. Tapping a slot pre-fills the day and part, which is a good habit to keep.
