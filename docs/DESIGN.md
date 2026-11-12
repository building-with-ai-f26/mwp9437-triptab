# TripTab design: the spring look, ported

The rebuild keeps the spring app's look (confirmed 11/9) and none of its data model. Every value below comes from the spring code at [github.com/mwp9437/triptab-RETIRED](https://github.com/mwp9437/triptab-RETIRED); the file it comes from is named on each section so the two can be compared line by line. Where the rebuild changes something, the change and the reason are marked **Rebuild:**.

## 1. Palette

From `src/index.css` (the `:root` block of CSS variables, written as HSL) and `tailwind.config.ts` (which maps them to Tailwind color names). Hex values are converted from the HSL.

| Token | Spring HSL | Hex | Used for |
| --- | --- | --- | --- |
| `background` (ivory) | 45 25% 97% | #f9f8f5 | Page background behind the photo overlay |
| `foreground` (charcoal) | 240 20% 12% | #181825 | Body text, the dark pill buttons in the landing header |
| `primary` = `gold` = `accent` (brown) | 30 25% 44% | #8c7054 | Primary buttons, day numbers, focus rings, icon accents |
| `gold-dark` | 30 30% 32% | #6a5239 | Pressed and hover brown |
| `gold-light` | 30 20% 90% | #ebe6e0 | Tinted chips |
| `secondary` = `sand` | 35 30% 92% | #f1ece4 | Secondary buttons and fills |
| `muted` | 40 15% 94% | #f2f0ed | Quiet fills |
| `muted-foreground` | 220 10% 46% | #6a7181 | Labels, times, suggested-plan titles |
| `border` | 35 15% 88% | #e5e1dc | Hairlines on solid surfaces |
| `stone` | 30 20% 78% | #d2c7bc | Neutral swatches |
| `stone-dark` = `sand-dark` | 30 15% 55% | #9d8c7b | Left stripe on stays |
| `indigo` = `ocean` | 225 30% 45% | #506295 | Left stripe on transport |
| `rose` = `coral` | 350 50% 65% | #d27988 | Left stripe on activities |
| `sage` = `seafoam` | 155 20% 55% | #75a390 | Left stripe on free time; the `$` expense badge |
| green-500 / green-600 (Tailwind defaults) | | #22c55e / #16a34a | The confirmed check badge |
| `destructive` | 0 72% 51% | #dc2828 | Delete |

`--radius` is `1rem` (16px). Cards and chips use `rounded-2xl` (16px) or `rounded-xl` (12px).

Spring also defined a `.dark` palette; it was never switched on in the app, so the rebuild leaves it out.

## 2. Type

From `src/index.css` (the Google Fonts `@import`, the `body` and `h1`..`h6` rules, `.font-display`, `.tracking-luxury`) and `tailwind.config.ts` (`fontFamily`).

- **Playfair Display** (serif, 400 to 900, with italics) for every heading. Headings that set the mood are italic: "Plan it. Split it. Live it." on the landing page (`LandingHub.tsx`), "Your Itinerary" and "My Trips" (`Dashboard.tsx`, `MyTrips.tsx`).
- **DM Sans** for body text, inputs and buttons.
- **Small uppercase labels:** `text-[10px] uppercase tracking-luxury` where `tracking-luxury` is `letter-spacing: 0.15em`. Used for the date under each day title and the section labels in the sidebar (`Dashboard.tsx`).
- Sizes: landing headline `text-3xl sm:text-4xl md:text-5xl font-bold italic`; page title `font-display font-bold text-lg`; item titles `font-body text-sm` (medium weight when solid, italic when suggested); meta lines `text-xs text-muted-foreground`.

## 3. Glass recipes

All from the `@layer utilities` block in `src/index.css`. The glass only works over a photo, so every screen sits on one (section 4).

| Class | Background | Blur | Border | Shadow | Used for |
| --- | --- | --- | --- | --- | --- |
| `.glass` | white 8% | `blur(8px) saturate(1.3)` | white 15% | inset top highlight white 20% | Small chips: day chips, icon buttons, the day-number tile |
| `.glass-dark` | black 12% | `blur(8px) saturate(1.3)` | white 8% | inset white 10% | Dark chips (rare) |
| `.glass-card` | white 12% | `blur(12px) saturate(1.4) brightness(1.05)` | white 25% | `0 8px 32px rgba(0,0,0,.08)` plus inset highlights | Sticky header, sticky day-chip bar, landing entry cards, trip cards |
| `.glass-card-solid` | white 25% | `blur(16px) saturate(1.4) brightness(1.05)` | white 30% | same as `.glass-card` | Itinerary items and sidebar cards (the readable layer) |
| `.glass-card-readable` | rgb(30,30,30) at 88% | `blur(20px) saturate(1.3)` | white 15% | `0 8px 32px rgba(0,0,0,.3)` | Dialogs and drawers: dark glass with white text |

All four transition `all 0.3s cubic-bezier(0.4, 0, 0.2, 1)`.

**Spring's mobile fix, kept:** inside dialogs and drawers, `backdrop-filter` breaks on mobile WebKit, so `.glass-card-readable` falls back to a fully opaque `rgb(30,30,30)` there (`src/index.css`, the `[role="dialog"]` rules). The rebuild's one dialog uses the opaque version from the start.

**Inputs on glass** (`wizard/ExistingTripSetup.tsx`): `rounded-xl border-border/50 bg-white/50 backdrop-blur-sm`, going to `bg-white/80` on focus.

## 4. Photography and page frame

- **Landing:** full-bleed golden-hour beach (`photo-1507525428034-b723cf961d3e` on Unsplash) with a slow Ken Burns zoom (`.bg-kenburns`: scale 1.00 to 1.04 over 25s, `src/index.css`) and a top-and-bottom dark gradient, `rgba(0,0,0,.35)` at the edges to clear at the middle (`LandingHub.tsx`). Text on it is white with `drop-shadow`.
- **Trip screens:** a destination photo, fixed behind everything, picked by matching the destination against a list of curated Unsplash photo ids (Paris, Barcelona, Switzerland and about 45 more), else one of three travel fallbacks chosen by a hash of the name (`Dashboard.tsx`, `DESTINATION_PHOTOS`, `getDestinationImageUrl`). Over it: `bg-gradient-to-b from-background/40 via-background/45 to-background/55 backdrop-blur-sm`, so the photo reads as a warm, soft wash and the glass stays legible.
- **My Trips:** the same frame with a bundled resort photo and a slightly heavier overlay (`/50 via /55 to /65`, `MyTrips.tsx`).

**Rebuild:** the same photo list and overlay. The rebuild adds Chamonix, Andorra and an Alps fallback for the ski trip, since the spring list had none of its stops.

## 5. Buttons

- **Primary** (`wizard/ExistingTripSetup.tsx`, the submit button): `bg-primary text-primary-foreground h-11 px-6 shadow-lg shadow-primary/20 font-display font-semibold`, brown with white text, Playfair on the label.
- **Header pills** (`LandingHub.tsx`, `WizardContainer.tsx`): `rounded-full bg-foreground text-background`, charcoal pills.
- **Glass buttons** (`Dashboard.tsx` header, `InviteModal.tsx`): `rounded-xl border-white/20 glass hover:bg-white/30`.
- **Small action buttons on items** (`Dashboard.tsx`): `px-2.5 py-1.5 min-h-[36px] min-w-[44px] rounded-lg border border-white/20 text-xs`, turning `bg-primary/15 text-primary` on hover. The 44px minimum is a phone tap target.

**Rebuild:** CLAUDE.md calls for brown pill buttons, so the primary button keeps spring's brown, shadow and Playfair label and takes the header pills' `rounded-full` shape. Header actions stay glass.

## 6. The itinerary timeline

From `Dashboard.tsx` (the "Left: Itinerary" column).

- **Layout:** two columns at `lg` (1024px) and up: the itinerary on the left (`flex-1`) and a 380px glass sidebar on the right with actions and money. On phones, a three-way tab toggle (Schedule, Details, Expenses) sits under the header: `flex-1 py-2 rounded-xl text-sm font-display font-semibold`, the active tab as `glass-card shadow-md`.
- **Sticky header:** `glass-card`, `border-b border-white/15`, trip name in `font-display font-bold`.
- **Day chips:** a sticky, horizontally scrolling row (`sticky top-0 z-30 glass-card overflow-x-auto`). Each chip is `glass rounded-2xl min-w-[36px] sm:min-w-[40px]` with the weekday letter in Playfair bold over the date number in DM Sans; tapping scrolls to that day. **Rebuild:** the chip shows the actual day, "Thu" over "2/5", per the vision (spring showed only "T" over "5").
- **Day header:** a 40px `glass rounded-2xl` tile with the day number in brown Playfair, then the day title in Playfair semibold and the date as a small uppercase `tracking-luxury` label, then a round glass `+` button.
- **Items:** indented 52px from the day header, over a vertical hairline (`absolute left-4 w-px bg-border/40`). Each item is a `glass-card-solid rounded-2xl p-3.5` card with a 4px left stripe colored by kind (indigo transport, rose activity, gold meal, sage free time). Height scales with duration (56 to 140px). A meta line under the title shows a clock with the times and a pin with the place.
- **Stays:** after the day's items, separated by `border-t border-border/30`: a `glass rounded-2xl p-3` row with a 32px `bg-primary/10` bed tile, "Check in: Name @ 3 PM" on the first night, "Check out: Name @ 11 AM" on the last, the place, and the price "/night". A day with no stay shows a dashed "Add lodging" placeholder with a sparkle.
- **Empty slots:** spring guessed missing slots from clock times (Morning Activity 9 to 12, Evening Plans 18 to 21) and drew a dashed placeholder for each: `rounded-2xl border-2 border-dashed border-white/20 bg-white/5`, italic muted title, two buttons ("Add to itinerary" in `bg-primary/15 text-primary`, "See alternatives" ghost).

**Rebuild:** the vision replaces clock times with four named parts of the day. Morning, Day, Evening and Night run down the left of each day as small uppercase `tracking-luxury` labels, and each part holds that part's items, so the day reads without timestamps. An empty part shows a faint dashed "+ Add" slot in the spring placeholder style. The stay row closes each day as in spring. Item times are optional.

## 7. Status styling

From `Dashboard.tsx` (the item card and the stay row) and `EditablePrice.tsx`.

| State | Spring styling |
| --- | --- |
| Suggested | Faint on purpose: `!bg-white/10` instead of the solid glass, a dashed 4px left border `border-l-muted-foreground/30` instead of the kind color, a brown sparkle icon at 50% (`text-primary/50`) instead of the kind icon, the title in `italic text-muted-foreground`, and the price as `~$25 est.` in `text-muted-foreground/70`. Confirm, Remix and Remove buttons under it. |
| Confirmed | Solid: `glass-card-solid`, the kind's colored left stripe, the kind icon at 70%, the title `font-medium`, the exact price with no tilde and no "est.", and a 20px green check badge in the top right (`bg-green-500/20 text-green-600`). |
| Expense logged | A 20px sage `$` badge (`bg-sage/20 text-sage text-[10px] font-bold`), next to the check. The vision's green "$ ✓" is these two badges side by side. |
| Opted out | The whole card at `opacity-50`. |
| Price | `EditablePrice.tsx`: an estimate shows `~` before the dollar sign and a small "est." after; an exact price shows neither. |

**Rebuild:** three statuses instead of two (the vision: Suggested, Planned, Confirmed, and Confirmed means paid).

- **Suggested:** spring's faint style, unchanged.
- **Planned:** new. Solid glass and the kind's stripe, so it reads as decided, but the price keeps `~` and "est." and there is no badge yet.
- **Confirmed (paid):** spring's confirmed style with both badges together as the green "$ ✓", since confirming and logging the expense are now one step.
- Opted out stays at 50% opacity.

## 8. Dialogs

Spring used a centered Radix dialog on desktop and a bottom drawer on phones, both `glass-card-readable` (`AddActivityModal.tsx`, `AccommodationHub.tsx`), and the phone version broke through four fix attempts (the vision's "rules for the rebuild"). **Rebuild:** one dialog component, the opaque dark version of `glass-card-readable`, centered on desktop and pinned to the bottom of the screen at phone width with its own scroll, checked at 390px on every build.

## 9. Held back

The pod's 11/10 feedback (less glass, darker text, the popup's position) was about the broken spring app. It is not applied here until the pod has tried this build (CLAUDE.md, Design).
