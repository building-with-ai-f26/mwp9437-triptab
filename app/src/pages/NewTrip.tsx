import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { MapPin, Plus, Sparkles, Trash2 } from "lucide-react";
import { TopBar } from "../components/TopBar";
import { Button, ErrorNote, Field, PhotoFrame, Segmented } from "../components/ui";
import { PlaceInput } from "../components/PlaceInput";
import { createTrip, describedKey, describeTrip, type DescribeResult } from "../lib/api";
import { nameOf, useAuth } from "../lib/auth";
import { dateRange, nightsBetween, tripSpan, validateTrip, type StopDraft } from "../lib/model";
import { photoFor } from "../lib/photos";
import { track } from "../lib/analytics";

const blankStop = (start = ""): StopDraft => ({ name: "", start_date: start, end_date: "" });

/** What you typed in Describe it, kept on this device before any AI call, so nothing is lost. */
const DRAFT = "triptab.describe_draft";
const MAX_DESCRIBE = 5000;
const readDraft = () => {
  try {
    return localStorage.getItem(DRAFT) ?? "";
  } catch {
    return "";
  }
};
const writeDraft = (text: string) => {
  try {
    if (text) localStorage.setItem(DRAFT, text);
    else localStorage.removeItem(DRAFT);
  } catch {
    // storage can be unavailable; the text stays in the box
  }
};


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
  // The photo follows places you've picked or finished typing, not every keystroke (11/17 pod).
  const [photoText, setPhotoText] = useState("");
  // Describe your trip (the 11/17 pod notes): type, paste or dictate what's planned; AI fills the form.
  const [mode, setMode] = useState<"form" | "describe">("form");
  const [describeText, setDescribeText] = useState(readDraft);
  const [describing, setDescribing] = useState(false);
  const [describeError, setDescribeError] = useState<string | null>(null);
  const [described, setDescribed] = useState<DescribeResult | null>(null);
  const showPhotoFor = (tripName: string, list: StopDraft[]) => setPhotoText(`${list.map((s) => s.name).join(" ")} ${tripName}`.trim());

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
      track("trip created", { stops: stops.length, days: span ? nightsBetween(span.start, span.end) + 1 : 0, via: described ? "description" : "form" });
      if (described) {
        try {
          sessionStorage.setItem(describedKey(id), JSON.stringify(described));
        } catch {
          // storage can be unavailable; the trip is made, the plans can be imported by hand
        }
        writeDraft("");
      }
      navigate(`/trips/${id}`, { replace: true });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const describe = async () => {
    setDescribeError(null);
    const text = describeText.trim();
    if (!text) return setDescribeError("Say where you're going and when, and anything already booked.");
    if (text.length > MAX_DESCRIBE) return setDescribeError(`Keep it under ${MAX_DESCRIBE.toLocaleString("en-US")} characters.`);
    writeDraft(describeText);
    setDescribing(true);
    try {
      const r = await describeTrip(text);
      const next = r.trip.stops.map((s) => ({ name: s.name, start_date: s.start_date, end_date: s.end_date }));
      setName(r.trip.name);
      setStops(next);
      showPhotoFor(r.trip.name, next);
      setDescribed(r);
      setMode("form");
      track("trip described", { stops: next.length, plans: r.plans.length, questions: r.questions.length, cost_usd: r.usage.cost_usd, latency_ms: r.usage.latency_ms });
    } catch (e) {
      setDescribeError((e as Error).message);
    }
    setDescribing(false);
  };

  return (
    <div className="relative min-h-dvh">
      <PhotoFrame src={photoFor(photoText)} />
      <div className="relative z-10">
        <TopBar back={{ to: "/trips", label: "My trips" }} title={<span className="italic">Start a trip</span>} />
        <main className="mx-auto max-w-xl px-4 py-6 sm:py-10">
          <form onSubmit={submit} className="glass-card-solid rounded-3xl p-5 sm:p-7" noValidate>
            <h2 className="mb-1 font-display text-2xl font-bold italic">Where's the group going?</h2>
            <p className="mb-6 text-sm text-muted-foreground">
              Dates and stops now; plans, people and costs go in from the trip.{" "}
              <button
                type="button"
                className="font-semibold text-foreground underline underline-offset-4"
                onClick={() => {
                  setName(SKI_EXAMPLE.name);
                  setStops(SKI_EXAMPLE.stops);
                  showPhotoFor(SKI_EXAMPLE.name, SKI_EXAMPLE.stops);
                }}
              >
                Fill in the ski trip example
              </button>
            </p>

            <div className="mb-5">
              <Segmented
                dark={false}
                label="How to start"
                value={mode}
                onChange={setMode}
                options={[
                  { value: "form", label: "Fill it in" },
                  { value: "describe", label: "Describe it" },
                ]}
              />
            </div>

            {mode === "describe" && (
              <div>
                <Field label="What's planned so far?" hint="Type, paste or dictate (your phone's mic key works). Dates, places, and anything booked. Nothing is saved until you check it.">
                  <textarea
                    className="field min-h-[160px] resize-y"
                    value={describeText}
                    onChange={(e) => {
                      setDescribeText(e.target.value);
                      writeDraft(e.target.value);
                    }}
                    placeholder={'"Chamonix Feb 5 to 12, then Andorra till the 16th. Skiing every day in Chamonix, a dinner reservation Thursday, flights and the Airbnb are booked."'}
                    maxLength={MAX_DESCRIBE + 500}
                  />
                </Field>
                {describeError && <ErrorNote>{describeError}</ErrorNote>}
                <Button type="button" size="lg" className="mt-2 w-full" onClick={describe} disabled={describing}>
                  <Sparkles /> {describing ? "Setting it up..." : "Set it up"}
                </Button>
                <p className="mt-2 text-center text-xs text-muted-foreground">Uses Claude; it costs TripTab about a tenth of a cent and is logged.</p>
              </div>
            )}

            {mode === "form" && described && (
              <div role="status" className="mb-5 rounded-2xl border border-primary/30 bg-white/40 px-4 py-3 text-sm" data-testid="described-note">
                <p className="font-semibold">From your description</p>
                <p className="text-foreground/80">
                  Check the name, dates and stops below, then start the trip.
                  {described.plans.length > 0 &&
                    ` Next you'll review ${described.plans.length} ${described.plans.length === 1 ? "plan" : "plans"} it found`}
                  {described.questions.length > 0 &&
                    `${described.plans.length > 0 ? "," : " Next,"} and ${described.questions.length} ${described.questions.length === 1 ? "question" : "questions"} for what's missing become to-dos for you`}
                  {described.plans.length > 0 || described.questions.length > 0 ? "." : ""}
                </p>
                <button
                  type="button"
                  className="mt-1 text-xs font-semibold underline underline-offset-4"
                  onClick={() => {
                    setDescribed(null);
                    setMode("describe");
                  }}
                >
                  Change the description
                </button>
              </div>
            )}

            {mode === "form" && (
              <>

            <Field label="Trip name">
              <input
                className="field"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => showPhotoFor(name, stops)}
                placeholder="Euro ski trip"
              />
            </Field>

            <fieldset className="mb-4">
              <legend className="label-luxury mb-2 text-muted-foreground">Stops</legend>
              <ol className="space-y-3">
                {stops.map((s, i) => (
                  <li key={i} className="rounded-2xl border border-white/40 bg-white/20 p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <MapPin className="size-4 shrink-0 text-primary" />
                      <PlaceInput
                        label={`Stop ${i + 1} place`}
                        value={s.name}
                        onChange={(text) => setStop(i, { name: text })}
                        onPick={(place) => {
                          const next = stops.map((x, j) => (j === i ? { ...x, name: place.name } : x));
                          setStops(next);
                          showPhotoFor(name, next);
                        }}
                        onCommit={() => showPhotoFor(name, stops)}
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
              </>
            )}
          </form>
        </main>
      </div>
    </div>
  );
}
