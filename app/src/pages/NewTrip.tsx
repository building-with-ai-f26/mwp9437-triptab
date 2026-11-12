import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { MapPin, Plus, Trash2 } from "lucide-react";
import { TopBar } from "../components/TopBar";
import { Button, ErrorNote, Field, PhotoFrame } from "../components/ui";
import { createTrip } from "../lib/api";
import { nameOf, useAuth } from "../lib/auth";
import { dateRange, nightsBetween, tripSpan, validateTrip, type StopDraft } from "../lib/model";
import { photoFor } from "../lib/photos";
import { track } from "../lib/analytics";

const blankStop = (start = ""): StopDraft => ({ name: "", start_date: start, end_date: "" });

/** The vision's example trip, one tap away for demos and pod tests. */
const SKI_EXAMPLE = {
  name: "Euro ski trip",
  stops: [
    { name: "Chamonix", start_date: "2027-02-05", end_date: "2027-02-12" },
    { name: "Barcelona", start_date: "2027-02-12", end_date: "2027-02-13" },
    { name: "Andorra", start_date: "2027-02-13", end_date: "2027-02-16" },
  ],
};

export default function NewTrip() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [stops, setStops] = useState<StopDraft[]>([blankStop()]);
  const [myName, setMyName] = useState(nameOf(user));
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const problems = validateTrip(name, stops);
  const dated = stops.filter((s) => s.start_date && s.end_date && s.end_date >= s.start_date);
  const span = dated.length ? tripSpan(dated) : null;

  const setStop = (i: number, patch: Partial<StopDraft>) =>
    setStops((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (problems.length) return;
    setBusy(true);
    setError(null);
    try {
      const id = await createTrip(name, stops, myName || nameOf(user));
      track("trip created", { stops: stops.length, days: span ? nightsBetween(span.start, span.end) + 1 : 0 });
      navigate(`/trips/${id}`, { replace: true });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="relative min-h-dvh">
      <PhotoFrame src={photoFor(`${stops.map((s) => s.name).join(" ")} ${name}`)} />
      <div className="relative z-10">
        <TopBar back={{ to: "/trips", label: "My trips" }} title={<span className="italic">Start a trip</span>} />
        <main className="mx-auto max-w-xl px-4 py-6 sm:py-10">
          <form onSubmit={submit} className="glass-card-solid rounded-3xl p-5 sm:p-7" noValidate>
            <h2 className="mb-1 font-display text-2xl font-bold italic">Where's the group going?</h2>
            <p className="mb-6 text-sm text-muted-foreground">
              Dates and stops now; plans, people and costs go in from the trip.{" "}
              <button
                type="button"
                className="font-medium text-gold-dark underline-offset-4 hover:underline"
                onClick={() => {
                  setName(SKI_EXAMPLE.name);
                  setStops(SKI_EXAMPLE.stops);
                }}
              >
                Fill in the ski trip example
              </button>
            </p>

            <Field label="Trip name">
              <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Euro ski trip" />
            </Field>

            <fieldset className="mb-4">
              <legend className="label-luxury mb-2 text-muted-foreground">Stops</legend>
              <ol className="space-y-3">
                {stops.map((s, i) => (
                  <li key={i} className="rounded-2xl border border-white/40 bg-white/20 p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <MapPin className="size-4 shrink-0 text-primary" />
                      <input
                        className="field"
                        aria-label={`Stop ${i + 1} place`}
                        value={s.name}
                        onChange={(e) => setStop(i, { name: e.target.value })}
                        placeholder={i === 0 ? "Chamonix" : "Next stop"}
                      />
                      {stops.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setStops((prev) => prev.filter((_, j) => j !== i))}
                          className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          aria-label={`Remove stop ${i + 1}`}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <label>
                        <span className="label-luxury mb-1 block text-muted-foreground">From</span>
                        <input
                          className="field"
                          type="date"
                          value={s.start_date}
                          onChange={(e) => setStop(i, { start_date: e.target.value })}
                        />
                      </label>
                      <label>
                        <span className="label-luxury mb-1 block text-muted-foreground">To</span>
                        <input
                          className="field"
                          type="date"
                          value={s.end_date}
                          min={s.start_date || undefined}
                          onChange={(e) => setStop(i, { end_date: e.target.value })}
                        />
                      </label>
                    </div>
                  </li>
                ))}
              </ol>
              <Button
                type="button"
                variant="glass"
                size="sm"
                className="mt-3"
                onClick={() => setStops((prev) => [...prev, blankStop(prev[prev.length - 1]?.end_date || "")])}
              >
                <Plus /> Add a stop
              </Button>
            </fieldset>

            <Field label="Your name on the trip">
              <input className="field" value={myName} onChange={(e) => setMyName(e.target.value)} autoComplete="name" />
            </Field>

            {span && (
              <p className="mb-4 text-sm text-muted-foreground">
                {nightsBetween(span.start, span.end) + 1} days: {dateRange(span.start, span.end)}.
              </p>
            )}
            {tried && problems.length > 0 && (
              <ErrorNote>
                {problems.map((p) => (
                  <span key={p} className="block">
                    {p}
                  </span>
                ))}
              </ErrorNote>
            )}
            {error && <ErrorNote>{error}</ErrorNote>}

            <Button type="submit" size="lg" className="mt-4 w-full" disabled={busy}>
              {busy ? "Starting the trip..." : "Start the trip"}
            </Button>
          </form>
        </main>
      </div>
    </div>
  );
}
