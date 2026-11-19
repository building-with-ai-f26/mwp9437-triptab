import { useRef, useState } from "react";
import { AlertTriangle, CalendarPlus, Check, ExternalLink, FileUp, Sparkles } from "lucide-react";
import { Button, DarkField, Dialog } from "../ui";
import { importBookings } from "../../lib/api";
import { draftProblems, toDraft, usdCost, type Draft, type ImportResult } from "../../lib/importPlans";
import { addDays, KIND_LABEL, longDay, PART_LABEL, PARTS, PAY_MODE_LABEL, tripDays, widenTrip, type Item, type ItemKind, type PayMode, type Trip } from "../../lib/model";

const KINDS: ItemKind[] = ["activity", "meal", "transport", "flight", "stay"];
const FILE_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_FILE_BYTES = 3_000_000;
const MAX_TEXT = 20_000;

/** Reads a picked file as base64 (without the data: prefix). */
const readFile = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.readAsDataURL(file);
  });

/**
 * Import bookings with AI (vision, "Import, first"). An Owner pastes a confirmation, a receipt,
 * flight numbers or a summary, or attaches a PDF or photo. TripTab proposes plans from it, and
 * nothing is saved until the Owner has reviewed them: edit, untick or keep each one.
 */
export function ImportDialog({
  open,
  trip,
  items,
  onClose,
  onSave,
  onDone,
  onExtend,
  initial = null,
  heading,
  questions = [],
  onQuestions,
}: {
  open: boolean;
  trip: Trip;
  items: Item[];
  onClose: () => void;
  /** Saves the kept plans; returns once they're on the trip. */
  onSave: (kept: Draft[]) => Promise<void>;
  /** Called when a review ends, saved or not, for the usage log. */
  onDone: (result: ImportResult, kept: number) => void;
  /** Stretches the trip to include a day just outside it; returns once the trip is reloaded. */
  onExtend?: (day: string) => Promise<void>;
  /**
   * Plans already read (from describing the trip when starting it): the dialog opens straight on
   * the review, with the same keep, edit and drop as an import. Mount a fresh dialog for them.
   */
  initial?: ImportResult | null;
  /** The review's title, in place of "Review what was found". */
  heading?: string;
  /**
   * Follow-up questions about what a description left out (Mike's 11/18 call, C11): optional. The
   * Owner can fill the details in on the plans below, or leave a question ticked and it waits on
   * their To do list. Every question starts ticked.
   */
  questions?: string[];
  /** Called once when the review ends, saved or not, with the questions left ticked. */
  onQuestions?: (parked: string[]) => void;
}) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(initial);
  const [drafts, setDrafts] = useState<Draft[]>(() => (initial ? initial.plans.map((p) => toDraft(p, trip, items)) : []));
  const [tried, setTried] = useState(false);
  const [park, setPark] = useState<boolean[]>(() => questions.map(() => true));
  const answered = useRef(false);
  /** Hands back the questions left ticked, once, however the review ends. */
  const settleQuestions = () => {
    if (answered.current || !onQuestions || questions.length === 0) return;
    answered.current = true;
    onQuestions(questions.filter((_, i) => park[i]));
  };

  const reset = () => {
    setText("");
    setFile(null);
    setResult(null);
    setDrafts([]);
    setError(null);
    setTried(false);
    setBusy(false);
  };
  const close = () => {
    if (result) onDone(result, 0);
    settleQuestions();
    reset();
    onClose();
  };

  const read = async () => {
    setError(null);
    if (!text.trim() && !file) return setError("Paste something or attach a file first.");
    if (text.length > MAX_TEXT) return setError(`That's over ${MAX_TEXT.toLocaleString("en-US")} characters. Import it in parts.`);
    if (file && !FILE_TYPES.includes(file.type)) return setError("Attach a PDF, or a photo or screenshot (PNG, JPEG, WebP or GIF).");
    if (file && file.size > MAX_FILE_BYTES) return setError("That file is over 3 MB. Try a screenshot of the part that matters.");
    setBusy(true);
    try {
      const attached = file ? { media_type: file.type, data: await readFile(file) } : null;
      const r = await importBookings(trip.id, text, attached);
      setResult(r);
      setDrafts(r.plans.map((p) => toDraft(p, trip, items)));
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };

  // One tap adds the day to the trip; every proposal that now fits is re-read against the longer
  // trip and ticked, keeping what the Owner already typed.
  const extend = async (day: string) => {
    if (!onExtend) return;
    setBusy(true);
    setError(null);
    try {
      await onExtend(day);
      const longer = widenTrip(trip, day);
      setDrafts((all) =>
        all.map((d) => {
          if (!d.extendTo || d.extendTo < longer.start_date || d.extendTo > longer.end_date) return d;
          const fresh = toDraft(d.source, longer, items);
          return { ...fresh, keep: true, title: d.title, cost: d.cost, perPerson: d.perPerson, payMode: d.payMode, paid: d.paid, location: d.location, notes: d.notes };
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };

  const patch = (i: number, change: Partial<Draft>) => setDrafts((all) => all.map((d, k) => (k === i ? { ...d, ...change } : d)));
  const kept = drafts.filter((d) => d.keep);
  const blocked = kept.some((d) => draftProblems(d, trip).length > 0);

  const save = async () => {
    setTried(true);
    if (!result || blocked || kept.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await onSave(kept);
      onDone(result, kept.length);
      settleQuestions();
      reset();
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const days = tripDays(trip.start_date, trip.end_date);

  return (
    <Dialog open={open} onClose={close} title={result ? (heading ?? "Review what was found") : "Import bookings"}>
      {open && !result && (
        <div>
          <p className="mb-3 text-sm text-white/75">
            Paste a confirmation email, a receipt, flight numbers or a quick summary, or attach a PDF, screenshot or photo.
            TripTab proposes the plans, and nothing is saved until you've reviewed them.
          </p>
          <DarkField label="Paste it here">
            <textarea
              className="field-dark min-h-[150px] resize-y"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={'"We fly UA 57 on Feb 4, Airbnb in Chamonix Feb 5 to 12, $3,200"'}
              autoFocus
            />
          </DarkField>
          <label className="mb-3 flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl border border-dashed border-white/25 px-3 text-sm text-white/85 hover:bg-white/5">
            <FileUp className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{file ? file.name : "Or attach a PDF, screenshot or photo (up to 3 MB)"}</span>
            <input
              type="file"
              className="sr-only"
              accept={FILE_TYPES.join(",")}
              aria-label="Attach a file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <p className="mb-3 text-xs text-white/55">
            It never invents a time, price or address that isn't in what you give it. For a bare flight number it may look up the
            schedule and tells you where it found it. What you paste is sent to Claude (Anthropic) to be read and isn't stored by TripTab.
          </p>
          {error && (
            <p role="alert" className="mb-3 rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-200">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="light" onClick={close}>
              Cancel
            </Button>
            <Button onClick={read} disabled={busy}>
              <Sparkles /> {busy ? "Reading..." : "Find the plans"}
            </Button>
          </div>
        </div>
      )}

      {open && result && (
        <div>
          <p className="mb-3 text-sm text-white/75" data-testid="import-summary">
            {drafts.length === 0
              ? (result.note ?? "No plans found in that.")
              : `Found ${drafts.length} ${drafts.length === 1 ? "plan" : "plans"}. Edit, untick or keep each one; nothing is on the trip until you save.`}
            {drafts.length > 0 && result.note ? ` ${result.note}` : ""}
          </p>

          {questions.length > 0 && (
            <section className="mb-3 rounded-2xl border border-white/20 bg-white/5 p-3" aria-labelledby="followups-title" data-testid="followups">
              <p id="followups-title" className="text-sm font-semibold text-white">
                A few details to finish, if you like
              </p>
              <p className="mb-2.5 text-xs text-white/70">
                Fill any of them in on the plans below now. Rather handle them later? Leave them ticked and they'll wait on your To do list.
              </p>
              <ul className="space-y-2">
                {questions.map((q, i) => (
                  <li key={i}>
                    <label className="flex items-start gap-2.5 text-sm text-white/90">
                      <input
                        type="checkbox"
                        className="mt-0.5 size-5 shrink-0 accent-[#8c7054]"
                        checked={park[i]}
                        onChange={(e) => setPark((all) => all.map((v, k) => (k === i ? e.target.checked : v)))}
                        aria-label={`Park on my To do list: ${q}`}
                      />
                      <span>
                        {q}
                        <span className="block text-[11px] text-white/55">{park[i] ? "Goes on your To do list" : "Not added: handled here, or skipped"}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <ul className="space-y-3">
            {drafts.map((d, i) => {
              const problems = d.keep ? draftProblems(d, trip) : [];
              const flag = (field: string) =>
                d.unsure.includes(field) ? <span className="ml-1.5 rounded-full bg-amber-400/20 px-1.5 text-[10px] font-bold normal-case tracking-normal text-amber-200">check this</span> : null;
              const checkouts = d.day ? tripDays(addDays(d.day, 1), addDays(trip.end_date, 1)) : [];
              return (
                <li key={i} className={`rounded-2xl border p-3 ${d.keep ? "border-white/20 bg-white/5" : "border-white/10 opacity-70"}`} data-testid="proposal">
                  <label className="mb-2 flex items-center gap-2.5 text-sm font-semibold text-white">
                    <input type="checkbox" className="size-5 accent-[#8c7054]" checked={d.keep} onChange={(e) => patch(i, { keep: e.target.checked })} />
                    Keep this one
                  </label>
                  {d.duplicateOf && (
                    <p className="mb-2 flex gap-2 rounded-xl bg-amber-400/15 px-3 py-2 text-xs text-amber-100">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                      Possible duplicate: "{d.duplicateOf}" is already on the trip that day. Tick Keep only if this is a different one.
                    </p>
                  )}
                  {d.warnings.map((w) => (
                    <p key={w} className="mb-2 flex gap-2 rounded-xl bg-amber-400/15 px-3 py-2 text-xs text-amber-100">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> <span>{w}</span>
                    </p>
                  ))}
                  {d.extendTo && onExtend && (
                    <Button size="sm" variant="light" className="mb-2" disabled={busy} onClick={() => extend(d.extendTo!)}>
                      <CalendarPlus /> Add {longDay(d.extendTo)} to the trip
                    </Button>
                  )}

                  <label className="mb-2 block">
                    <span className="label-luxury mb-1 block text-white/80">What{flag("title")}</span>
                    <input className="field-dark" value={d.title} onChange={(e) => patch(i, { title: e.target.value })} aria-label="What" />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="mb-2 block">
                      <span className="label-luxury mb-1 block text-white/80">Kind{flag("kind")}</span>
                      <select className="field-dark" value={d.kind} onChange={(e) => patch(i, { kind: e.target.value as ItemKind })} aria-label="Kind">
                        {KINDS.map((k) => (
                          <option key={k} value={k}>
                            {KIND_LABEL[k]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="mb-2 block">
                      <span className="label-luxury mb-1 block text-white/80">
                        {d.kind === "stay" ? "Check in" : "Day"}
                        {flag("day")}
                      </span>
                      <select className="field-dark" value={d.day} onChange={(e) => patch(i, { day: e.target.value })} aria-label={d.kind === "stay" ? "Check in" : "Day"}>
                        <option value="">Pick a day</option>
                        {days.map((day) => (
                          <option key={day} value={day}>
                            {longDay(day)}
                          </option>
                        ))}
                      </select>
                    </label>
                    {d.kind === "stay" ? (
                      <label className="mb-2 block">
                        <span className="label-luxury mb-1 block text-white/80">Check out{flag("end_day")}</span>
                        <select className="field-dark" value={d.end_day} onChange={(e) => patch(i, { end_day: e.target.value })} aria-label="Check out">
                          <option value="">Pick a day</option>
                          {checkouts.map((day) => (
                            <option key={day} value={day}>
                              {longDay(day)}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <label className="mb-2 block">
                        <span className="label-luxury mb-1 block text-white/80">Part of the day{flag("part")}</span>
                        <select className="field-dark" value={d.part} onChange={(e) => patch(i, { part: e.target.value as Draft["part"] })} aria-label="Part of the day">
                          {PARTS.map((p) => (
                            <option key={p} value={p}>
                              {PART_LABEL[p]}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <label className="mb-2 block">
                      <span className="label-luxury mb-1 block text-white/80">
                        {d.paid ? "Paid" : "Cost"}
                        {d.perPerson ? " (per person)" : ""}
                        {flag("cost")}
                      </span>
                      <input className="field-dark" inputMode="decimal" value={d.cost} onChange={(e) => patch(i, { cost: e.target.value })} placeholder="$" aria-label="Cost" />
                    </label>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <label className="mb-2 block">
                      <span className="label-luxury mb-1 block text-white/80">Who pays{flag("who_pays")}</span>
                      <select className="field-dark" value={d.payMode} onChange={(e) => patch(i, { payMode: e.target.value as PayMode })} aria-label="Who pays">
                        <option value="split">{PAY_MODE_LABEL.split}</option>
                        <option value="own">{PAY_MODE_LABEL.own}</option>
                      </select>
                    </label>
                    <label className="mb-2 flex min-h-11 items-center gap-2.5 self-end text-sm text-white">
                      <input type="checkbox" className="size-5 accent-[#8c7054]" checked={d.paid} onChange={(e) => patch(i, { paid: e.target.checked })} />
                      <span>
                        Already paid{flag("paid")}
                        <span className="block text-xs text-white/55">
                          {d.paid ? (d.payMode === "own" ? "Saves as your own cost" : "Saves as Confirmed: you paid, split evenly") : "Saves as Planned"}
                        </span>
                      </span>
                    </label>
                  </div>
                  {(d.location || d.notes) && (
                    <div className="rounded-xl bg-white/5 px-3 py-2 text-xs text-white/75">
                      {d.location && (
                        <p>
                          <span className="text-white/70">Where: </span>
                          {d.location}
                          {flag("location")}
                        </p>
                      )}
                      {d.notes && <p className="whitespace-pre-line break-words">{d.notes}</p>}
                      {d.source.source_url && (
                        <a href={d.source.source_url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 font-semibold text-white underline underline-offset-4">
                          Looked up here, check against your booking <ExternalLink className="size-3" />
                        </a>
                      )}
                    </div>
                  )}
                  {tried && problems.length > 0 && (
                    <p role="alert" className="mt-2 rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-200">
                      {problems.join(" ")}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>

          <p className="mt-3 text-xs text-white/70" data-testid="import-cost">
            This import cost {usdCost(result.usage.cost_usd)} at list price
            {result.usage.searches ? `, with ${result.usage.searches} web ${result.usage.searches === 1 ? "search" : "searches"}` : ""}.
          </p>
          {error && (
            <p role="alert" className="mt-2 rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-200">
              {error}
            </p>
          )}
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <Button variant="light" onClick={close} disabled={busy}>
              {drafts.length ? "Discard" : "Close"}
            </Button>
            {drafts.length > 0 && (
              <Button onClick={save} disabled={busy || kept.length === 0}>
                <Check /> {busy ? "Saving..." : `Add ${kept.length} to the trip`}
              </Button>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}
