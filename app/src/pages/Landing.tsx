import { Link, useNavigate } from "react-router";
import { ArrowDown, ArrowRight, Users, Sparkles, Scale } from "lucide-react";
import { Brand } from "../components/Brand";
import { Button, PhotoFrame } from "../components/ui";
import { LANDING_PHOTO } from "../lib/photos";
import { useAuth } from "../lib/auth";
import { track } from "../lib/analytics";

/**
 * The three things TripTab does, each with a real screen of the app (the ski trip example, shot by
 * e2e/landing-shots.cjs). On the first live week 44 people saw this page and none clicked through;
 * two phone visitors tapped these cards, which looked like buttons and did nothing (11/23 review,
 * item 8). Now a card takes you to its screen, and the page shows the product before asking for an
 * account.
 */
const POINTS = [
  {
    id: "invite",
    icon: Users,
    title: "Everyone's on it",
    text: "Add friends by name or drop one link in the group chat. They're on the trip right away.",
    shot: "/landing/invite.jpg",
    alt: "The invite a friend opens: the trip, and their name to tap.",
    step: "Drop one link in the group chat",
    more: "Each friend taps their name and they're in. No app to install, and nobody fills in a form to see the plan.",
  },
  {
    id: "plans",
    icon: Sparkles,
    title: "A plan and its cost are one thing",
    text: "Suggested, then planned, then confirmed with who paid and who's in.",
    shot: "/landing/plans.jpg",
    alt: "A trip's day in TripTab: a flight, a dinner marked paid with your share, and an idea still to decide.",
    step: "Plan the days together",
    more: "Each day runs morning to night. Ideas are dotted, plans are solid, and a green check means it's booked and paid. Forward a booking email and TripTab reads it into a plan for you to check.",
  },
  {
    id: "settle",
    icon: Scale,
    title: "The tab settles itself",
    text: "The fewest payments to square everyone up, current all trip long.",
    shot: "/landing/settle.jpg",
    alt: "Settle up: three payments that square the whole group, the first with Pay with Venmo.",
    step: "Settle up in a couple of taps",
    more: "TripTab works out the fewest payments that square everyone, and opens Venmo with the amount filled in. It never touches your money.",
  },
] as const;

/** Straight to the trip: one button, no "already planned or plan it for me" gate (vision, principle 1). */
export default function Landing() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const start = () => navigate(user ? "/trips/new" : "/sign-in?next=/trips/new");
  const show = (id: string, from: "card" | "see how") => {
    track("landing section opened", { section: id, from });
    document.getElementById(`how-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="relative">
      <PhotoFrame src={LANDING_PHOTO} tone="landing" />
      {/* The first screen: the photo, the pitch and the button. How it works starts below it. */}
      <div className="relative flex min-h-dvh flex-col">
      <header className="relative z-10 flex items-center justify-between px-4 py-4 sm:px-6 sm:py-5">
        <Brand light />
        {user ? (
          <Button variant="dark" size="sm" onClick={() => navigate("/trips")}>
            My trips
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <Button variant="light" size="sm" className="!border-white/40 !bg-black/30 font-semibold" onClick={() => navigate("/sign-in?mode=sign-in")}>
              Sign in
            </Button>
            <Button variant="dark" size="sm" onClick={() => navigate("/sign-in")}>
              Create account
            </Button>
          </div>
        )}
      </header>

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 py-8 text-center">
        <h1 className="mb-3 font-display text-4xl font-bold italic leading-tight text-white drop-shadow-lg sm:text-5xl md:text-6xl">
          Plan it. Split it. <br className="sm:hidden" />
          Live it.
        </h1>
        <p className="mx-auto mb-8 max-w-lg text-base text-white drop-shadow sm:text-lg">
          One place for the group's plans and who paid what, before, during and after the trip.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" onClick={() => (track("landing start", { where: "top" }), start())}>
            Start a trip <ArrowRight />
          </Button>
          <Button size="lg" variant="light" className="!border-white/40 !bg-black/30 font-semibold" onClick={() => show("invite", "see how")}>
            See how it works
          </Button>
        </div>
        <p className="mt-3 text-sm text-white drop-shadow">Nothing to install. Friends join from one link.</p>
        {user ? (
          <Link to="/trips" className="mt-4 text-sm font-medium text-white drop-shadow hover:underline">
            Open my trips
          </Link>
        ) : (
          <p className="mt-4 text-sm text-white drop-shadow">
            Already have an account?{" "}
            <Link to="/sign-in?mode=sign-in" className="font-semibold underline underline-offset-4">
              Sign in
            </Link>
          </p>
        )}

        <ul className="mt-12 grid w-full max-w-3xl grid-cols-1 gap-3 text-left sm:grid-cols-3 sm:gap-4">
          {POINTS.map(({ id, icon: Icon, title, text }) => (
            <li key={id}>
              <button
                type="button"
                onClick={() => show(id, "card")}
                className="glass-card h-full w-full rounded-2xl !bg-black/45 p-4 text-left transition-colors hover:!bg-black/60 sm:p-5"
              >
                <span className="mb-3 grid size-10 place-items-center rounded-xl bg-white/20">
                  <Icon className="size-5 text-white" />
                </span>
                <span className="mb-1 block font-display text-base font-bold text-white drop-shadow">{title}</span>
                <span className="block text-sm leading-relaxed text-white">{text}</span>
                <span className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-white underline underline-offset-4">
                  See it <ArrowDown className="size-3.5" />
                </span>
              </button>
            </li>
          ))}
        </ul>
      </main>
      </div>

      <section className="relative z-10 bg-background px-4 py-12 sm:px-6 sm:py-16" aria-labelledby="how-title">
        <h2 id="how-title" className="mb-10 text-center font-display text-3xl font-bold italic text-foreground sm:text-4xl">
          How it works
        </h2>
        <ol className="mx-auto max-w-4xl space-y-12 sm:space-y-16">
          {POINTS.map(({ id, shot, alt, step, more }, i) => (
            <li key={id} id={`how-${id}`} className={`flex scroll-mt-6 flex-col items-center gap-6 sm:flex-row sm:gap-12 ${i % 2 ? "sm:flex-row-reverse" : ""}`}>
              <img
                src={shot}
                alt={alt}
                width={390}
                height={700}
                loading="lazy"
                className="h-auto w-64 shrink-0 rounded-[2rem] border-4 border-foreground/90 shadow-2xl sm:w-72"
              />
              <div className="max-w-md text-center sm:text-left">
                <p className="label-luxury mb-2 text-gold-dark">Step {i + 1}</p>
                <h3 className="mb-2 font-display text-2xl font-bold text-foreground">{step}</h3>
                <p className="text-base leading-relaxed text-foreground/80">{more}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-12 text-center">
          <Button size="lg" onClick={() => (track("landing start", { where: "bottom" }), start())}>
            Start a trip <ArrowRight />
          </Button>
          <p className="mt-3 text-sm text-foreground/75">It takes about a minute. Your friends don't need an account to see the invite.</p>
        </div>
      </section>
      <footer className="relative z-10 bg-background px-4 pb-6 text-center text-xs text-foreground/80">
        <Link to="/privacy" className="font-medium underline underline-offset-4">
          Privacy
        </Link>
      </footer>
    </div>
  );
}
