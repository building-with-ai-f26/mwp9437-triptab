import { useState } from "react";
import { Check, ExternalLink, Wand2 } from "lucide-react";
import { Button, DarkField, Dialog } from "../ui";
import { planWithAi, type PlanAiResult, type PlanIdea } from "../../lib/api";
import { usdCost } from "../../lib/importPlans";
import { dollars, longDay, PART_LABEL, type Trip } from "../../lib/model";

const MAX_REQUEST = 1000;

/**
 * Plan with AI (the vision's "ask for ideas for empty slots"): the Owner says what the group would
 * like, TripTab suggests real places for the trip's empty slots, each with the web page it was
 * found on, and the Owner keeps or drops each. Kept ideas are added as Suggested; nothing on the
 * trip is moved or replaced.
 */
export function PlanWithAiDialog({
  open,
  trip,
  onClose,
  onSave,
  onDone,
}: {
  open: boolean;
  trip: Trip;
  onClose: () => void;
  /** Adds the kept ideas as Suggested plans; returns once they're on the trip. */
  onSave: (kept: PlanIdea[]) => Promise<void>;
  /** Called when a review ends, saved or not, for the usage log. */
  onDone: (result: PlanAiResult, kept: number) => void;
}) {
  const [request, setRequest] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PlanAiResult | null>(null);
  const [keep, setKeep] = useState<boolean[]>([]);

  const reset = () => {
    setRequest("");
    setResult(null);
    setKeep([]);
    setError(null);
    setBusy(false);
  };
  const close = () => {
    if (result) onDone(result, 0);
    reset();
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
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };

  const ideas = result?.suggestions ?? [];
  const kept = ideas.filter((_, i) => keep[i]);
  const save = async () => {
    if (!result || kept.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await onSave(kept);
      onDone(result, kept.length);
      reset();
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={close} title={result ? "Ideas for your empty slots" : "Plan with AI"}>
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
              : `${ideas.length} ${ideas.length === 1 ? "idea" : "ideas"} for empty slots. Untick any you don't want; kept ones are added as Suggested.`}
            {result.note ? ` ${result.note}` : ""}
          </p>
          <ul className="space-y-3">
            {ideas.map((idea, i) => (
              <li
                key={`${idea.day}-${idea.part}`}
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
                    <span className="block text-xs text-white/80">
                      {longDay(idea.day)}, {PART_LABEL[idea.part].toLowerCase()}
                      {idea.est_cents != null ? ` · about ${dollars(idea.est_cents)} a person` : ""}
                    </span>
                    {idea.why && <span className="mt-1 block text-xs text-white/85">{idea.why}</span>}
                    <a
                      href={idea.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex max-w-full items-center gap-1 text-xs text-amber-200 underline underline-offset-2"
                    >
                      <ExternalLink className="size-3 shrink-0" />
                      <span className="truncate">Found on {hostOf(idea.source_url)}</span>
                    </a>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-white/70" data-testid="plan-ai-cost">
            This cost {usdCost(result.usage.cost_usd)} at list price
            {result.usage.searches ? `, with ${result.usage.searches} web ${result.usage.searches === 1 ? "search" : "searches"}` : ""}.
          </p>
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
