import { Link, useNavigate } from "react-router";
import { ArrowRight, Users, Sparkles, Scale } from "lucide-react";
import { Brand } from "../components/Brand";
import { Button, PhotoFrame } from "../components/ui";
import { LANDING_PHOTO } from "../lib/photos";
import { useAuth } from "../lib/auth";

const POINTS = [
  { icon: Users, title: "Everyone's on it", text: "Add friends by name or drop one link in the group chat. They're on the trip right away." },
  { icon: Sparkles, title: "A plan and its cost are one thing", text: "Suggested, then planned, then confirmed with who paid and who's in." },
  { icon: Scale, title: "The tab settles itself", text: "The fewest payments to square everyone up, current all trip long." },
];

/** Straight to the trip: one button, no "already planned or plan it for me" gate (vision, principle 1). */
export default function Landing() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const start = () => navigate(user ? "/trips/new" : "/sign-in?next=/trips/new");

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden">
      <PhotoFrame src={LANDING_PHOTO} tone="landing" />
      <header className="relative z-10 flex items-center justify-between px-4 py-4 sm:px-6 sm:py-5">
        <Brand light />
        {user ? (
          <Button variant="dark" size="sm" onClick={() => navigate("/trips")}>
            My trips
          </Button>
        ) : (
          <Button variant="dark" size="sm" onClick={() => navigate("/sign-in")}>
            Sign in
          </Button>
        )}
      </header>

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 py-8 text-center">
        <h1 className="mb-3 font-display text-4xl font-bold italic leading-tight text-white drop-shadow-lg sm:text-5xl md:text-6xl">
          Plan it. Split it. <br className="sm:hidden" />
          Live it.
        </h1>
        <p className="mx-auto mb-8 max-w-lg text-base text-white/90 drop-shadow sm:text-lg">
          One place for the group's plans and who paid what, before, during and after the trip.
        </p>
        <Button size="lg" onClick={start}>
          Start a trip <ArrowRight />
        </Button>
        {user && (
          <Link to="/trips" className="mt-4 text-sm font-medium text-white drop-shadow hover:underline">
            Open my trips
          </Link>
        )}

        <ul className="mt-12 grid w-full max-w-3xl grid-cols-1 gap-3 text-left sm:grid-cols-3 sm:gap-4">
          {POINTS.map(({ icon: Icon, title, text }) => (
            <li key={title} className="glass-card rounded-2xl p-4 sm:p-5">
              <span className="mb-3 grid size-10 place-items-center rounded-xl bg-white/20">
                <Icon className="size-5 text-white" />
              </span>
              <h2 className="mb-1 font-display text-base font-bold text-white drop-shadow">{title}</h2>
              <p className="text-sm leading-relaxed text-white/85">{text}</p>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
