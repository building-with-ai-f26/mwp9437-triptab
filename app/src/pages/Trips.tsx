import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { CalendarDays, LogOut, MapPin, Plus, Users } from "lucide-react";
import { TopBar } from "../components/TopBar";
import { Button, ErrorNote, PhotoFrame, Spinner } from "../components/ui";
import { listMyTrips, type TripSummary } from "../lib/api";
import { useAuth } from "../lib/auth";
import { dateRange, ROLE_LABEL } from "../lib/model";
import { photoFor } from "../lib/photos";

const RESORT = photoFor("resort lisbon");

export default function Trips() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [trips, setTrips] = useState<TripSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listMyTrips()
      .then(setTrips)
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <div className="relative min-h-dvh">
      <PhotoFrame src={RESORT} />
      <div className="relative z-10">
        <TopBar back={{ to: "/", label: "Home" }} title={<span className="italic">My Trips</span>}>
          <Button variant="glass" size="sm" onClick={() => navigate("/trips/new")}>
            <Plus /> <span className="hidden sm:inline">New trip</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={signOut} aria-label="Sign out">
            <LogOut /> <span className="hidden sm:inline">Sign out</span>
          </Button>
        </TopBar>

        <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
          {error && <ErrorNote>{error}</ErrorNote>}
          {!trips && !error && <Spinner label="Loading trips" />}
          {trips && trips.length === 0 && (
            <div className="glass-card-solid mx-auto max-w-md rounded-3xl p-8 text-center">
              <h2 className="mb-2 font-display text-2xl font-bold italic">No trips yet</h2>
              <p className="mb-6 text-sm text-muted-foreground">
                Start one with its dates and stops, then pull the group in with one link.
              </p>
              <Button onClick={() => navigate("/trips/new")}>
                <Plus /> Start a trip
              </Button>
            </div>
          )}
          {trips && trips.length > 0 && (
            <ul className="grid gap-4 sm:grid-cols-2">
              {trips.map((t) => {
                const stops = [...t.stops].sort((a, b) => a.position - b.position).map((s) => s.name);
                const me = t.travelers.find((p) => p.user_id === user?.id);
                return (
                  <li key={t.id}>
                    <Link
                      to={`/trips/${t.id}`}
                      className="glass-card-solid block overflow-hidden rounded-2xl transition-shadow hover:shadow-xl"
                    >
                      <img src={photoFor(`${stops.join(" ")} ${t.name}`, 800)} alt="" className="h-28 w-full object-cover" />
                      <div className="p-5">
                        <div className="flex items-start justify-between gap-3">
                          <h2 className="font-display text-lg font-bold">{t.name}</h2>
                          {me && (
                            <span className="shrink-0 rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-medium text-gold-dark">
                              {ROLE_LABEL[me.role]}
                            </span>
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <CalendarDays className="size-3.5" /> {dateRange(t.start_date, t.end_date)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="size-3.5" /> {t.travelers.length} {t.travelers.length === 1 ? "person" : "people"}
                          </span>
                        </div>
                        {stops.length > 0 && (
                          <p className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
                            <MapPin className="size-3.5 shrink-0" /> <span className="truncate">{stops.join(", ")}</span>
                          </p>
                        )}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </main>
      </div>
    </div>
  );
}
