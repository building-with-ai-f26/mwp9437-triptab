import { useState } from "react";
import { Check, ExternalLink, MapPin, Wand2 } from "lucide-react";
import { mapsLink } from "../../lib/maps";
import { Button, DarkField, Dialog } from "../ui";
import { planWithAi, type PlanAiResult, type PlanIdea } from "../../lib/api";
import { dollars, longDay, PART_LABEL, PARTS, tripDays, type DayPart, type Trip } from "../../lib/model";

const MAX_REQUEST = 1000;

/**
 * Plan with AI (the vision's "ask for ideas for empty slots"): the Owner says what the group would
 * like, TripTab suggests real places for the trip's empty slots, each with the web page it was
 * found on, and the Owner keeps or drops each, and can move each to another day or part of the day
 * first (the 11/17 pod test). Kept ideas are added as Suggested; nothing on the trip is moved or
 * replaced.
 */
export function PlanWithAiDialog({
  open,
  trip,
  initialRequest,
  onClose,
  onSave,
  onDone,
  onPark,
}: {
  open: boolean;
  trip: Trip;
  /** Ask AI from an empty slot (T9): the request starts with that slot. */
  initialRequest?: string;
  onClose: () => void;
  /** How many unsaved ideas wait in the shut dialog (0 once they're added or discarded). */
  onPark?: (waiting: number) => void;
  /** Adds the kept ideas as Suggested plans; returns once they're on the trip. */
  onSave: (kept: PlanIdea[]) => Promise<void>;
  /** Called when a review ends, saved or not, for the usage log. */
  onDone: (result: PlanAiResult, kept: number) => void;
}) {
  const [request, setRequest] = useState(initialRequest ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PlanAiResult | null>(null);
  const [keep, setKeep] = useState<boolean[]>([]);
  // Where each idea goes: the AI's pick to start with, changeable before adding.
  const [picks, setPicks] = useState<{ day: string; part: DayPart }[]>([]);
  const days = tripDays(trip.start_date, trip.end_date);

  const reset = () => {
    setRequest("");
    setResult(null);
    setKeep([]);
    setPicks([]);
    setError(null);
    setBusy(false);
  };
  /** Discard: the ideas go, on purpose. */
  const close = () => {
    if (result) onDone(result, 0);
    reset();
    onPark?.(0);
    onClose();
  };
  /**
   * The X, Escape or a tap outside with ideas still unsaved: they're kept, not lost (11/23 review,
   * item 9). The dialog shuts with its review as it stands, and the trip offers it back.
   */
  const shut = () => {
    if (busy) return;
    if (!result || ideas.length === 0 || !onPark) return close();
    onPark(ideas.length);
    onClose();
  };

  const ask = async () => {
    setError(null);
    if (request.length > MAX_REQUEST) return setError(`Keep it under ${MAX_REQUEST.toLocaleString("en-US")} characters.`);
    setBusy(true);
    try {
      const r = await planWithAi(trip.id, request.trim());
      setResult(r);
      setKeep(r.suggestions.map(() => true));
      setPicks(r.suggestions.map((s) => ({ day: s.day, part: s.part })));
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };

  const ideas = result?.suggestions ?? [];
  const kept = ideas.map((idea, i) => ({ ...idea, ...(picks[i] ?? {}) })).filter((_, i) => keep[i]);
  const pick = (i: number, change: Partial<{ day: string; part: DayPart }>) =>
    setPicks((all) => all.map((p, j) => (j === i ? { ...p, ...change } : p)));
  const save = async () => {
    if (!result || kept.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await onSave(kept);
      onDone(result, kept.length);
      reset();
      onPark?.(0);
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={shut} title={result ? "Ideas for your empty slots" : "Plan with AI"}>
      {open && !result && (
        <div>
          <p className="mb-3 text-sm text-white/80">
            TripTab looks up real places for the slots that are still empty, and nothing is added until you pick. Ideas come in as
            Suggested, so the group can decide; nothing already on the trip changes.
          </p>
          <DarkField label="What would the group like? (optional)">
            <textarea
              className="field-dark min-h-[110px] resize-y"
              value={request}
              onChange={(e) => setRequest(e.target.value)}
              placeholder={'"A nice dinner in Chamonix, and something for the non-skiers on Sunday"'}
              autoFocus
            />
          </DarkField>
          <p className="mb-3 text-xs text-white/70">Uses Claude with a few web searches; it costs TripTab a few cents and is logged.</p>
          {error && (
            <p role="alert" className="mb-3 rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-200">
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="light" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={ask} disabled={busy}>
              <Wand2 /> {busy ? "Looking things up..." : "Find ideas"}
            </Button>
          </div>
        </div>
      )}

      {open && result && (
        <div>
          <p className="mb-3 text-sm text-white/85" data-testid="plan-ai-summary">
            {ideas.length === 0
              ? "No ideas this time."
              : `${ideas.length} ${ideas.length === 1 ? "idea" : "ideas"} for empty slots. Untick any you don't want, or move one to another day; kept ones are added as Suggested.`}
            {result.note ? ` ${result.note}` : ""}
          </p>
          <ul className="space-y-3">
            {ideas.map((idea, i) => (
              <li
                key={i}
                className={`rounded-2xl border p-3 ${keep[i] ? "border-white/20 bg-white/5" : "border-white/10 opacity-70"}`}
                data-testid="plan-idea"
              >
                <label className="flex items-start gap-2.5 text-sm text-white">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-5 shrink-0 accent-[#8c7054]"
                    checked={keep[i] ?? false}
                    onChange={(e) => setKeep((all) => all.map((k, j) => (j === i ? e.target.checked : k)))}
                    aria-label={`Keep ${idea.title}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{idea.title}</span>
                    {idea.est_cents != null && <span className="block text-xs text-white/80">About {dollars(idea.est_cents)} a person</span>}
                    {idea.why && <span className="mt-1 block text-xs text-white/85">{idea.why}</span>}
                    {/* T12: the place on Google Maps first; where it was found stays as its source. */}
                    <a
                      href={mapsLink(idea.title, idea.location)}
                      target="_blank"
                      rel="noreferrer"
                      data-testid="maps-link"
                      className="mt-1 flex max-w-full items-center gap-1 text-sm font-semibold text-white underline underline-offset-2"
                    >
                      <MapPin className="size-3.5 shrink-0" />
                      <span className="truncate">Open in Google Maps</span>
                    </a>
                    <a
                      href={idea.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-0.5 inline-flex max-w-full items-center gap-1 text-xs text-amber-200 underline underline-offset-2"
                    >
                      <ExternalLink className="size-3 shrink-0" />
                      <span className="truncate">Found on {hostOf(idea.source_url)}</span>
                    </a>
                  </span>
                </label>
                {keep[i] && picks[i] && (
                  <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2 pl-7">
                    <select
                      className="field-dark !h-10 !py-0 text-sm"
                      aria-label={`Day for ${idea.title}`}
                      value={picks[i].day}
                      onChange={(e) => pick(i, { day: e.target.value })}
                    >
                      {days.map((d) => (
                        <option key={d} value={d}>
                          {longDay(d)}
                        </option>
                      ))}
                    </select>
                    <select
                      className="field-dark !h-10 !py-0 text-sm"
                      aria-label={`Part of the day for ${idea.title}`}
                      value={picks[i].part}
                      onChange={(e) => pick(i, { part: e.target.value as DayPart })}
                    >
                      {PARTS.map((p) => (
                        <option key={p} value={p}>
                          {PART_LABEL[p]}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {/* The AI cost is logged (ai_calls) but never shown: people would read it as a charge (Mike's 11/19 review). */}
          {error && (
            <p role="alert" className="mt-2 rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-200">
              {error}
            </p>
          )}
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <Button variant="light" onClick={close} disabled={busy}>
              {ideas.length ? "Discard" : "Close"}
            </Button>
            {ideas.length > 0 && (
              <Button onClick={save} disabled={busy || kept.length === 0}>
                <Check /> {busy ? "Adding..." : `Add ${kept.length} as Suggested`}
              </Button>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
