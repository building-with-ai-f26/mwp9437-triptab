import type { ReactNode } from "react";
import { TopBar } from "../components/TopBar";
import { PhotoFrame } from "../components/ui";
import { LANDING_PHOTO } from "../lib/photos";

/**
 * TripTab's privacy page (Build 3), linked from the landing page, sign-in and Google's consent
 * screen. Every line describes what the code does today: change it with the code it describes.
 */
const UPDATED = "November 23, 2026";
const CONTACT = "privacy@triptab.org";

const SECTIONS: { title: string; body: ReactNode }[] = [
  {
    title: "What TripTab keeps",
    body: (
      <ul>
        <li>
          <b>Your account:</b> your name and email, and your password (stored only as a one-way hash), or, if you
          continue with Google, the name, email and profile picture Google shares. TripTab asks Google for nothing
          else: not your contacts, calendar, Gmail or Drive. Its use of what Google shares follows the Google API
          Services User Data Policy, including its Limited Use requirements.
        </li>
        <li>
          <b>Your trips:</b> what you and your group put in them: trip names, dates and stops, plans with their times,
          notes, places and costs, who's going, who paid and how it splits, and payments you record (who paid whom, how
          much, when, and whether by Venmo, cash or another app). TripTab never sees your bank or Venmo account.
        </li>
        <li>
          <b>People you add:</b> a trip's Owners can add people by name and, if they like, an email or phone number, so
          TripTab can send them their link, and a Venmo username, so the group can pay them.
        </li>
        <li>
          <b>Your profile:</b> if you add them, your Venmo username, a phone number or email for Zelle, and your phone
          number. They are kept once, on your profile (You), and put on all your trips and on trips you join later,
          until you change or clear them.
        </li>
        <li>
          <b>What you like:</b> if you fill in the short survey on your profile, the cuisines and activities you
          ticked. It's optional, and private unless you choose to share it.
        </li>
        <li>
          <b>Plans you say you want:</b> if you tap I want this on a suggested plan, TripTab keeps that vote until you
          take it back or the plan is removed.
        </li>
        <li>
          <b>Addresses you forward from:</b> if you add another email address under Also forward from, TripTab keeps it
          on your account and emails it a 6-digit code once, to check it's yours; only a scrambled form of the code is
          kept. Only you see these addresses, and you can remove them at any time.
        </li>
        <li>
          <b>Emails you forward to a trip:</b> each trip can have its own address. An email someone on the trip
          forwards there, from the email they use for TripTab or an address they've added, is read once by AI import;
          TripTab keeps who on the trip sent it, its subject and the plans it found, for the trip's Owners to review. The
          email itself is never stored. An email from an address nobody on the trip has isn't read: it waits for an
          Owner, who sees the address it came from and its subject. Until an Owner reads or dismisses it, or for 7 days
          at most, TripTab keeps what AI import would read (its text and its first PDF or photo), then deletes it.
        </li>
        <li>
          <b>Logs:</b> a record of each AI request (who asked, on which trip, when, how long the input was and what it
          cost) and of each invite email (who sent it, to which person, when). They hold counts and costs, never your
          text or anyone's email, and they stay after a trip is deleted so TripTab's costs and daily limits add up.
          When you sign up, TripTab keeps a scrambled (hashed) form of your network address, never the address
          itself, so it can limit how many accounts are made from one place.
        </li>
      </ul>
    ),
  },
  {
    title: "Who sees it",
    body: (
      <ul>
        <li>A trip is visible only to the people on it. Strangers see nothing, including whether it exists.</li>
        <li>
          Anyone with a trip's group link, signed in or not, can see the trip's name, dates and stops, the names
          of the people on it and whether they've joined, so they can pick their own, who started the trip, and
          its next three plans (what, which day and whether it's confirmed; never a cost, a place or notes). An
          Owner can turn the link off or make a new one at any time.
        </li>
        <li>Emails and phone numbers of the people on a trip are shown to its Owners only.</li>
        <li>Bookings forwarded to a trip's address, and who sent them, are shown to its Owners only.</li>
        <li>
          Your Venmo username and Zelle phone or email, if you add them, are shown to the people on your trips, so they
          can pay you. While your profile is locked, which it is unless you unlock it there, only you can change them or your phone
          number. Unlocked, an Owner of a trip you're on can add or fix them for that trip.</li>
        <li>
          What you like, from your profile's survey, is shown to nobody unless you set it to Shared with the group;
          then the people on your trips see it beside your name. Private or shared, Plan with AI is told how many
          people on the trip picked each thing ("3 of 4 like Italian"), never who, so its ideas fit the group, and
          only once at least 3 people on the trip have answered, so a count can't point at one person.
        </li>
        <li>Your votes on suggested plans are shown, with your name, to the people on that trip.</li>
        <li>A price you mark as your own (when everyone pays their own) is shown only to you.</li>
        <li>TripTab never sells your data, shows ads, or shares it with anyone beyond the services below.</li>
      </ul>
    ),
  },
  {
    title: "The services that run TripTab",
    body: (
      <ul>
        <li>
          <b>Supabase</b> stores accounts and trips and runs TripTab's server code.
        </li>
        <li>
          <b>Cloudflare</b> serves the site at triptab.org, and receives email sent to a trip's own address and hands
          it to TripTab.
        </li>
        <li>
          <b>Anthropic (Claude)</b> reads what you give the AI buttons, such as a pasted booking email, a PDF or a
          screenshot, along with the trip's name, dates, stops and plans (and, for Give me ideas, how many people on the trip picked
          each cuisine and activity on their profiles, with no names), and suggests plans back. It may search the
          web to check things like a flight's times. On Start a trip, "Set it up" sends it the description you typed
          and today's date, and nothing else. An email forwarded to a trip's address goes to it the same way. Nothing goes to it unless you tap one of
          these buttons or forward an email, and under
          Anthropic's terms for businesses it isn't used to train its models. Nothing is saved until you review it.
        </li>
        <li>
          <b>Resend</b> delivers TripTab's emails: the link to confirm your email, password resets, and invites an
          Owner sends. An invite carries the
          Owner's name, the trip's name, dates and stops, and the person's link.
        </li>
        <li>
          <b>PostHog</b> records how the app is used (the pages you open, taps, and events such as "trip created")
          and session replays of the screen, tied to an account number, never your email. Whatever you type into a
          field is hidden in replays, and so are the email addresses and phone numbers shown on a screen. It also
          gets a report when the app hits an error (what failed and where in the code), with emails, phone numbers
          and invite links taken out first.
        </li>
        <li>
          <b>Open-Meteo</b> suggests places as you type a trip's stops. It gets only what you've typed in that box,
          with no account or trip attached.
        </li>
        <li>
          <b>Photon</b>, komoot's search over OpenStreetMap, suggests addresses and places as you type a plan's Where.
          It gets only what you've typed in that box and the rough location of that day's stop, with no account or
          trip attached.
        </li>
        <li>
          <b>Frankfurter</b> gives the European Central Bank's daily exchange rate when an imported booking is priced in
          another currency, so TripTab can show it in dollars. It gets only the currency code (EUR, say), with no
          amount, account or trip attached.
        </li>
        <li>
          <b>Google Fonts</b> and <b>Unsplash</b> supply the type and the destination photos, so your browser asks
          them for those files.
        </li>
      </ul>
    ),
  },
  {
    title: "On your device",
    body: (
      <p>
        TripTab keeps you signed in with a token saved in your browser, and PostHog saves an id there to tell visits
        apart. A trip description you're writing on Start a trip is kept there too, so it isn't lost, until the trip
        is started. There are no advertising cookies.
      </p>
    ),
  },
  {
    title: "Deleting things",
    body: (
      <ul>
        <li>An Owner can delete a trip, which deletes its stops, plans, costs and people with it.</li>
        <li>
          To delete your account, or to get a copy of your data, email <a href={`mailto:${CONTACT}`}>{CONTACT}</a>{" "}
          from the address on your account. It's done within 30 days.
        </li>
      </ul>
    ),
  },
  {
    title: "Questions",
    body: (
      <p>
        TripTab is run by Mike Pezza, in New York. Write to <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. TripTab
        isn't meant for children under 13. If this page changes in a way that matters, it will say so here, with a
        new date.
      </p>
    ),
  },
];

export default function Privacy() {
  return (
    <div className="relative min-h-dvh">
      <PhotoFrame src={LANDING_PHOTO} tone="landing" />
      <div className="relative z-10">
        <TopBar back={{ to: "/", label: "Home" }} title="Privacy" subtitle={`Updated ${UPDATED}`} />
        <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
          <article className="glass-card-solid rounded-3xl !bg-[rgba(246,241,233,0.94)] p-6 text-foreground sm:p-10">
            <h1 className="mb-2 font-display text-3xl font-bold italic sm:text-4xl">How TripTab uses your data</h1>
            <p className="mb-8 text-base">
              TripTab plans group trips and keeps the tab. It keeps only what it needs to do that, and shows your trip
              to the people on it.
            </p>
            {SECTIONS.map((s) => (
              <section key={s.title} className="mb-7 last:mb-0">
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
