import { useEffect, useRef, useState, type ClipboardEvent, type ReactNode } from "react";
import { AlertTriangle, CalendarPlus, Check, ChevronDown, ExternalLink, FileUp, Info, Plane, Sparkles, X } from "lucide-react";
import { Button, DarkField, Dialog } from "../ui";
import { importBookings } from "../../lib/api";
import { atEstimate, costToCome, draftProblems, mergedTitle, noteTotalCents, oneFare, sharedFareLegs, toDraft, type Draft, type ImportResult } from "../../lib/importPlans";
import { foreignLabel, toUsdCents, usdRate } from "../../lib/rates";
import { addDays, cleanLink, KIND_LABEL, longDay, PART_LABEL, PARTS, PAY_MODE_LABEL, togglePart, tripDays, widenTrip, type Item, type ItemKind, type PayMode, type Trip } from "../../lib/model";

const KINDS: ItemKind[] = ["activity", "meal", "transport", "flight", "stay"];
const FILE_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_FILE_BYTES = 3_000_000;
/** Files read in one go (C29): each is one read, and every read counts toward the day's imports. */
const MAX_FILES = 5;
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
  onPark,
  onSave,
  onDone,
  onExtend,
  initial = null,
  heading,
  questions = [],
  onQuestions,
  forward,
}: {
  open: boolean;
  trip: Trip;
  items: Item[];
  onClose: () => void;
  /** How many unsaved plans wait in the shut dialog (0 once they're saved or discarded). Left out, shutting discards. */
  onPark?: (waiting: number) => void;
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
  /** On the first screen, under attaching a file: the trip's address to forward bookings to (email-in). */
  forward?: ReactNode;
}) {
  const [text, setText] = useState("");
  // Several screenshots or PDFs at once, picked or pasted (C29, Mike's call 11/21).
  const [files, setFiles] = useState<File[]>([]);
  const addFiles = (more: File[]) => setFiles((had) => [...had, ...more].slice(0, MAX_FILES));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(initial);
  const [drafts, setDrafts] = useState<Draft[]>(() => (initial ? initial.plans.map((p) => toDraft(p, trip, items)) : []));
  const [tried, setTried] = useState(false);
  // Cost starts folded on each card unless it has one or needs a look (Mike's 11/19 review).
  const [costOpen, setCostOpen] = useState<Record<number, boolean>>({});
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
    setFiles([]);
    setResult(null);
    setDrafts([]);
    setError(null);
    setTried(false);
    setBusy(false);
  };
  /** Discard: the review goes, on purpose. */
  const close = () => {
    if (result) onDone(result, 0);
    settleQuestions();
    reset();
    onPark?.(0);
    onClose();
  };
  /**
   * The X, Escape or a tap outside with plans still unsaved: they're kept, edits and all, not lost
   * (11/23 review, item 9). The dialog shuts as it stands, and the trip offers the review back.
   */
  const shut = () => {
    if (busy) return;
    if (!result || drafts.length === 0 || !onPark) return close();
    onPark(drafts.length);
    onClose();
  };

  const read = async () => {
    setError(null);
    if (!text.trim() && files.length === 0) return setError("Paste something or attach a file first.");
    if (text.length > MAX_TEXT) return setError(`That's over ${MAX_TEXT.toLocaleString("en-US")} characters. Import it in parts.`);
    const odd = files.find((f) => !FILE_TYPES.includes(f.type));
    if (odd) return setError(`${odd.name}: attach a PDF, or a photo or screenshot (PNG, JPEG, WebP or GIF).`);
    const big = files.find((f) => f.size > MAX_FILE_BYTES);
    if (big) return setError(`${big.name} is over 3 MB. Try a screenshot of the part that matters.`);
    setBusy(true);
    try {
      // One read per file, the text going with the first; the plans come back on one review.
      const parts: ImportResult[] = [];
      for (const [i, f] of (files.length ? files : [null]).entries()) {
        const attached = f ? { media_type: f.type, data: await readFile(f) } : null;
        parts.push(await importBookings(trip.id, i === 0 ? text : "", attached));
      }
      const r: ImportResult = {
        plans: parts.flatMap((x) => x.plans),
        note: parts.map((x) => x.note).filter(Boolean).join(" ") || null,
        call_id: parts[0].call_id,
        usage: {
          ...parts[0].usage,
          cost_usd: parts.reduce((t, x) => t + x.usage.cost_usd, 0),
          searches: parts.reduce((t, x) => t + x.usage.searches, 0),
          input_tokens: parts.reduce((t, x) => t + x.usage.input_tokens, 0),
          output_tokens: parts.reduce((t, x) => t + x.usage.output_tokens, 0),
          latency_ms: parts.reduce((t, x) => t + x.usage.latency_ms, 0),
        },
      };
      setResult(r);
      setDrafts(r.plans.map((p) => toDraft(p, trip, items)));
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };

  /** A screenshot pasted into import is attached, the way a picked one is (C29). */
  const paste = (e: ClipboardEvent) => {
    const images = [...e.clipboardData.files].filter((f) => FILE_TYPES.includes(f.type));
    if (!images.length) return;
    e.preventDefault();
    addFiles(images.map((f, i) => (f.name && f.name !== "image.png" ? f : new File([f], `Pasted screenshot ${files.length + i + 1}.png`, { type: f.type }))));
  };

  // A price in another currency is turned into dollars at the day's rate (C28): the cost fills in,
  // marked pending until whoever paid checks the card charge. If the rate can't be had, the cost
  // stays empty: paid, it's added with the amount to come.
  const converting = drafts.some((d) => d.foreign && !d.converted && d.cost.trim() === "");
  useEffect(() => {
    if (!converting) return;
    let live = true;
    drafts.forEach((d, i) => {
      if (!d.foreign || d.converted || d.cost.trim() !== "") return;
      const { currency, cents } = d.foreign;
      usdRate(currency).then((rate) => {
        if (!live || !rate) return;
        setDrafts((all) =>
          all.map((x, k) => (k === i && !x.converted && x.cost.trim() === "" ? { ...x, cost: (toUsdCents(cents, rate.rate) / 100).toFixed(2), converted: rate } : x)),
        );
      });
    });
    return () => {
      live = false;
    };
    // Runs when a review with foreign prices opens; each draft is converted once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [converting, result]);

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
          return { ...fresh, keep: true, title: d.title, cost: d.cost, perPerson: d.perPerson, payMode: d.payMode, paid: d.paid, location: d.location, link: d.link, notes: d.notes, converted: d.converted, fareOn: d.fareOn };
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };

  const patch = (i: number, change: Partial<Draft>) => setDrafts((all) => all.map((d, k) => (k === i ? { ...d, ...change } : d)));
  const kept = drafts.filter((d) => d.keep);
  // Legs of one booking with no cost of their own: offer one fare for them all (C26).
  const fareLegs = sharedFareLegs(drafts);
  const needFix = kept.filter((d) => draftProblems(d, trip).length > 0).length;
  const blocked = needFix > 0;
  const list = useRef<HTMLUListElement>(null);

  const save = async () => {
    setTried(true);
    if (blocked) {
      // What needs fixing is on its card, which can be far up the list on a phone: go to it
      // (Mike's 11/19 review: three taps on Add did nothing he could see).
      window.requestAnimationFrame(() =>
        list.current?.querySelector('[data-problem="true"]')?.scrollIntoView({ block: "center", behavior: "smooth" }),
      );
      return;
    }
    if (!result || kept.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      // A leg whose fare is on another carries that leg's title; if that leg isn't kept, its own (C26).
      await onSave(
        kept.map((d) => {
          if (d.fareOn == null) return d;
          const carrier = drafts[d.fareOn];
          return carrier?.keep ? { ...d, fareTitle: carrier.title.trim() } : { ...d, fareOn: null };
        }),
      );
      onDone(result, kept.length);
      settleQuestions();
      reset();
      onPark?.(0);
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const days = tripDays(trip.start_date, trip.end_date);

  return (
    <Dialog open={open} onClose={shut} title={result ? (heading ?? "Review what was found") : "Import bookings"}>
      {open && !result && (
        <div onPaste={paste}>
          <p className="mb-3 text-sm text-white/75">
            Paste a confirmation email, a receipt, flight numbers or a quick summary, or attach or paste PDFs, screenshots and photos.
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
          <label className="mb-2 flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl border border-dashed border-white/25 px-3 text-sm text-white/85 hover:bg-white/5">
            <FileUp className="size-4 shrink-0" />
            <span className="min-w-0 flex-1">
              {files.length ? "Attach more" : "Or attach PDFs, screenshots or photos"}
              <span className="block text-xs text-white/55">Up to {MAX_FILES}, 3 MB each. Or paste a screenshot here.</span>
            </span>
            <input
              type="file"
              multiple
              className="sr-only"
              accept={FILE_TYPES.join(",")}
              aria-label="Attach files"
              onChange={(e) => {
                addFiles([...(e.target.files ?? [])]);
                e.target.value = "";
              }}
            />
          </label>
          {files.length > 0 && (
            <ul className="mb-3 space-y-1" data-testid="attached-files">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg bg-white/5 px-2.5 py-1.5 text-sm text-white/85">
                  <span className="min-w-0 flex-1 truncate">{f.name}</span>
                  <button
                    type="button"
                    className="-m-1 shrink-0 rounded-full p-1 text-white/60 hover:bg-white/10 hover:text-white"
                    aria-label={`Remove ${f.name}`}
                    onClick={() => setFiles((all) => all.filter((_, k) => k !== i))}
                  >
                    <X className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {forward}
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

          <ul className="space-y-3" ref={list}>
            {drafts.map((d, i) => {
              const problems = d.keep ? draftProblems(d, trip) : [];
              const flag = (field: string) =>
                d.unsure.includes(field) ? <span className="ml-1.5 rounded-full bg-amber-400/20 px-1.5 text-[10px] font-bold normal-case tracking-normal text-amber-200">check this</span> : null;
              const checkouts = d.day ? tripDays(addDays(d.day, 1), addDays(trip.end_date, 1)) : [];
              return (
                <li
                  key={i}
                  className={`rounded-2xl border p-3 ${d.keep ? "border-white/20 bg-white/5" : "border-white/10 opacity-70"}`}
                  data-testid="proposal"
                  data-problem={problems.length > 0}
                >
                  <label className="mb-2 flex items-center gap-2.5 text-sm font-semibold text-white">
                    <input type="checkbox" className="size-5 accent-[#8c7054]" checked={d.keep} onChange={(e) => patch(i, { keep: e.target.checked })} />
                    Keep this one
                  </label>
                  {d.mergeInto && (
                    // Already on the trip: this fills in what that plan is missing (C25, Mike's call 11/21).
                    <p className="mb-2 flex gap-2 rounded-xl bg-sky-400/15 px-3 py-2 text-xs text-sky-100" data-testid="merge-note">
                      <Info className="mt-0.5 size-3.5 shrink-0" />
                      <span>
                        Updates "{d.mergeInto.title}", already on the trip
                        {mergedTitle(d.mergeInto.title, d.title) ? (
                          // A general name takes the booking's (C34): shown here so it can be changed under What first.
                          <>
                            , and names it <b data-testid="merge-rename">"{d.title.trim()}"</b> (change it under What)
                          </>
                        ) : null}
                        : fills in what it's missing (times, place, cost) and keeps what's there. Untick to leave it as it is.
                      </span>
                    </p>
                  )}
                  {d.foreign && (
                    <p className="mb-2 flex gap-2 rounded-xl bg-amber-400/15 px-3 py-2 text-xs text-amber-100" data-testid="foreign-note">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                      <span>
                        Priced in {foreignLabel(d.foreign.currency, d.foreign.cents)}.{" "}
                        {d.converted && atEstimate(d)
                          ? `About $${d.cost} at today's rate (${d.converted.rate} from the European Central Bank). It's an estimate until ${d.paid ? "you check what your card was charged: that goes on your To do list" : "it's paid"}.`
                          : d.converted || d.cost.trim() !== ""
                            ? "The dollar amount below is what you typed: it's kept as the real charge."
                            : converting
                            ? "Looking up today's rate..."
                            : "Couldn't get today's rate: type the dollar amount, or leave it and add it later."}
                      </span>
                    </p>
                  )}
                  {d.fareOn != null && (
                    <p className="mb-2 flex gap-2 rounded-xl bg-sky-400/15 px-3 py-2 text-xs text-sky-100" data-testid="fare-on-note">
                      <Plane className="mt-0.5 size-3.5 shrink-0" />
                      <span>
                        Its fare is on "{drafts[d.fareOn]?.title}": one cost for the round trip.{" "}
                        <button type="button" className="font-semibold underline underline-offset-2" onClick={() => patch(i, { fareOn: null })}>
                          Give it its own
                        </button>
                      </span>
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
                        {d.kind === "stay" ? "Check in" : "Date"}
                        {flag("day")}
                      </span>
                      <select className="field-dark" value={d.day} onChange={(e) => patch(i, { day: e.target.value })} aria-label={d.kind === "stay" ? "Check in" : "Date"}>
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
                    ) : null}
                  </div>
                  <label className="mb-2 block">
                    <span className="label-luxury mb-1 block text-white/80">Where{flag("location")}</span>
                    <input
                      className="field-dark"
                      value={d.location}
                      onChange={(e) => patch(i, { location: e.target.value })}
                      placeholder="Optional: a place, like Loon Mountain"
                      aria-label="Where"
                    />
                  </label>
                  <label className="mb-2 block">
                    <span className="label-luxury mb-1 block text-white/80">Link</span>
                    {/* The booking's or listing's page (C32), so everyone can look at the place. */}
                    <input
                      className="field-dark"
                      type="text"
                      inputMode="url"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      value={d.link}
                      onChange={(e) => patch(i, { link: e.target.value })}
                      placeholder="Optional: the booking or listing page"
                      aria-label="Link"
                    />
                    {cleanLink(d.link).problem && <span className="mt-1 block text-xs text-amber-200">{cleanLink(d.link).problem}</span>}
                  </label>
                  {d.kind !== "stay" && (
                    <div className="mb-2">
                      <span className="label-luxury mb-1 block text-white/80">Part of the day{flag("part")}</span>
                      {/* Pick all that apply, as in the plan dialog (11/19): it runs from the first to the last. */}
                      <div role="group" aria-label={`Part of the day for ${d.title || "this plan"}`} className="flex flex-wrap gap-1.5">
                        {PARTS.map((p, k) => {
                          const from = PARTS.indexOf(d.part);
                          const to = d.end_part ? PARTS.indexOf(d.end_part) : from;
                          const on = k >= from && k <= to;
                          return (
                            <button
                              key={p}
                              type="button"
                              aria-pressed={on}
                              onClick={() => {
                                const run = togglePart(from, to, k);
                                patch(i, { part: PARTS[run.from], end_part: run.to > run.from ? PARTS[run.to] : null });
                              }}
                              className={`min-h-9 rounded-full px-3 text-sm transition-colors ${
                                on ? "bg-primary font-semibold text-white" : "border border-white/15 bg-white/5 text-white/80 hover:bg-white/15"
                              }`}
                            >
                              {PART_LABEL[p]}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {(() => {
                    const open = costOpen[i] ?? (d.cost !== "" || d.paid || d.unsure.includes("cost") || d.source.cost_cents != null);
                    const summary = d.cost
                      ? `$${d.cost}${d.perPerson ? " per person" : ""} · ${PAY_MODE_LABEL[d.payMode]}${d.paid ? " · paid" : ""}`
                      : `No cost yet · ${PAY_MODE_LABEL[d.payMode]}`;
                    return (
                      <div className="mb-2 rounded-xl border border-white/15 bg-white/5">
                        <button
                          type="button"
                          aria-expanded={open}
                          onClick={() => setCostOpen((all) => ({ ...all, [i]: !open }))}
                          className="flex min-h-11 w-full items-center justify-between gap-2 px-3 text-left text-sm text-white"
                        >
                          <span>
                            <span className="font-semibold">Cost and who pays</span>
                            {!open && <span className="block text-xs text-white/60">{summary}</span>}
                          </span>
                          <ChevronDown className={`size-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
                        </button>
                        {open && (
                          <div className="px-3 pb-2">
                            <label className="mb-2 block">
                              <span className="label-luxury mb-1 block text-white/80">
                                {d.paid ? "Paid" : "Cost"}
                                {d.perPerson ? " (per person)" : ""}
                                {flag("cost")}
                              </span>
                              <input className="field-dark" inputMode="decimal" value={d.cost} onChange={(e) => patch(i, { cost: e.target.value })} placeholder="$" aria-label="Cost" />
                            </label>
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
                                    {!d.paid
                                      ? "Saves as Planned"
                                      : costToCome(d)
                                        ? "No amount yet: saves as Confirmed, and adding what you paid goes on your To do list"
                                        : d.payMode === "own"
                                          ? "Saves as your own cost"
                                          : "Saves as Confirmed: you paid, split evenly"}
                                  </span>
                                </span>
                              </label>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  {d.notes && (
                    <div className="rounded-xl bg-white/5 px-3 py-2 text-xs text-white/75">
                      <p className="whitespace-pre-line break-words">{d.notes}</p>
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
          {/* The AI cost is logged (ai_calls) but never shown: people would read it as a charge (Mike's 11/19 review). */}
          {error && (
            <p role="alert" className="mt-2 rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-200">
              {error}
            </p>
          )}
          {fareLegs.length >= 2 && (
            <OneFare
              key={fareLegs.join(",")}
              titles={fareLegs.map((i) => drafts[i].title)}
              flights={fareLegs.every((i) => drafts[i].kind === "flight")}
              suggestedCents={noteTotalCents(result.note)}
              onApply={(cents) => setDrafts((all) => oneFare(all, fareLegs, cents))}
            />
          )}
          {tried && blocked && (
            <p role="alert" className="mt-2 rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-200" data-testid="needs-fix">
              {needFix === 1 ? "One plan needs" : `${needFix} plans need`} a fix first, marked in red above. Fix {needFix === 1 ? "it" : "them"}, or
              untick {needFix === 1 ? "it" : "them"}, then add.
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

/**
 * A round trip's one fare (C26, Mike's call 11/21: two plans and one expense, not a split): the
 * total goes on the first leg, and the others say their fare is on it. The amount starts from the
 * one total the import's note names, when it names one.
 */
function OneFare({
  titles,
  flights,
  suggestedCents,
  onApply,
}: {
  titles: string[];
  flights: boolean;
  suggestedCents: number | null;
  onApply: (cents: number) => void;
}) {
  const [amount, setAmount] = useState(suggestedCents != null ? (suggestedCents / 100).toFixed(2) : "");
  const cents = Math.round(Number(amount.replace(/[$,\s]/g, "")) * 100);
  const ok = amount.trim() !== "" && Number.isFinite(cents) && cents > 0;
  return (
    <section className="mt-3 rounded-2xl border border-white/20 bg-white/5 p-3" aria-labelledby="one-fare-title" data-testid="one-fare">
      <p id="one-fare-title" className="text-sm font-semibold text-white">
        One fare for these {titles.length} {flights ? "flights" : "legs"}?
      </p>
      <p className="mb-2 text-xs text-white/70">
        A round trip is one cost: it goes on "{titles[0]}", and the {titles.length === 2 ? "other says its" : "others say their"} fare is on it.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="field-dark w-36"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="$"
          aria-label="The one fare"
        />
        <Button size="sm" variant="light" disabled={!ok} onClick={() => onApply(cents)}>
          <Plane /> Put it on the first {flights ? "flight" : "leg"}
        </Button>
      </div>
    </section>
  );
}
