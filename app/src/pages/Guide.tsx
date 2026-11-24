import type { ReactNode } from "react";
import { Link } from "react-router";
import { TopBar } from "../components/TopBar";
import { PhotoFrame } from "../components/ui";
import { useAuth } from "../lib/auth";
import { LANDING_PHOTO } from "../lib/photos";

/**
 * How TripTab works: the written guide (Mike's call 11/23), open to anyone and one tap away on
 * every signed-in page through Help. It says what the app does today: change it with the features
 * it describes, the same as the privacy page. Show me around, on a trip, is the short tour of the
 * same things.
 */
const UPDATED = "November 23, 2026";

const SECTIONS: { id: string; title: string; body: ReactNode }[] = [
  {
    id: "start",
    title: "Start a trip and get everyone in",
    body: (
      <ul>
        <li>
          <b>Start a trip</b> with its stops and dates, or describe it in your own words and let TripTab set it up for
          you to check.
        </li>
        <li>
          <b>Invite the group:</b> tap Invite and drop the group link in your group chat. Before signing up, a friend
          sees who invited them, who's coming and the next few plans. They pick their name, make an account and they're
          on the trip.
        </li>
        <li>
          <b>Owners and Viewers:</b> Owners add and change plans, costs and people. Viewers see everything, say whether
          they're in, vote, and tick off their own to-dos.
        </li>
      </ul>
    ),
  },
  {
    id: "plans",
    title: "Plans",
    body: (
      <ul>
        <li>
          <b>The itinerary</b> runs day by day, morning to night, with where everyone's staying. Week shows the whole
          trip at once. A day with nothing on it folds to one row: tap it to open.
        </li>
        <li>
          <b>Suggested, Planned, Confirmed:</b> a Suggested plan has a dotted outline, a Planned one is solid, a
          Confirmed one has a green check, and a paid one a green $ check.
        </li>
        <li>
          <b>Tap a plan</b> to see its details. Say <b>I'm in</b> or <b>I'm out</b>, so the plan and its bill only count
          the people going. The strip at the top of a trip lists every plan with where you stand, <b>You're in</b> or{" "}
          <b>You're out</b>, and a <b>Join</b> or <b>Drop</b> button to change it. On a Suggested plan, tap <b>I want this</b> so the group can see which ideas are popular.
        </li>
        <li>
          <b>Add a plan</b> with Add a plan, or tap any empty part of a day. Owners can drag a plan to another day or
          part of the day (on a phone, press and hold first).
        </li>
        <li>
          <b>AI help</b> reads a pasted booking email, a PDF or a screenshot and turns it into plans, or suggests ideas
          for the empty parts of the trip. Nothing is added until you've looked it over; if you close the review, it
          waits on the trip.
        </li>
        <li>
          <b>Forward bookings by email:</b> each trip has its own address (under AI help). Forward a confirmation to it
          and the plans wait for an Owner to review. To forward from another address of yours, add it under Also
          forward from on your profile.
        </li>
        <li>
          <b>Calendar and PDF:</b> add your plans to your own calendar, or print the trip.
        </li>
        <li>
          <b>Trip settings:</b> an Owner taps the trip's name at the top (it has a pencil), or Settings beside it, to rename
          the trip, change its stops and dates, or delete it. Stops and dates, in Travel and lodging, opens the same place.
        </li>
      </ul>
    ),
  },
  {
    id: "money",
    title: "Money",
    body: (
      <ul>
        <li>
          <b>Confirm and log the cost:</b> when a plan is booked, an Owner enters what it cost, who paid and who's in.
          TripTab splits it. A plan where everyone pays their own keeps each person's cost to themselves.
        </li>
        <li>
          <b>Your balance</b> is on Money: what you owe or are owed, and everyone else's.
        </li>
        <li>
          <b>Settle up</b> shows the fewest payments that make everyone even. Pay with Venmo opens Venmo with the amount
          filled in; for Zelle, copy their number or email. Record a payment once it's made. TripTab never moves money itself.
        </li>
        <li>
          <b>Other currencies:</b> a booking priced in euros or another currency is shown in dollars at that day's rate.
        </li>
      </ul>
    ),
  },
  {
    id: "todo",
    title: "To do",
    body: (
      <ul>
        <li>What still needs doing before the trip, who's on it and by when. Tick yours off when it's done.</li>
      </ul>
    ),
  },
  {
    id: "you",
    title: "You: your profile",
    body: (
      <ul>
        <li>
          <b>Fill it in once:</b> your name, Venmo, Zelle and phone go on every trip you're on and every trip you join.
        </li>
        <li>
          <b>The lock:</b> locked, only you can change your Venmo, Zelle and phone. Unlocked, an Owner of a trip you're
          on can add or fix them for that trip.
        </li>
        <li>
          <b>What you like:</b> an optional list of foods and things to do. It's private unless you share it, and it
          helps AI help suggest plans the group will like.
        </li>
      </ul>
    ),
  },
  {
    id: "phone",
    title: "On a phone or a computer",
    body: (
      <ul>
        <li>
          The bar along the bottom switches between Itinerary, Money, To do and People. Each one keeps its place when
          you come back to it.
        </li>
        <li>
          On a computer the same sections are tabs across the top, after <b>Overview</b>, which shows the itinerary with
          Money, To do and People beside it.
        </li>
      </ul>
    ),
  },
  {
    id: "help",
    title: "Help and feedback",
    body: (
      <ul>
        <li>
          <b>Show me around</b> is a one-minute tour of a trip. Open it any time from Help on a trip.
        </li>
        <li>
          <b>Send feedback</b> from Help to report a bug or ask for a feature. It goes to the person who builds TripTab.
        </li>
        <li>
          <Link to="/privacy">How TripTab uses your data</Link> says what TripTab keeps and who sees it.
        </li>
      </ul>
    ),
  },
];

export default function Guide() {
  const { user } = useAuth();
  return (
    <div className="relative min-h-dvh">
      <PhotoFrame src={LANDING_PHOTO} tone="landing" />
      <div className="relative z-10">
        <TopBar
          back={user ? { to: "/trips", label: "My trips" } : { to: "/", label: "Home" }}
          title="Guide"
          subtitle={`Updated ${UPDATED}`}
        />
        <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
          <article className="glass-card-solid rounded-3xl !bg-[rgba(246,241,233,0.94)] p-6 text-foreground sm:p-10">
            <h1 className="mb-2 font-display text-3xl font-bold italic sm:text-4xl">How TripTab works</h1>
            <p className="mb-6 text-base">
              One place to plan a group trip, run it and settle it. Here's what each part does.
            </p>
            <nav aria-label="In this guide" className="mb-8 flex flex-wrap gap-2">
              {SECTIONS.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className="inline-flex min-h-11 items-center rounded-full border border-foreground/15 bg-white/60 px-3.5 text-sm font-semibold text-foreground hover:bg-white"
                >
                  {s.title}
                </a>
              ))}
            </nav>
            {SECTIONS.map((s) => (
              <section key={s.id} id={s.id} className="mb-7 scroll-mt-20 last:mb-0">
                <h2 className="mb-2 font-display text-xl font-bold">{s.title}</h2>
                <div className="space-y-2 text-sm leading-relaxed sm:text-base [&_a]:font-semibold [&_a]:underline [&_a]:underline-offset-4 [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_ul]:space-y-2">
                  {s.body}
                </div>
              </section>
            ))}
          </article>
        </main>
      </div>
    </div>
  );
}
