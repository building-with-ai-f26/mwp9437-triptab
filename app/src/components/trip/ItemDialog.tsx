import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ExternalLink, FileUp, Trash2 } from "lucide-react";
import { Button, DarkField, Dialog, Segmented } from "../ui";
import {
  addDays,
  cleanLink,
  defaultPayMode,
  dollars,
  KIND_LABEL,
  linkHost,
  longDay,
  PART_LABEL,
  PARTS,
  partOfEndTime,
  partOfTime,
  PAY_MODE_LABEL,
  SPILL_DAYS,
  STATUS_LABEL,
  togglePart,
  tripDays,
  validateItem,
  widenTrip,
  type CostType,
  type DayPart,
  type Item,
  type ItemKind,
  type ItemStatus,
  type PayMode,
  type Traveler,
  type Trip,
} from "../../lib/model";
import { parseDollars, toCents } from "../../lib/money";
import type { ItemInput } from "../../lib/api";
import { whenText } from "../../lib/timeline";
import { PlaceInput } from "../PlaceInput";
import { searchAddresses, type AddressPlace } from "../../lib/places";

export interface ItemDialogState {
  /** The item being edited, or null for a new one. */
  item: Item | null;
  day: string;
  part: DayPart;
  kind: ItemKind;
}

const KINDS: ItemKind[] = ["activity", "meal", "transport", "flight", "stay"];

/**
 * "Already booked and paid?" answered yes while adding a plan: the one bill (who paid it, split
 * evenly among who's in), or your own line on an "everyone pays their own" plan.
 */
export type PaidNow =
  | { mode: "split"; totalCents: number; paidBy: string }
  | { mode: "own"; cents: number; withPoints: boolean }
  // Paid, the amount not to hand: Confirmed now, and adding it goes on your To do list (C27).
  | { mode: "later" };

/**
 * Add or edit a plan. Owners only: viewers see the plan read-only (Build 3 adds opting in or out).
 * Confirming with the real cost, who paid and who's in is a separate step (Build 3).
 */
export function ItemDialog({
  state,
  trip,
  travelers,
  meId,
  canEdit,
  extras,
  costExtras,
  stopOn,
  hasCost = false,
  confirmsItself = false,
  onImport,
  onClose,
  onSave,
  onDelete,
}: {
  state: ItemDialogState | null;
  trip: Trip;
  travelers: Traveler[];
  meId: string | null;
  canEdit: boolean;
  /** Shown above the form for an existing plan: its cost, your in or out, who's going (Build 3). */
  extras?: ReactNode;
  /** The cost half of the plan panel, shown inside Cost and who pays. */
  costExtras?: ReactNode;
  /** The stop a day is at, so Where's suggestions lean toward it (11/19). */
  stopOn?: (day: string) => string | null;
  /** The plan's cost is in (its bill, or everyone's own line): Confirmed stays until that's undone. */
  hasCost?: boolean;
  /** An own-cost plan with some lines in: it confirms itself once everyone going has booked. */
  confirmsItself?: boolean;
  /** A new plan: read it from a confirmation instead (a screenshot, a PDF or pasted text; C22). */
  onImport?: () => void;
  onClose: () => void;
  /** `patch`, on an existing plan: only the fields changed since it was last saved. */
  onSave: (input: ItemInput, existing: Item | null, paid?: PaidNow, patch?: Partial<ItemInput>) => Promise<void>;
  onDelete: (item: Item) => Promise<void>;
}) {
  // Closing (Done, the X, Escape or a tap outside) asks the form first: it saves what's pending,
  // or keeps the dialog open once to show what needs fixing.
  const closer = useRef<(() => Promise<boolean>) | null>(null);
  const requestClose = async () => {
    if (!closer.current || (await closer.current())) onClose();
  };
  return (
    <Dialog
      open={state !== null}
      onClose={requestClose}
      title={state?.item ? (canEdit ? "Edit plan" : state.item.title) : state?.kind === "stay" ? "Add a stay" : "Add a plan"}
    >
      {state && (
        <ItemForm
          key={state.item?.id ?? `${state.day}-${state.part}-${state.kind}`}
          {...{ state, trip, travelers, meId, canEdit, stopOn, hasCost, confirmsItself, onImport, onClose, onSave, onDelete }}
          goingExtras={state.item ? extras : undefined}
          costExtras={state.item ? costExtras : undefined}
          onRequestClose={requestClose}
          registerClose={(fn) => {
            closer.current = fn;
          }}
        />
      )}
    </Dialog>
  );
}

function ItemForm({
  state,
  trip,
  travelers,
  meId,
  canEdit,
  onClose,
  onSave,
  onDelete,
  onRequestClose,
  registerClose,
  goingExtras,
  costExtras,
  stopOn,
  hasCost = false,
  confirmsItself = false,
  onImport,
}: {
  state: ItemDialogState;
  trip: Trip;
  travelers: Traveler[];
  meId: string | null;
  canEdit: boolean;
  onClose: () => void;
  onSave: (input: ItemInput, existing: Item | null, paid?: PaidNow, patch?: Partial<ItemInput>) => Promise<void>;
  onDelete: (item: Item) => Promise<void>;
  onRequestClose: () => void;
  registerClose: (fn: (() => Promise<boolean>) | null) => void;
  /** An existing plan's who's in and Add to calendar (PlanPanel, going): in view, under status. */
  goingExtras?: ReactNode;
  /** An existing plan's who pays, confirm and own costs (PlanPanel, cost): inside the cost section. */
  costExtras?: ReactNode;
  stopOn?: (day: string) => string | null;
  hasCost?: boolean;
  confirmsItself?: boolean;
  onImport?: () => void;
}) {
  const it = state.item;
  const [kind, setKind] = useState<ItemKind>(it?.kind ?? state.kind);
  const [title, setTitle] = useState(it?.title ?? "");
  const [day, setDay] = useState(it?.day ?? state.day);
  const [part, setPart] = useState<DayPart>(it?.part ?? state.part);
  const [endDay, setEndDay] = useState(it?.kind === "stay" && it.end_day ? it.end_day : addDays(it?.day ?? state.day, 1));
  // Plans that span time (not stays): the last day and last part covered, and a flight's or transfer's times.
  const [lastDay, setLastDay] = useState(it && it.kind !== "stay" && it.end_day && it.end_day > it.day ? it.end_day : "");
  const [endPart, setEndPart] = useState<DayPart | "">(it?.end_part ?? "");
  const [startTime, setStartTime] = useState(it?.start_time?.slice(0, 5) ?? "");
  const [endTime, setEndTime] = useState(it?.end_time?.slice(0, 5) ?? "");
  const [status, setStatus] = useState<ItemStatus>(it?.status === "confirmed" ? "confirmed" : (it?.status ?? "suggested"));
  const [estimate, setEstimate] = useState(it?.est_cents != null ? String(it.est_cents / 100) : "");
  const [costType, setCostType] = useState<CostType>(it?.cost_type ?? "total");
  const [location, setLocation] = useState(it?.location ?? "");
  const [notes, setNotes] = useState(it?.notes ?? "");
  // A web page for it: an Airbnb listing, a booking (C22, Mike's call 11/20).
  const [link, setLink] = useState(it?.link ?? "");
  const [linkLeft, setLinkLeft] = useState(false);
  // New plans only: who pays (a default by kind until you pick), and whether it's already paid.
  const [payMode, setPayMode] = useState<PayMode>(it?.pay_mode ?? defaultPayMode(state.kind));
  const [payPicked, setPayPicked] = useState(false);
  const [paid, setPaid] = useState(false);
  const [paidAmount, setPaidAmount] = useState("");
  const [paidBy, setPaidBy] = useState(meId ?? travelers[0]?.id ?? "");
  const [points, setPoints] = useState(false);
  // Cost starts folded, so a plan with no cost (skiing on a season pass) doesn't face five
  // money questions (11/17 pod feedback).
  const [costOpen, setCostOpen] = useState(false);
  // Times and more days fold away too, until a plan has them (Mike's 11/19 review: the card was
  // overwhelming; lead with what, when and status, and disclose the rest on a tap).
  const [timesOpen, setTimesOpen] = useState(Boolean(it?.start_time || it?.end_time || (it && it.kind !== "stay" && it.end_day && it.end_day > it.day)));
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A plan may sit a day or two outside the trip (a flight the night before): saving it then
  // stretches the trip to include that day, in the same tap (Mike's call, 11/16).
  const days = tripDays(addDays(trip.start_date, -SPILL_DAYS), addDays(trip.end_date, SPILL_DAYS));
  const outside = day < trip.start_date || day > trip.end_date;
  const tripNow = widenTrip(trip, day);
  const dayLabel = (d: string) => (d < trip.start_date || d > trip.end_date ? `${longDay(d)} (adds it to the trip)` : longDay(d));
  const checkoutDays = tripDays(addDays(day, 1), addDays(tripNow.end_date, 1));
  const typed = estimate.trim() === "" ? null : parseDollars(estimate);
  const estCents = typed == null || Number.isNaN(typed) ? null : toCents(typed);
  const isStay = kind === "stay";
  const travel = kind === "flight" || kind === "transport";
  const flight = kind === "flight";
  const spanLastDay = !isStay && lastDay > day ? lastDay : null;
  // The last part only matters when it differs from where the plan starts, or it ends on another day.
  const spanEndPart = isStay || !endPart || (!spanLastDay && endPart === part) ? null : endPart;
  // A flight or transfer may arrive the day after the trip ends; an activity stays inside it.
  const lastDays = tripDays(addDays(day, 1), travel ? addDays(tripNow.end_date, 1) : tripNow.end_date).slice(0, travel ? 3 : 60);
  const paidNow = !it && paid;
  // Paid with no amount typed is fine: the amount comes later, as a to-do (C27, Mike's call 11/21).
  const amountLater = paidNow && paidAmount.trim() === "" && !(payMode === "own" && points);
  const paidTyped = paidAmount.trim() === "" ? 0 : parseDollars(paidAmount);
  const paidBad = !amountLater && (Number.isNaN(paidTyped) || paidTyped < 0);
  const paidInput: PaidNow | undefined = !paidNow || paidBad
    ? undefined
    : amountLater
      ? { mode: "later" }
      : payMode === "own"
        ? { mode: "own", cents: toCents(paidTyped), withPoints: points }
        : { mode: "split", totalCents: toCents(paidTyped), paidBy };

  const linked = cleanLink(link);
  const input: ItemInput = {
    kind,
    title: title.trim(),
    day,
    part: isStay ? "night" : part,
    end_day: isStay ? endDay : spanLastDay,
    end_part: spanEndPart,
    start_time: !isStay && startTime ? startTime : null,
    end_time: !isStay && endTime ? endTime : null,
    location: location.trim() || null,
    link: linked.value,
    notes: notes.trim() || null,
    status: paidNow ? (amountLater ? "confirmed" : "planned") : status,
    est_cents: paidNow ? null : estCents,
    cost_type: isStay ? "total" : costType,
    ...(it ? {} : { pay_mode: payMode }),
  };
  const costProblems = [
    ...(!paidNow && typed != null && Number.isNaN(typed) ? ["Type the estimate as a number, like 45 or $45."] : []),
    ...(paidNow && paidBad ? ["Enter what it cost, like 120 or $120."] : []),
    ...(paidNow && !amountLater && payMode === "split" && !paidBy ? ["Pick who paid."] : []),
  ];
  const problems = [...validateItem(input, tripNow), ...(linked.problem ? [linked.problem] : []), ...costProblems];
  // Non-travel plans: the run of parts covered, as indexes into PARTS.
  const fromIdx = PARTS.indexOf(part);
  const toIdx = endPart && PARTS.indexOf(endPart) > fromIdx ? PARTS.indexOf(endPart) : fromIdx;
  const setRun = (from: number, to: number) => {
    setPart(PARTS[from]);
    setEndPart(to > from ? PARTS[to] : "");
  };
  // Plans save as you go (11/17 pod feedback). An existing plan saves each change after a short
  // pause, sending only the fields that changed, so a status set elsewhere (logging costs, say)
  // isn't overwritten by this dialog's older copy. A new plan is added when the dialog closes,
  // however it's closed, once it has a name; Discard throws it away.
  const snapshot = JSON.stringify(input);
  const [savedSnap, setSavedSnap] = useState(snapshot);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const chain = useRef<Promise<boolean>>(Promise.resolve(true));
  const closed = useRef(false);
  const adding = useRef<Promise<boolean> | null>(null);
  const warned = useRef(false);
  const dirty = Boolean(it) && snapshot !== savedSnap;
  const valid = problems.length === 0;

  const saveChanges = (snap: string, full: ItemInput, before: string) => {
    const was = JSON.parse(before) as ItemInput;
    const patch = Object.fromEntries(
      Object.entries(full).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(was[k as keyof ItemInput])),
    ) as Partial<ItemInput>;
    setSaveState("saving");
    chain.current = chain.current
      .then(() => onSave(full, it, undefined, patch))
      .then(
        () => {
          setSavedSnap(snap);
          setSaveState("saved");
          setError(null);
          return true;
        },
        (e: Error) => {
          setSaveState("idle");
          setError(e.message);
          return false;
        },
      );
    return chain.current;
  };

  useEffect(() => {
    if (!it || !dirty || !valid || !canEdit) return;
    const timer = window.setTimeout(() => saveChanges(snapshot, input, savedSnap), 800);
    return () => window.clearTimeout(timer);
    // Runs when what's typed changes; the rest is read from that same render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot]);

  const closeFn = async (): Promise<boolean> => {
    if (closed.current || !canEdit) return true;
    // A new plan already being added (Add to trip, then the X before it closed): wait for that one
    // rather than adding it again (found 11/21, a second copy of the same plan).
    if (adding.current) return adding.current;
    if (it ? !dirty : !title.trim()) {
      await chain.current;
      return (closed.current = true);
    }
    if (!valid) {
      // The first try shows what needs fixing; a second closes anyway, keeping the last saved version.
      if (warned.current) return (closed.current = true);
      warned.current = true;
      setTried(true);
      if (costProblems.length) setCostOpen(true);
      return false;
    }
    if (it) return (closed.current = await saveChanges(snapshot, input, savedSnap));
    return addOnce(false);
  };

  /** Adds a new plan once, however many taps (Add, Enter, the X) ask for it while it's saving. */
  const addOnce = (closeAfter: boolean): Promise<boolean> => {
    if (adding.current) return adding.current;
    setBusy(true);
    setError(null);
    adding.current = (async () => {
      try {
        await onSave(input, null, paidInput);
        closed.current = true;
        if (closeAfter) onClose();
        return true;
      } catch (e) {
        setError((e as Error).message);
        setBusy(false);
        return false;
      } finally {
        adding.current = null;
      }
    })();
    return adding.current;
  };
  useEffect(() => {
    registerClose(closeFn);
    return () => registerClose(null);
  });

  const timesSummary =
    [
      startTime && endTime ? `${startTime} to ${endTime}` : startTime ? `from ${startTime}` : endTime ? `until ${endTime}` : "",
      spanLastDay ? (travel ? `arrives ${longDay(spanLastDay)}` : `every day through ${longDay(spanLastDay)}`) : "",
    ]
      .filter(Boolean)
      .join(" · ") || (travel ? "Leaves and arrives the same day" : "Just this day, no set times");

  const costSummary = paidNow
    ? "paid, logging it now"
    : estCents != null
      ? `about ${dollars(estCents)}${!isStay && costType === "per_person" ? " a person" : ""}`
      : "none yet";

  if (!canEdit && it) {
    return (
      <div className="space-y-3 text-sm text-white/85">
        <p>
          <span className="label-luxury block text-white/55">When</span>
          {whenText(it)}
        </p>
        <p>
          <span className="label-luxury block text-white/55">Status</span>
          {STATUS_LABEL[it.status]}
          {it.est_cents != null && it.status !== "confirmed" ? `, about ${dollars(it.est_cents)}` : ""}
        </p>
        <p>
          <span className="label-luxury block text-white/55">Who pays</span>
          {PAY_MODE_LABEL[it.pay_mode]}
        </p>
        {it.location && (
          <p>
            <span className="label-luxury block text-white/55">Where</span>
            {it.location}
          </p>
        )}
        {it.link && (
          <p>
            <span className="label-luxury block text-white/55">Link</span>
            <a
              href={it.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-white underline underline-offset-4"
            >
              {linkHost(it.link)} <ExternalLink className="size-3.5" />
            </a>
          </p>
        )}
        {it.notes && (
          <p className="whitespace-pre-line">
            <span className="label-luxury block text-white/55">Notes</span>
            {it.notes}
          </p>
        )}
        <p className="text-xs text-white/70">Only the trip's owners can change plans.</p>
        {goingExtras}
        {costExtras}
      </div>
    );
  }

  const save = async () => {
    setTried(true);
    if (costProblems.length) setCostOpen(true);
    if (problems.length) return;
    if (!it) {
      await addOnce(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave(input, it, paidInput);
      closed.current = true;
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        // Enter in a field: a new plan is added; an existing one saves now and stays open.
        if (!it) save();
        else if (dirty && valid) saveChanges(snapshot, input, savedSnap);
        else setTried(true);
      }}
    >
      {!it && onImport && (
        // Uploading a confirmation was only under AI help, where Mike didn't find it (his 11/19 review).
        <button
          type="button"
          onClick={() => {
            closed.current = true;
            onImport();
          }}
          className="mb-3 flex w-full items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-left text-sm text-white/85 hover:bg-white/10"
        >
          <FileUp className="size-4 shrink-0" />
          <span>
            Have a confirmation? <span className="font-semibold text-white underline underline-offset-4">Upload a screenshot or PDF</span>, or paste
            it, and TripTab fills the plan in.
          </span>
        </button>
      )}

      <DarkField label="What">
        <input
          className="field-dark"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={isStay ? "Chamonix Airbnb" : "Ski school"}
          autoFocus={!it}
        />
      </DarkField>

      <DarkField label="Kind" group>
        <Segmented
          label="Kind"
          value={kind}
          onChange={(k) => {
            setKind(k);
            if (!it && !payPicked) setPayMode(defaultPayMode(k));
          }}
          options={KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))}
        />
      </DarkField>

      <DarkField label="Where (optional)">
        {/* Addresses and places as you type, near the day's stop (Mike's 11/19 review). */}
        <PlaceInput<AddressPlace>
          dark
          label="Where (optional)"
          value={location}
          onChange={setLocation}
          onPick={(p) => setLocation(p.value)}
          search={(text, signal) => searchAddresses(text, stopOn?.(day) ?? null, signal)}
          credit="Places from OpenStreetMap, via Photon"
          placeholder="Address or place"
        />
      </DarkField>

      {isStay ? (
        <>
        <div className="grid grid-cols-2 gap-2">
          <DarkField label="Check in">
            <select
              className="field-dark"
              value={day}
              onChange={(e) => {
                setDay(e.target.value);
                if (endDay <= e.target.value) setEndDay(addDays(e.target.value, 1));
              }}
            >
              {days.map((d) => (
                <option key={d} value={d}>
                  {dayLabel(d)}
                </option>
              ))}
            </select>
          </DarkField>
          <DarkField label="Check out">
            <select className="field-dark" value={endDay} onChange={(e) => setEndDay(e.target.value)}>
              {checkoutDays.map((d) => (
                <option key={d} value={d}>
                  {longDay(d)}
                </option>
              ))}
            </select>
          </DarkField>
        </div>
        {outside && (
          <p className="-mt-1 mb-3 rounded-xl bg-white/10 px-3 py-2 text-xs text-white/85" data-testid="extends-trip">
            {longDay(day)} is {day < trip.start_date ? "before" : "after"} the trip. Saving adds it, so the trip {day < trip.start_date ? "starts" : "ends"} {longDay(day)}.
          </p>
        )}
        </>
      ) : (
        <>
          <DarkField label="Date">
            <select
              className="field-dark"
              value={day}
              onChange={(e) => {
                setDay(e.target.value);
                if (lastDay && lastDay <= e.target.value) setLastDay("");
              }}
            >
              {days.map((d) => (
                <option key={d} value={d}>
                  {dayLabel(d)}
                </option>
              ))}
            </select>
          </DarkField>
          {outside && (
            <p className="-mt-1 mb-3 rounded-xl bg-white/10 px-3 py-2 text-xs text-white/85" data-testid="extends-trip">
              {longDay(day)} is {day < trip.start_date ? "before" : "after"} the trip. Saving adds it, so the trip {day < trip.start_date ? "starts" : "ends"} {longDay(day)}.
            </p>
          )}
          {travel && spanLastDay ? (
            <DarkField label={flight ? "Departs in the" : "Leaves in the"} group>
              <Segmented label="Part of the day" value={part} onChange={setPart} options={PARTS.map((p) => ({ value: p, label: PART_LABEL[p] }))} />
            </DarkField>
          ) : (
            <DarkField
              label="Part of the day"
              group
              hint={
                travel
                  ? "Pick all that apply, from leaving to arriving. Arriving another day? Open times below."
                  : "Pick all that apply. It covers every part from the first to the last."
              }
            >
              <div role="group" aria-label="Part of the day" className="flex flex-wrap gap-1.5">
                {PARTS.map((p, i) => {
                  const on = i >= fromIdx && i <= toIdx;
                  return (
                    <button
                      key={p}
                      type="button"
                      aria-pressed={on}
                      onClick={() => {
                        const run = togglePart(fromIdx, toIdx, i);
                        setRun(run.from, run.to);
                      }}
                      className={`min-h-9 rounded-full px-3.5 text-sm transition-colors ${
                        on ? "bg-primary font-semibold text-white" : "border border-white/15 bg-white/5 text-white/80 hover:bg-white/15"
                      }`}
                    >
                      {PART_LABEL[p]}
                    </button>
                  );
                })}
              </div>
            </DarkField>
          )}

          <div className="mb-3 rounded-2xl border border-white/15 bg-white/5">
            <button
              type="button"
              aria-expanded={timesOpen}
              aria-controls="plan-times"
              onClick={() => setTimesOpen((o) => !o)}
              className="flex min-h-12 w-full items-center justify-between gap-3 px-3 py-2 text-left"
            >
              <span className="min-w-0">
                <span className="label-luxury block text-white/80">{travel ? "Times, or arriving another day" : "Times, or more days"}</span>
                <span className="block truncate text-sm text-white">{timesSummary}</span>
              </span>
              <ChevronDown className={`size-5 shrink-0 text-white/70 transition-transform ${timesOpen ? "rotate-180" : ""}`} />
            </button>
            {timesOpen && (
            <div id="plan-times" className="border-t border-white/10 px-3 pt-3">
          {travel ? (
            <div className="grid grid-cols-2 gap-x-2">
              <DarkField label={flight ? "Departs at (optional)" : "Leaves at (optional)"}>
                <input
                  type="time"
                  step={60}
                  className="field-dark"
                  value={startTime}
                  onChange={(e) => {
                    setStartTime(e.target.value);
                    if (e.target.value) setPart(partOfTime(e.target.value));
                  }}
                />
              </DarkField>
              <DarkField label={flight ? "Lands at (optional)" : "Arrives at (optional)"}>
                <input
                  type="time"
                  step={60}
                  className="field-dark"
                  value={endTime}
                  onChange={(e) => {
                    setEndTime(e.target.value);
                    if (e.target.value) setEndPart(partOfTime(e.target.value));
                  }}
                />
              </DarkField>
              <DarkField label={flight ? "Lands on" : "Arrives on"}>
                <select className="field-dark" value={spanLastDay ?? ""} onChange={(e) => setLastDay(e.target.value)}>
                  <option value="">The same day</option>
                  {lastDays.map((d) => (
                    <option key={d} value={d}>
                      {longDay(d)}
                    </option>
                  ))}
                </select>
              </DarkField>
              <DarkField label={flight ? "Lands in the" : "Arrives in the"}>
                <select className="field-dark" value={endPart} onChange={(e) => setEndPart(e.target.value as DayPart | "")}>
                  <option value="">{spanLastDay ? "Morning" : "Same part of the day"}</option>
                  {PARTS.filter((p) => spanLastDay || PARTS.indexOf(p) > PARTS.indexOf(part)).map((p) => (
                    <option key={p} value={p}>
                      {PART_LABEL[p]}
                    </option>
                  ))}
                </select>
              </DarkField>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-x-2">
              <DarkField label="Starts at (optional)">
                <input
                  type="time"
                  step={900} /* quarter hours (Mike's 11/19 review); a flight keeps its minute */
                  className="field-dark"
                  value={startTime}
                  onChange={(e) => {
                    setStartTime(e.target.value);
                    if (!e.target.value) return;
                    const from = PARTS.indexOf(partOfTime(e.target.value));
                    setRun(from, Math.max(from, toIdx));
                  }}
                />
              </DarkField>
              <DarkField label="Ends at (optional)">
                <input
                  type="time"
                  step={900} /* quarter hours (Mike's 11/19 review); a flight keeps its minute */
                  className="field-dark"
                  value={endTime}
                  onChange={(e) => {
                    setEndTime(e.target.value);
                    if (!e.target.value) return;
                    const to = PARTS.indexOf(partOfEndTime(e.target.value));
                    setRun(Math.min(fromIdx, to), to);
                  }}
                />
              </DarkField>
              <div className="col-span-2">
                <DarkField label="Every day through">
                  <select className="field-dark" value={spanLastDay ?? ""} onChange={(e) => setLastDay(e.target.value)}>
                    <option value="">Just {longDay(day)}</option>
                    {lastDays.map((d) => (
                      <option key={d} value={d}>
                        {longDay(d)}
                      </option>
                    ))}
                  </select>
                </DarkField>
              </div>
            </div>
          )}
          {(spanLastDay || spanEndPart) && (
            <p className="-mt-1 mb-3 text-xs text-white/60">
              {travel
                ? "It shows in every part of the day from leaving to arriving."
                : "One plan with one cost, shown in every slot it covers. Use this for skiing every day of a stop, not a plan per day."}
            </p>
          )}
            </div>
            )}
          </div>
        </>
      )}





      {/* Confirmed means it's happening; its cost can come later (C21, Mike's call 11/20). A plan whose
          cost is in stays Confirmed until that's undone. */}
      {paidNow ? null : it?.status === "confirmed" && hasCost ? (
        <p className="mb-3 text-sm text-white/70">Confirmed and paid. Undo the confirmation to change its status.</p>
      ) : (
        <DarkField
          group
          label="Status"
          hint={
            confirmsItself
              ? "Some people have logged their own cost: it's Confirmed once everyone going has booked."
              : "Suggested has a dotted outline until the group decides. Confirmed means it's happening; add its cost under Cost and who pays whenever you have it."
          }
        >
          <Segmented
            label="Status"
            value={status}
            onChange={setStatus}
            options={[
              { value: "suggested", label: "Suggested" },
              { value: "planned", label: "Planned" },
              ...(confirmsItself ? [] : [{ value: "confirmed" as ItemStatus, label: "Confirmed" }]),
            ]}
          />
        </DarkField>
      )}

      {goingExtras}

      <div className="mb-3 rounded-2xl border border-white/15 bg-white/5">
        <button
          type="button"
          aria-expanded={costOpen}
          aria-controls="plan-cost"
          onClick={() => setCostOpen((o) => !o)}
          className="flex min-h-12 w-full items-center justify-between gap-3 px-3 py-2 text-left"
        >
          <span className="min-w-0">
            <span className="label-luxury block text-white/80">{it ? "Cost and who pays" : "Cost"}</span>
            <span className="block truncate text-sm text-white">
              {it
                ? it.status === "confirmed" && hasCost
                  ? "Confirmed and paid"
                  : `${PAY_MODE_LABEL[it.pay_mode]} · ${costSummary}`
                : `${costSummary}${!paidNow ? ` · ${PAY_MODE_LABEL[payMode]}` : ""}`}
            </span>
          </span>
          <ChevronDown className={`size-5 shrink-0 text-white/70 transition-transform ${costOpen ? "rotate-180" : ""}`} />
        </button>
        {costOpen && (
          <div id="plan-cost" className="border-t border-white/10 px-3 pt-3">
          {costExtras && <div className="mb-3">{costExtras}</div>}
          {!it && (
            <>
              <DarkField
                group
                label="Who pays"
                hint={
                  payMode === "own"
                    ? "Each person going logs their own price (flights, lift passes). Prices stay private and never go into Settle up."
                    : "One person pays and it's split among who's in. If someone buys for only part of the group, add that as a general expense for now."
                }
              >
                <Segmented
                  label="Who pays"
                  value={payMode}
                  onChange={(m) => {
                    setPayMode(m);
                    setPayPicked(true);
                  }}
                  options={[
                    { value: "split", label: PAY_MODE_LABEL.split },
                    { value: "own", label: PAY_MODE_LABEL.own },
                  ]}
                />
              </DarkField>
              <DarkField group label="Already booked and paid?">
                <Segmented
                  label="Already booked and paid?"
                  value={paid ? "yes" : "no"}
                  onChange={(v) => setPaid(v === "yes")}
                  options={[
                    { value: "no", label: "Not yet" },
                    { value: "yes", label: "Yes, log it now" },
                  ]}
                />
              </DarkField>
            </>
          )}
          {paidNow && (
            <div className="mb-3 rounded-2xl bg-white/5 p-3">
              <DarkField label={payMode === "own" ? (points ? "Cash value or fees (optional)" : "What you paid") : isStay ? "What it cost in total" : "What it cost"}>
                <input
                  className="field-dark"
                  inputMode="decimal"
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value)}
                  placeholder="$"
                />
                {amountLater && (
                  <span className="mt-1 block text-xs text-white/60" data-testid="amount-later">
                    Don't have it to hand? Leave it empty: it saves as Confirmed, and adding what you paid goes on your To do list.
                  </span>
                )}
              </DarkField>
              {payMode === "own" ? (
                <>
                  <label className="mb-2 flex min-h-9 items-center gap-2.5 text-sm text-white">
                    <input type="checkbox" className="size-5 accent-[#8c7054]" checked={points} onChange={(e) => setPoints(e.target.checked)} />
                    Paid with points
                  </label>
                  <p className="text-xs text-white/60">
                    Logs your own line. The plan is Confirmed once everyone going has logged theirs
                    {kind === "flight" ? " (on a flight, that's whoever is on it: you, to start)." : "."}
                  </p>
                </>
              ) : (
                <>
                  <DarkField label="Paid by">
                    <select className="field-dark" value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
                      {travelers.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                          {t.id === meId ? " (you)" : ""}
                        </option>
                      ))}
                    </select>
                  </DarkField>
                  <p className="text-xs text-white/60">
                    Saved as Confirmed and split evenly among {kind === "flight" ? "whoever is on the flight (you, to start)" : "everyone on the trip"}.
                    Change the split or who's in from the plan afterwards. Paid with points? Enter what the group should pay.
                  </p>
                </>
              )}
            </div>
          )}
          <div className={`grid grid-cols-[1fr_auto] items-end gap-2 ${paidNow ? "hidden" : ""}`}>
            <DarkField label={isStay ? "Estimated total" : "Estimated cost"}>
              <input
                className="field-dark"
                inputMode="decimal"
                value={estimate}
                onChange={(e) => setEstimate(e.target.value)}
                placeholder="$"
              />
            </DarkField>
            {!isStay && (
              <div className="mb-3">
                <Segmented
                  label="Priced as"
                  value={costType}
                  onChange={setCostType}
                  options={[
                    { value: "total", label: "Total" },
                    { value: "per_person", label: "Per person" },
                  ]}
                />
              </div>
            )}
          </div>
          </div>
        )}
      </div>

      <DarkField label="Link (optional)">
        <span className="flex items-center gap-2">
          <input
            className="field-dark min-w-0 flex-1"
            type="text"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-label="Link (optional)"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            onBlur={() => setLinkLeft(true)}
            placeholder={isStay ? "The Airbnb or hotel page" : "A booking or a page about it"}
          />
          {linked.value && (
            <a
              href={linked.value}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-white underline underline-offset-4"
              aria-label={`Open ${linkHost(linked.value)}`}
            >
              Open <ExternalLink className="size-3.5" />
            </a>
          )}
        </span>
        {linked.problem && (linkLeft || tried) && <span className="mt-1 block text-xs text-red-200">{linked.problem}</span>}
      </DarkField>

      <DarkField label="Notes (optional)">
        <textarea className="field-dark min-h-[72px] resize-y" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </DarkField>

      {tried && problems.length > 0 && (
        <p role="alert" className="mb-3 rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-200">
          {problems.join(" ")}
        </p>
      )}
      {error && (
        <p role="alert" className="mb-3 rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        {it ? (
          <Button
            type="button"
            variant="light"
            size="sm"
            className="text-red-200"
            disabled={busy}
            onClick={async () => {
              if (!window.confirm(`Remove "${it.title}" from the trip?`)) return;
              setBusy(true);
              try {
                await onDelete(it);
                onClose();
              } catch (e) {
                setError((e as Error).message);
                setBusy(false);
              }
            }}
          >
            <Trash2 /> Remove
          </Button>
        ) : (
          <Button
            type="button"
            variant="light"
            size="sm"
            onClick={() => {
              closed.current = true;
              onClose();
            }}
          >
            Discard
          </Button>
        )}
        <div className="flex items-center gap-3">
          {it && (
            <span className="text-xs text-white/70" role="status" aria-live="polite">
              {saveState === "saving" || (dirty && valid)
                ? "Saving..."
                : dirty
                  ? "Not saved yet: check the fields"
                  : saveState === "saved"
                    ? "Saved"
                    : "Changes save as you go"}
            </span>
          )}
          {it ? (
            <Button type="button" onClick={onRequestClose}>
              Done
            </Button>
          ) : (
            <Button type="submit" disabled={busy}>
              {busy ? "Adding..." : "Add to trip"}
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
