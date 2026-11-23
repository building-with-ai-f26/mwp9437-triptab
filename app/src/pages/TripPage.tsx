import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeft, CalendarDays, CalendarPlus, Check, FileText, ListChecks, Plus, Settings, Sparkles, UserPlus, Users, Wallet } from "lucide-react";
import { PlanWithAiDialog } from "../components/trip/PlanWithAi";
import { TopBar } from "../components/TopBar";
import { ConfirmBanner } from "../components/ConfirmBanner";
import { Button, ErrorNote, PhotoFrame, Segmented, Spinner } from "../components/ui";
import { WeekView } from "../components/trip/WeekView";
import { ActionsCard } from "../components/trip/Actions";
import { TripSettingsDialog } from "../components/trip/TripSettings";
import { DayBlock, DayChips, useActiveDay, type TimelineActions } from "../components/trip/Timeline";
import { MovePlans } from "../components/trip/MovePlans";
import { movePlan, type MovePatch } from "../lib/move";
import { ItemDialog, type ItemDialogState } from "../components/trip/ItemDialog";
import { splitEqually } from "../lib/money";
import { AddPersonDialog, PeopleCard } from "../components/trip/People";
import { YourPlans } from "../components/trip/YourPlans";
import { InviteCard, InviteDialog } from "../components/trip/Invite";
import { ExpenseDialog, MoneyCard, TravelCard, type ExpenseTarget } from "../components/trip/Money";
import { MoneyList } from "../components/trip/MoneyList";
import { moneyLines } from "../lib/moneyLines";
import { useWide } from "../lib/useWide";
import { Tour, type TourStep } from "../components/trip/Tour";
import { HelpButton, HelpFooter, useHelp } from "../components/Help";
import { markTourSeen, tourSeen } from "../lib/tour";
import { goingBadge } from "../lib/initials";
import { RecordPaymentDialog, SettleDialog } from "../components/trip/Payments";
import { PayInfoDialog, VenmoForDialog } from "../components/trip/PayInfo";
import { PlanPanel } from "../components/trip/PlanPanel";
import { AiChoiceDialog } from "../components/trip/AiChoice";
import { ImportDialog } from "../components/trip/Import";
import { ForwardAddress, InboxBanner } from "../components/trip/Inbox";
import type { InboxItem } from "../lib/inbox";
import { atEstimate, costToCome, draftCents, mergePatch, type Draft } from "../lib/importPlans";
import { foreignLabel } from "../lib/rates";
import type { DescribeResult, ItemInput } from "../lib/api";
import type { PaidNow } from "../components/trip/ItemDialog";
import {
  addItem,
  addAction,
  describedKey,
  addTraveler,
  sendInviteEmail,
  clearOwnLine,
  confirmItem,
  logOwnLine,
  deleteAction,
  deleteTrip,
  extendTrip,
  deleteExpense,
  deleteItem,
  deletePayment,
  recordPayment,
  setMyPay,
  setMyVenmo,
  setVenmoFor,
  setPayFor,
  inboxReady,
  markInbox,
  readHeldEmail,
  resetTripInbox,
  tripInboxAddress,
  type PaymentDraft,
  loadTrip,
  removeTraveler,
  resetLink,
  saveExpense,
  expenseIdForItem,
  setExpenseFx,
  settleFx,
  type ExpenseRow,
  setActionDone,
  setGoing,
  setVote,
  setRole,
  unconfirmItem,
  updateAction,
  updateTrip,
  updateItem,
  updateLink,
  tripTastes,
  type TripBundle,
  type TripTaste,
} from "../lib/api";
import { useAuth } from "../lib/auth";
import {
  addDays,
  canEdit,
  clock,
  dateRange,
  cleanLink,
  dollars,
  longDay,
  nightsBetween,
  PART_LABEL,
  partOfTime,
  plansOutside,
  ROLE_LABEL,
  suggestedBy,
  type DayPart,
  type Item,
  type ItemStatus,
  type Traveler,
} from "../lib/model";
import { bookedLabel, goingList, isGoing, myNumbers, myShareOf, ownLineOf, ownProgress, settle } from "../lib/ledger";
import { buildTimeline } from "../lib/timeline";
import { downloadIcs, icsForItems } from "../lib/ics";
import { subscribeToTrip } from "../lib/live";
import { photoFor } from "../lib/photos";
import { track } from "../lib/analytics";

type Tab = "itinerary" | "money" | "todo" | "people";

export default function TripPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [bundle, setBundle] = useState<TripBundle | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("itinerary");
  // Desktop: every cost and payment takes the main column in place of the itinerary (11/19 review).
  const [moneyOpen, setMoneyOpen] = useState(false);
  const wide = useWide();
  // The bottom bar (phones): each section keeps its own place, as tab bars do; tapping the section
  // you're on goes back to its top.
  const scrollOf = useRef<Partial<Record<Tab, number>>>({});
  // Where a pane was left is put back once that pane is on the page and laid out. (Doing it a
  // frame after the tap sometimes ran before the taller pane was there, and the place was lost.)
  const restore = useRef<Tab | null>(null);
  const pickTab = (next: Tab) => {
    if (next === tab) return window.scrollTo({ top: 0, behavior: "smooth" });
    scrollOf.current[tab] = window.scrollY;
    restore.current = next;
    setTab(next);
  };
  useLayoutEffect(() => {
    if (restore.current !== tab) return;
    restore.current = null;
    window.scrollTo({ top: scrollOf.current[tab] ?? 0 });
  }, [tab]);
  const help = useHelp();
  // Show me around (the 11/17 pod notes): once per device, the first time a trip opens.
  const [touring, setTouring] = useState(false);
  const [dialog, setDialog] = useState<ItemDialogState | null>(null);
  // Plans save as you go: "plan updated" goes to PostHog once per open dialog, not once per pause.
  const trackedEdit = useRef<string | null>(null);
  const [addingPerson, setAddingPerson] = useState(false);
  // An AI review shut with nothing saved waits here until it's reviewed or discarded (11/23 review, item 9).
  const [parked, setParked] = useState({ ideas: 0, bookings: 0 });
  const [parkNonce, setParkNonce] = useState(0);
  const [inviting, setInviting] = useState(false);
  // How people pay you (your own), and an Owner adding someone's Venmo, from People.
  const [editingPay, setEditingPay] = useState(false);
  const [venmoFor, setVenmoForPerson] = useState<Traveler | null>(null);
  const [expenseTarget, setExpenseTarget] = useState<ExpenseTarget | null>(null);
  const [settling, setSettling] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState<Partial<PaymentDraft> | null>(null);
  const [view, setView] = useState<"days" | "week">("days");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  // Email-in (11/20): the email whose plans are open on import's review.
  const [reviewingInbox, setReviewingInbox] = useState<InboxItem | null>(null);
  const [planning, setPlanning] = useState(false);
  // One AI button, two choices (Mike's 11/18 call): I have bookings (Import) or Give me ideas (Plan with AI).
  const [choosingAi, setChoosingAi] = useState(false);
  // Describe your trip: what Start a trip found, picked up once when this new trip first loads.
  const [described, setDescribed] = useState<DescribeResult | null>(null);
  const pickedUp = useRef(false);
  // Drag and drop: a moved plan shows in its new slot while it saves, then a note offers Undo.
  const [moving, setMoving] = useState<Record<string, MovePatch>>({});
  const [moveNote, setMoveNote] = useState<{ text: string; undo?: () => void } | null>(null);
  useEffect(() => {
    if (!moveNote) return;
    const t = window.setTimeout(() => setMoveNote(null), 10_000);
    return () => window.clearTimeout(t);
  }, [moveNote]);

  // What people chose to share from their profile's survey (C51), shown in People.
  const [tastes, setTastes] = useState<TripTaste[]>([]);
  useEffect(() => {
    tripTastes(id).then(setTastes);
  }, [id]);

  const reload = useCallback(
    () =>
      loadTrip(id)
        .then((b) => {
          setBundle(b);
          setError(null);
        })
        .catch((e: Error) => setError(e.message)),
    [id],
  );

  useEffect(() => {
    reload();
    // Pick up what others changed when you come back to the tab.
    const onFocus = () => document.visibilityState === "visible" && reload();
    document.addEventListener("visibilitychange", onFocus);
    return () => document.removeEventListener("visibilitychange", onFocus);
  }, [reload]);

  // Live updates: reload when anyone on the trip changes something.
  const loaded = Boolean(bundle);
  const paymentsReady = bundle?.payments != null;
  // A database with Zelle and the lock answers pay_locked for every person.
  const zelleReady = (bundle?.travelers ?? []).some((t) => t.pay_locked !== undefined);
  // Emails forwarded to the trip, where the database has email-in.
  const inboxOn = bundle?.inbox != null;
  const inboxAddressHere = useCallback(() => tripInboxAddress(id), [id]);
  const resetInboxHere = useCallback(() => resetTripInbox(id), [id]);
  useEffect(
    () => (loaded ? subscribeToTrip(id, reload, { payments: paymentsReady, inbox: inboxOn }) : undefined),
    [id, loaded, reload, paymentsReady, inboxOn],
  );

  // A trip just set up from a description: its follow-up questions become your to-dos, and its
  // plans open on import's review (once; the hand-off is removed as it's read).
  useEffect(() => {
    if (!bundle || pickedUp.current) return;
    pickedUp.current = true;
    let handoff: DescribeResult | null = null;
    try {
      const raw = sessionStorage.getItem(describedKey(id));
      sessionStorage.removeItem(describedKey(id));
      handoff = raw ? (JSON.parse(raw) as DescribeResult) : null;
    } catch {
      handoff = null;
    }
    if (!handoff) return;
    // With plans to review, its questions are asked there, as optional (Mike's 11/18 call, C11).
    if (handoff.plans.length) return setDescribed(handoff);
    const mine = bundle.travelers.find((t) => t.user_id === user?.id) ?? null;
    if (handoff.questions.length && mine) {
      Promise.all(handoff.questions.map((q) => addAction(id, q, mine.id, null)))
        .then(reload)
        .catch(() => {});
    }
  }, [bundle, id, user, reload]);

  // The guide starts on its own the first time a trip opens on this device, once nothing else is
  // open (a review of plans from a description, the how-you-get-paid step after joining).
  useEffect(() => {
    if (!loaded || tourSeen()) return;
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      if (tries > 120 || tourSeen()) return window.clearInterval(timer);
      if (document.querySelector("dialog[open]")) return;
      window.clearInterval(timer);
      setMoneyOpen(false);
      setTouring(true);
      track("tour started", { auto: true });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [loaded]);

  const days = useMemo(
    () => (bundle ? buildTimeline(bundle.trip, bundle.stops, bundle.items.map((i) => (moving[i.id] ? { ...i, ...moving[i.id] } : i))) : []),
    [bundle, moving],
  );
  const [active, jump] = useActiveDay(days.map((d) => d.date));

  if (bundle === undefined && !error) return <Spinner label="Loading trip" />;
  if (!bundle) {
    return (
      <div className="relative min-h-dvh">
        <PhotoFrame src={photoFor("travel")} />
        <main className="relative z-10 mx-auto max-w-md px-4 py-20">
          <div className="glass-card-solid rounded-3xl p-7 text-center">
            <h1 className="mb-2 font-display text-2xl font-bold italic">This trip isn't here</h1>
            <p className="mb-5 text-sm text-muted-foreground">
              {error ?? "It may have been deleted, or you're not on it. Ask someone on the trip for the group link."}
            </p>
            <Link to="/trips" className="font-semibold text-foreground underline underline-offset-4">
              Back to my trips
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const { trip, stops, travelers, link, expenses, itemPeople, ownMarks, items, actions: todos, payments, votes } = bundle;
  const me = travelers.find((t) => t.user_id === user?.id) ?? null;
  const meId = me?.id ?? null;
  const editable = canEdit(me?.role);
  /** Your Venmo and Zelle, on all your trips; a database without Zelle yet saves the Venmo only. */
  const saveMyPay = async (venmo: string, zelle: string, where: string) => {
    if (zelleReady) await setMyPay(venmo, zelle);
    else await setMyVenmo(venmo);
    track("pay info saved", { where, has_venmo: Boolean(venmo.trim()), has_zelle: Boolean(zelle.trim()) });
    await reload();
  };
  const photo = photoFor(`${stops.map((s) => s.name).join(" ")} ${trip.name}`);
  // A plan's one bill. Own lines are kept apart: several per plan, and only some are readable.
  const expenseByItem = new Map(expenses.filter((e) => e.item_id && !e.own).map((e) => [e.item_id as string, e]));
  const { balances, transfers } = settle(expenses, travelers, payments ?? []);
  const openItem = dialog?.item ? (items.find((i) => i.id === dialog.item!.id) ?? dialog.item) : null;

  /** Saves the plans kept on import's review (an import, or a trip's description), with what was paid. */
  const saveImported = async (kept: Draft[], via: "import" | "description" | "email" = "import") => {
    for (const d of kept) {
      const cents = draftCents(d);
      const stay = d.kind === "stay";
      // Paid with the amount to come (C27); a leg whose fare is on another (C26); a price in another
      // currency, converted at the day's rate and pending the card's charge (C28).
      const later = costToCome(d);
      const onFare = d.fareOn != null;
      const pending = atEstimate(d);
      const paid: PaidNow | undefined =
        !onFare && d.paid && cents != null && meId
          ? d.payMode === "own"
            ? { mode: "own", cents, withPoints: false }
            : {
                mode: "split",
                totalCents: d.perPerson && !stay ? cents * travelers.length : cents,
                paidBy: meId,
                // C28's converted price, marked pending on the expense the same way a typed one is (C33).
                foreign: pending && d.foreign ? { currency: d.foreign.currency, cents: d.perPerson && !stay ? d.foreign.cents * travelers.length : d.foreign.cents } : null,
              }
          : undefined;
      const notes = [
        d.notes.trim(),
        onFare ? `Fare paid with ${d.fareTitle ?? "the other leg"}: one cost for the round trip.` : "",
        pending && d.foreign && d.converted && cents != null
          ? `Priced ${foreignLabel(d.foreign.currency, d.foreign.cents)}: about ${dollars(cents)} at ${d.converted.rate} (European Central Bank, ${d.converted.date}). ${d.paid ? "Check what your card was charged." : "An estimate until it's paid."}`
          : d.foreign
            ? `Priced ${foreignLabel(d.foreign.currency, d.foreign.cents)}.`
            : "",
      ].filter(Boolean);
      const input: ItemInput = {
        kind: d.kind,
        title: d.title.trim(),
        day: d.day,
        part: stay ? "night" : d.part,
        end_day: stay ? d.end_day : spanEnd(d),
        // The parts picked on the review card (11/19), else a same-day trip's arrival part.
        end_part: stay
          ? null
          : d.end_part ?? (travelKind(d.kind) && d.source.arrive_time && d.day === d.source.day ? partOfTime(d.source.arrive_time) : null),
        start_time: travelKind(d.kind) && d.day === d.source.day ? d.source.depart_time : null,
        end_time: travelKind(d.kind) && d.day === d.source.day ? d.source.arrive_time : null,
        location: d.location.trim() || null,
        // The booking's or listing's page (C32); one that isn't a web address is left off.
        link: cleanLink(d.link).value,
        notes: notes.join("\n") || null,
        // Booked: Confirmed now, its cost to come (C21 lets a plan be Confirmed without one).
        status: later || (onFare && d.paid) ? "confirmed" : "planned",
        est_cents: paid || onFare ? null : cents,
        cost_type: d.perPerson && !stay ? "per_person" : "total",
        pay_mode: d.payMode,
      };
      // Already on the trip: fill in what it's missing instead of adding a second one (C25).
      const existing = d.mergeInto ? items.find((i) => i.id === d.mergeInto!.id) : undefined;
      let title = input.title;
      if (existing) {
        const patch = mergePatch(existing, input);
        // An each-pays-their-own plan with some costs in confirms itself once everyone's booked.
        if (patch.status === "confirmed" && existing.pay_mode === "own" && ownMarks.some((m) => m.item_id === existing.id)) delete patch.status;
        if (Object.keys(patch).length) await updateItem(existing.id, patch);
        track("plan merged", { kind: existing.kind, fields: Object.keys(patch).length, paid: Boolean(paid), renamed: Boolean(patch.title), via });
        if (paid && !costIsIn(existing)) await applyPaid({ ...existing, ...patch } as Item, paid, existing.status);
        // A general name ("Airbnb") takes the booking's (C34); the to-dos below use whichever it ends up with.
        title = patch.title ?? existing.title;
      } else {
        await createPlan(input, paid, via);
      }
      if (later && meId) {
        await addAction(trip.id, todoTitle("Add what you paid for ", title, ""), meId, null);
        track("cost to come", { kind: d.kind, via });
      }
      // A split bill's to-do comes with its pending mark (applyPaid); an own price or a leg on a fare gets it here.
      if (pending && d.paid && d.foreign && cents != null && meId && !(paid?.mode === "split" && paid.foreign)) {
        await addAction(trip.id, todoTitle("Check what your card was charged for ", title, ` (${foreignLabel(d.foreign.currency, d.foreign.cents)}, about ${dollars(cents)})`), meId, null);
      }
    }
    await reload();
  };

  /** Saves a move (or its Undo), showing the plan in its new slot until the trip reloads. */
  const applyMove = async (item: Item, patch: MovePatch) => {
    setMoving((m) => ({ ...m, [item.id]: patch }));
    try {
      await updateItem(item.id, patch);
      await reload();
    } finally {
      setMoving((m) => {
        const next = { ...m };
        delete next[item.id];
        return next;
      });
    }
  };

  /** Drag and drop: an Owner drops a plan on another part of the day, or on a day chip. */
  const moveItem = async (item: Item, day: string, part: DayPart) => {
    const move = movePlan(item, day, part, trip);
    if (!move) return;
    if ("error" in move) {
      setMoveNote({ text: `${item.title} can't go there: ${move.error}` });
      return;
    }
    // Until this save lands, no Undo is offered: an earlier note's Undo would undo the wrong move.
    setMoveNote({ text: `Moving ${item.title}...` });
    try {
      await applyMove(item, move.patch);
      track("plan moved", {
        kind: item.kind,
        days: nightsBetween(item.day, day),
        part_changed: move.patch.part !== move.before.part,
        time_cleared: Boolean(move.clearedTime),
      });
      setMoveNote({
        text: `Moved ${item.title} to ${longDay(day)}, ${PART_LABEL[part].toLowerCase()}.${move.clearedTime ? ` Its ${clock(move.clearedTime)} time was cleared.` : ""}`,
        undo: async () => {
          setMoveNote({ text: `Putting ${item.title} back...` });
          try {
            await applyMove(item, move.before);
            setMoveNote({ text: `Put ${item.title} back.` });
            track("plan move undone", { kind: item.kind });
          } catch (e) {
            setMoveNote({ text: `Couldn't undo: ${(e as Error).message}` });
          }
        },
      });
    } catch (e) {
      setMoveNote({ text: `Couldn't move ${item.title}: ${(e as Error).message}` });
    }
  };

  const actions: TimelineActions = {
    canEdit: editable,
    onMove: moveItem,
    onAdd: (day, part, kind = "activity") => setDialog({ item: null, day, part, kind }),
    onOpen: (item) => setDialog({ item, day: item.day, part: item.part, kind: item.kind }),
    exactCents: (item) =>
      item.pay_mode === "own"
        ? (ownLineOf(expenses, item.id, meId)?.total_cents ?? null)
        : (expenseByItem.get(item.id)?.total_cents ?? null),
    isOut: (item) => (meId ? !isGoing(item, meId, itemPeople) : false),
    paid: (item) => costIsIn(item),
    suggestedBy: (item) => suggestedBy(item, travelers, user?.id ?? null),
    aboard: (item) => {
      const on = goingList(item, travelers, itemPeople);
      return { names: on.map((t) => (t.id === meId ? "you" : t.name)), everyone: on.length === travelers.length && travelers.length > 0 };
    },
    note: (item) => {
      if (item.pay_mode === "own") {
        // Everyone pays their own: "Planned, 2 of 5 booked" until everyone going has logged theirs.
        const p = ownProgress(item, travelers, itemPeople, ownMarks);
        const mine = ownLineOf(expenses, item.id, meId);
        if (p.complete) return mine ? "Your own price · everyone's booked" : "Everyone's booked";
        // A booked count only means something once there's a price to book (Mike's 11/19 review:
        // "0 of 1 booked" on a drive with no cost was confusing): someone has booked, the plan has
        // an estimate, or it's a flight.
        if (p.booked.size > 0 || (item.status === "planned" && (item.est_cents != null || item.kind === "flight"))) {
          return `${bookedLabel(p)}${mine ? ` · yours ${dollars(mine.total_cents)}` : ""}`;
        }
      }
      const share = myShareOf(expenseByItem.get(item.id), meId);
      if (item.status === "confirmed" && share != null) return `Your share ${dollars(share)}`;
      // With two or more on the trip, the initials on the card say who's in (11/19).
      if (travelers.length > 1) return null;
      const n = goingList(item, travelers, itemPeople).length;
      if (item.kind === "flight") return `${n} on it`;
      return null;
    },
    going: (item) => goingBadge(goingList(item, travelers, itemPeople), travelers.length, meId),
    votes: (item) => {
      if (!votes) return null;
      const on = votes.filter((v) => v.item_id === item.id);
      return { count: on.length, mine: on.some((v) => v.traveler_id === meId) };
    },
  };

  /** PostHog: an own line was logged; and the plan's status, which follows the lines, if it moved. */
  const trackOwn = (item: Item, travelerId: string, cents: number, withPoints: boolean, before: ItemStatus, after: ItemStatus) => {
    track("own cost logged", {
      kind: item.kind,
      for_self: travelerId === meId,
      with_points: withPoints,
      has_amount: cents > 0,
      plan_status: after,
    });
    if (after !== before) {
      track("plan status changed", { kind: item.kind, from: before, to: after, who_pays: "own" });
      if (after === "confirmed") track("plan confirmed", { kind: item.kind, who_pays: "own", from_status: before });
    }
  };

  /**
   * Adds a plan, and when it's already paid logs the one bill (split evenly among who's in) or
   * your own line in the same step. Used by Add a plan and by AI import.
   */
  const createPlan = async (input: ItemInput, paid: PaidNow | undefined, via: "form" | "import" | "ai plan" | "description" | "email") => {
    const added = await addItem(trip.id, input);
    // Flights are per person: whoever adds one is on it.
    if (added.kind === "flight" && meId) await setGoing(added.id, meId, true);
    track("plan added", {
      kind: input.kind,
      status: input.status,
      part: input.part,
      has_estimate: input.est_cents != null,
      who_pays: added.pay_mode,
      already_paid: Boolean(paid),
      via,
    });
    if (paid) await applyPaid(added, paid, "new");
    return added;
  };

  /** Logs what was paid on a plan: the one bill (split evenly among who's in), or your own line. */
  /**
   * A cost in another currency (C33, Mike's call 11/21): the expense keeps the amount as written and is
   * an estimate until whoever paid enters what their card charged; that goes on their To do list.
   * Only when the foreign amount changed, so re-saving doesn't mark a settled cost pending again.
   */
  const markForeign = async (
    expenseId: string | null,
    foreign: { currency: string; cents: number } | null | undefined,
    before: ExpenseRow | undefined,
    title: string,
    payer: string,
    usdCents: number,
  ) => {
    if (!expenseId) return;
    if (foreign && before?.currency === foreign.currency && before?.foreign_cents === foreign.cents) return;
    if (!foreign && !before?.currency) return;
    await setExpenseFx(expenseId, foreign ?? null);
    if (foreign) {
      await addAction(trip.id, todoTitle("Check what your card was charged for ", title, ` (${foreignLabel(foreign.currency, foreign.cents)}, about ${dollars(usdCents)})`), payer, null);
      track("foreign cost", { currency: foreign.currency });
    }
  };

  const applyPaid = async (item: Item, paid: PaidNow, from: Item["status"] | "new") => {
    if (paid.mode === "split") {
      const inIds = item.kind === "flight" ? (meId ? [meId] : []) : travelers.map((t) => t.id);
      const parts = splitEqually(paid.totalCents, inIds);
      await confirmItem(item.id, paid.totalCents, paid.paidBy, "even", inIds.map((id) => ({ traveler_id: id, amount_cents: parts[id] })), travelers.map((t) => t.id));
      if (paid.foreign) await markForeign(await expenseIdForItem(item.id), paid.foreign, undefined, item.title, paid.paidBy, paid.totalCents);
      track("plan confirmed", { kind: item.kind, split: "even", people: inIds.length, from_status: from, who_pays: "split" });
      track("plan status changed", { kind: item.kind, from: from === "new" ? "planned" : from, to: "confirmed", who_pays: "split" });
    } else if (paid.mode === "own" && meId) {
      const after = await logOwnLine(item.id, meId, paid.cents, paid.withPoints);
      trackOwn(item, meId, paid.cents, paid.withPoints, from === "new" ? "planned" : from, after);
    } else if (paid.mode === "later" && meId) {
      // Paid, the amount to come (C27): the plan is already Confirmed; adding it waits on your To do list.
      await addAction(trip.id, todoTitle("Add what you paid for ", item.title, ""), meId, null);
      track("cost to come", { kind: item.kind, via: "form" });
    }
  };

  const travelKind = (kind: Item["kind"]) => kind === "flight" || kind === "transport";
  /** An imported plan's last day (a flight's arrival day, an activity's last day), when it fits the trip and the day wasn't changed in review. */
  const spanEnd = (d: Draft): string | null => {
    const end = d.source.end_day;
    if (!end || d.day !== d.source.day || end <= d.day) return null;
    // A rental car's return day isn't an arrival: only a transfer with an arrival time runs on.
    if (d.kind === "transport" && !d.source.arrive_time) return null;
    const limit = travelKind(d.kind) ? addDays(trip.end_date, 1) : trip.end_date;
    return end <= limit ? end : null;
  };

  const openPlan = (item: Item) => setDialog({ item, day: item.day, part: item.part, kind: item.kind });
  /** Its cost is in: one bill logged, or everyone going has logged their own (the $ check, C21). */
  function costIsIn(item: Item): boolean {
    return item.pay_mode === "own" ? ownProgress(item, travelers, itemPeople, ownMarks).complete : expenseByItem.has(item.id);
  }
  const lineCount = moneyLines(expenses, payments, meId).length;
  // Each renders once, where the layout puts it: a phone shows the list under the Money summary and
  // Travel and lodging atop the itinerary; desktop shows them in the main column and the sidebar.
  const moneyList = (id: string) => (
    <MoneyList
      id={id}
      expenses={expenses}
      payments={payments}
      items={items}
      travelers={travelers}
      meId={meId}
      myUserId={user?.id ?? null}
      canEdit={editable}
      onOpenPlan={openPlan}
      onOpenExpense={(e) => setExpenseTarget({ kind: "general", expense: e })}
      onRemovePayment={async (p) => {
        await deletePayment(p.id);
        track("payment removed", { method: p.method });
        await reload();
      }}
    />
  );
  const firstPlan = () => document.querySelector('main .item-card:not([data-continued="true"])');
  const startTour = () => {
    setMoneyOpen(false);
    setTouring(true);
    track("tour started", { auto: false });
  };
  const tourSteps: TourStep<Tab>[] = [
    {
      id: "itinerary",
      tab: "itinerary",
      title: "Your itinerary",
      body: "Each day runs morning to night, with where everyone's staying at the end. Suggested plans are dotted, Planned ones are solid, and the green $ check means confirmed and paid.",
      target: () => document.querySelector('[data-tour="itinerary"]'),
    },
    ...(editable
      ? [
          {
            id: "add",
            tab: "itinerary" as Tab,
            title: "Add plans",
            body: "Add a plan here, or tap any empty part of a day. AI help turns a pasted booking into plans, or finds ideas for the empty spots. It also has this trip's own email address: forward a booking there.",
            target: () => document.querySelector('[data-tour="add"]'),
          },
        ]
      : []),
    ...(items.length
      ? [
          {
            id: "plan",
            tab: "itinerary" as Tab,
            title: "Tap a plan",
            body: `See who's going and say I'm in or I'm out; its cost and who pays are inside. On a Suggested plan, I want this tells the group you'd like it.${editable ? (wide ? " Drag a plan to move it to another day or part of the day." : " Press and hold a plan to drag it to another day or part of the day.") : ""}`,
            target: firstPlan,
          },
        ]
      : []),
    {
      id: "todo",
      tab: "todo",
      title: "To do",
      body: "What still needs doing before the trip, who's on it and by when.",
      target: () => document.querySelector('section[aria-labelledby="actions-title"]'),
    },
    {
      id: "money",
      tab: "money",
      title: "Money",
      body: `Your balance and everyone's. ${editable ? "When a plan is booked, open it and tap Confirm and log the cost. " : ""}Settle up shows the fewest payments to even out, with Pay with Venmo, and every cost and payment is a tap away. TripTab never moves money itself.`,
      target: () => document.querySelector('section[aria-labelledby="money-title"]'),
    },
    {
      id: "people",
      tab: "people",
      title: "People",
      body: editable
        ? "Tap Invite, or copy the group link here, and drop it in your group chat: each person picks their name and they're on the trip. Your Venmo, Zelle and phone come from Your profile."
        : "Everyone on the trip, and how each of them gets paid back. Your own Venmo, Zelle and phone come from Your profile.",
      target: () => document.querySelector('section[aria-labelledby="people-title"]'),
    },
    {
      id: "help",
      tab: "itinerary",
      title: "Help, any time",
      body: "This line is at the bottom of every page: Show me around replays this tour, Guide explains each part of TripTab, and Send feedback is for a bug or something you'd like added.",
      target: () => document.querySelector('[data-tour="help"]'),
    },
  ];

  const travelCard = <TravelCard items={items} travelers={travelers} itemPeople={itemPeople} meId={meId} compact={!wide} onOpen={openPlan} />;

  const peopleCard = (
    <PeopleCard
      trip={trip}
      travelers={travelers}
      link={link}
      meId={me?.id ?? null}
      canEdit={editable}
      onAdd={() => setAddingPerson(true)}
      onRole={async (t, role) => {
        await setRole(t.id, role);
        await reload();
      }}
      onRemove={async (t) => {
        await removeTraveler(t.id);
        await reload();
      }}
      tastes={tastes}
      payReady={paymentsReady}
      zelleReady={zelleReady}
      onEditMyPay={() => setEditingPay(true)}
      onVenmoFor={(t) => setVenmoForPerson(t)}
      linkControls={{
        onChange: async (patch) => {
          await updateLink(trip.id, patch);
          await reload();
        },
        onReset: async () => {
          await resetLink(trip.id);
          await reload();
        },
      }}
    />
  );

  return (
    <div className="relative min-h-dvh">
      <PhotoFrame src={photo} />
      <div className="relative z-10">
        <TopBar
          back={{ to: "/trips", label: "My trips" }}
          title={trip.name}
          subtitle={`${dateRange(trip.start_date, trip.end_date)}${stops.length ? ` · ${stops.map((s) => s.name).join(", ")}` : ""}`}
        >
          <Button
            variant="glass"
            size="sm"
            aria-label="Add your plans to your calendar"
            title="Add your plans to your calendar"
            onClick={() => {
              const mine = items.filter((i) => (meId ? isGoing(i, meId, itemPeople) : true));
              downloadIcs(`${trip.name}.ics`, icsForItems(trip, mine));
              track("calendar downloaded", { scope: "trip", plans: mine.length });
            }}
          >
            <CalendarPlus /> <span className="hidden md:inline">Calendar</span>
          </Button>
          {editable && link && (
            <Button
              variant="glass"
              size="sm"
              aria-label="Invite the group"
              title="Invite the group"
              onClick={() => {
                setInviting(true);
                track("invite opened", { from: "header", people: travelers.length });
              }}
            >
              <UserPlus /> <span className="hidden md:inline">Invite</span>
            </Button>
          )}
          {editable && (
            <Button variant="glass" size="sm" aria-label="Trip settings" title="Trip settings" onClick={() => setSettingsOpen(true)}>
              <Settings />
            </Button>
          )}
          <Button
            variant="glass"
            size="sm"
            aria-label="PDF itinerary"
            title="PDF itinerary"
            onClick={() => navigate(`/trips/${trip.id}/print`)}
          >
            <FileText /> <span className="hidden md:inline">PDF</span>
          </Button>
          {/* Five buttons don't fit a phone's header; there, Help is the line at the bottom of the page. */}
          <HelpButton help={help} className="!hidden sm:!inline-flex" />
          {me && (
            <span className="hidden rounded-full bg-white/80 px-2.5 py-1 text-xs font-semibold text-gold-dark lg:inline">
              You're {me.role === "owner" ? "an" : "a"} {ROLE_LABEL[me.role]}
            </span>
          )}
        </TopBar>
        <ConfirmBanner />

        {/* On a phone the bottom bar covers the last 4.5rem (plus the home indicator), so the page ends above it. */}
        <div className="mx-auto max-w-6xl px-4 pb-[calc(4.5rem+env(safe-area-inset-bottom))] sm:px-6 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-8 lg:pb-0">
          <main className={tab === "itinerary" ? "" : "hidden lg:block"}>
            {wide && moneyOpen ? (
              <div className="space-y-3 pb-16 pt-4 sm:pt-6">
                <Button size="sm" variant="glass" className="!bg-white/60 font-semibold" onClick={() => setMoneyOpen(false)}>
                  <ArrowLeft /> Back to the itinerary
                </Button>
                {moneyList("money-lines-title")}
              </div>
            ) : (
            <>
            {!wide && travelCard}
            {meId && travelers.length > 1 && items.length > 0 && (
              <YourPlans
                items={items}
                itemPeople={itemPeople}
                expenses={expenses}
                meId={meId}
                share={myNumbers(expenses, meId, payments ?? []).share}
                balance={balances[meId] ?? 0}
                onGoing={async (item, going) => {
                  await setGoing(item.id, meId, going);
                  track(going ? "opted in" : "opted out", { kind: item.kind, from: "your plans" });
                  await reload();
                }}
                onOpen={openPlan}
              />
            )}
            {editable && bundle.inbox && bundle.inbox.length > 0 && (
              <div className="pt-4 sm:pt-6">
                <InboxBanner
                  items={bundle.inbox}
                  travelers={travelers}
                  onReview={(item) => {
                    track("inbox review opened", { plans: item.plans.length });
                    setReviewingInbox(item);
                  }}
                  onDismiss={async (item) => {
                    await markInbox(item.id, "dismissed");
                    track("inbox dismissed", { status: item.status });
                    await reload();
                  }}
                  onReadHeld={async (item, mine) => {
                    await readHeldEmail(item.id, mine);
                    track("inbox held read", { mine });
                    await reload();
                  }}
                />
              </div>
            )}
            {editable && link && travelers.length === 1 && (
              <InviteCard
                trip={trip}
                link={link}
                onAddPerson={() => setAddingPerson(true)}
                onTurnOn={async () => {
                  await updateLink(trip.id, { enabled: true });
                  await reload();
                }}
              />
            )}
            {editable && (parked.ideas > 0 || parked.bookings > 0) && (
              <div role="status" data-testid="parked-review" className="glass-card-solid mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl p-4 sm:mt-6">
                <Sparkles className="size-5 shrink-0 text-primary" />
                <p className="min-w-0 flex-1 text-sm text-foreground">
                  <span className="font-semibold">
                    {parked.ideas > 0
                      ? `${parked.ideas} ${parked.ideas === 1 ? "idea" : "ideas"} from AI help ${parked.ideas === 1 ? "is" : "are"} waiting.`
                      : `${parked.bookings} ${parked.bookings === 1 ? "plan" : "plans"} from your bookings ${parked.bookings === 1 ? "is" : "are"} waiting.`}
                  </span>{" "}
                  Nothing is on the trip until you add it.
                </p>
                <Button size="sm" onClick={() => (parked.ideas > 0 ? setPlanning(true) : setImporting(true))}>
                  Review
                </Button>
                <Button
                  size="sm"
                  variant="glass"
                  onClick={() => {
                    // A fresh dialog: the shut one's review goes with it.
                    setParked({ ideas: 0, bookings: 0 });
                    setParkNonce((n) => n + 1);
                  }}
                >
                  Discard
                </Button>
              </div>
            )}
            <div className="flex flex-wrap items-end justify-between gap-2 pb-3 pt-4 sm:pt-6">
              <div data-tour="itinerary">
                <h2 className="font-display text-xl font-bold italic sm:text-2xl">Your Itinerary</h2>
                <p className="mt-1.5 inline-flex flex-wrap items-center gap-x-3 gap-y-1 rounded-full bg-white/45 px-3 py-1 text-[11px] text-muted-foreground backdrop-blur-sm">
                  <span className="inline-flex items-center gap-1.5 font-medium text-foreground/85"><span aria-hidden className="inline-block h-3 w-5 rounded-[4px] border-2 border-dotted border-foreground/55" />Suggested is dotted</span>
                  <span className="font-medium text-foreground/80">Planned is solid</span>
                  <span className="inline-flex items-center gap-1 font-semibold text-green-900">
                    Confirmed <span className="inline-flex items-center rounded-full bg-white/75 px-1 text-[10px] font-bold text-green-800"><Check className="size-2.5" strokeWidth={3} /></span>
                  </span>
                  <span className="inline-flex items-center gap-1 font-semibold text-green-900">
                    Paid <span className="inline-flex items-center rounded-full bg-white/75 px-1 text-[10px] font-bold text-green-800">$<Check className="size-2.5" strokeWidth={3} /></span>
                  </span>
                </p>
                <button
                  type="button"
                  className="ml-1 mt-1 block text-xs font-semibold text-foreground/80 underline underline-offset-4"
                  onClick={startTour}
                >
                  Show me around
                </button>
              </div>
              {editable && (
                <div className="flex flex-wrap gap-2" data-tour="add">
                  <Button size="sm" variant="glass" className="!bg-white/60 font-semibold" onClick={() => setChoosingAi(true)}>
                    <Sparkles /> AI help
                  </Button>
                  <Button size="sm" onClick={() => setDialog({ item: null, day: active ?? trip.start_date, part: "day", kind: "activity" })}>
                    <Plus /> Add a plan
                  </Button>
                </div>
              )}
            </div>
            <div className="mb-3">
              <Segmented
                dark={false}
                label="Itinerary view"
                value={view}
                onChange={(v) => {
                  setView(v);
                  if (v === "week") track("week view opened", { days: days.length });
                }}
                options={[
                  { value: "days", label: "Day by day" },
                  { value: "week", label: "Week" },
                ]}
              />
            </div>
            {error && <ErrorNote>{error}</ErrorNote>}
            {view === "week" ? (
              <WeekView days={days} actions={actions} />
            ) : (
              <MovePlans onMove={moveItem}>
                <DayChips days={days} active={active} onPick={jump} />
                <div className="divide-y divide-foreground/10 pb-16">
                  {days.map((d, i) => (
                    <DayBlock key={d.date} day={d} last={i === days.length - 1} actions={actions} foldEmpty={!wide} startOpen={i === 0 && items.length === 0} />
                  ))}
                </div>
              </MovePlans>
            )}
            </>
            )}
          </main>

          <aside className={`space-y-4 pb-16 pt-4 sm:pt-6 lg:sticky lg:top-20 lg:block lg:max-h-[calc(100dvh-5rem)] lg:self-start lg:overflow-y-auto ${tab === "itinerary" ? "hidden" : ""}`}>
            <div className={tab === "todo" ? "" : "hidden lg:block"}>
              <ActionsCard
                trip={trip}
                actions={todos}
                travelers={travelers}
                meId={meId}
                canEdit={editable}
                onAdd={async (title, assignee, due) => {
                  await addAction(trip.id, title, assignee, due);
                  track("action item added", { assigned: Boolean(assignee), to_self: assignee === meId, has_due: Boolean(due) });
                  await reload();
                }}
                onDone={async (a, done) => {
                  await setActionDone(a.id, done);
                  if (done) track("action item done", { own: a.assignee === meId });
                  await reload();
                }}
                onAssign={async (a, assignee) => {
                  await updateAction(a.id, { assignee });
                  await reload();
                }}
                onDelete={async (a) => {
                  await deleteAction(a.id);
                  await reload();
                }}
              />
            </div>
            {wide && travelCard}
            <div className={`space-y-4 ${tab === "money" ? "" : "hidden lg:block"}`}>
              <MoneyCard
                travelers={travelers}
                expenses={expenses}
                balances={balances}
                meId={meId}
                canEdit={editable}
                payments={payments}
                lineCount={lineCount}
                showingAll={moneyOpen}
                onShowAll={wide ? () => {
                  setMoneyOpen((o) => !o);
                  if (!moneyOpen) track("money list opened", { lines: lineCount });
                } : undefined}
                onAdd={() => setExpenseTarget({ kind: "general" })}
                onSettleFx={async (e, cents) => {
                  await settleFx(e.id, cents);
                  track("fx settled", { kept: cents == null, currency: e.currency });
                  await reload();
                }}
                onSettle={() => {
                  setSettling(true);
                  track("settle up viewed", { transfers: transfers.length, people: travelers.length });
                }}
              />
              {!wide && moneyList("money-lines-title")}
            </div>
            <div className={`space-y-4 ${tab === "people" ? "" : "hidden lg:block"}`}>
            {peopleCard}
            {!editable && (
              <section className="glass-card-solid rounded-2xl p-4 text-sm text-muted-foreground">
                You're a viewer on this trip: you see every plan and who's going, you can opt in or out, and you can log your own cost on plans where everyone pays their own. Ask an owner
                if you need to add or change something.
              </section>
            )}
            </div>
          </aside>
          <div className="lg:col-span-2">
            <HelpFooter help={help} onTour={startTour} />
          </div>
        </div>
      </div>

      {editable && link && (
        <InviteDialog
          open={inviting}
          onClose={() => setInviting(false)}
          trip={trip}
          link={link}
          people={travelers.length}
          onAddPerson={() => {
            setInviting(false);
            setAddingPerson(true);
          }}
          onTurnOn={async () => {
            await updateLink(trip.id, { enabled: true });
            await reload();
          }}
        />
      )}
      {/* Phone: the trip's sections along the bottom, always in reach of a thumb (Mike's call, 11/23),
          one pane at a time. Dialogs and sheets open in the browser's top layer, above it. */}
      <nav
        aria-label="Trip sections"
        data-testid="bottom-bar"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-foreground/10 bg-[#f4f0ea] pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgba(24,18,12,0.08)] lg:hidden"
      >
        <div className="mx-auto flex max-w-md" role="tablist">
          {(
            [
              ["itinerary", "Itinerary", CalendarDays],
              ["money", "Money", Wallet],
              ["todo", "To do", ListChecks],
              ["people", "People", Users],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              aria-label={key === "people" ? `People (${travelers.length})` : undefined}
              onClick={() => pickTab(key)}
              className="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 pb-1 pt-1.5 text-foreground"
            >
              <span className={`relative grid h-7 w-14 place-items-center rounded-full transition-colors ${tab === key ? "bg-primary text-primary-foreground shadow-md" : ""}`}>
                <Icon className="size-5" />
                {/* The head count, drawn from an attribute so the tab's text stays just "People". */}
                {key === "people" && (
                  <span
                    aria-hidden
                    data-count={travelers.length}
                    className={`absolute -top-1 right-1 min-w-4 rounded-full px-1 text-center text-[10px] font-bold leading-4 after:content-[attr(data-count)] ${tab === key ? "bg-white text-foreground" : "bg-foreground text-white"}`}
                  />
                )}
              </span>
              <span className={`font-display text-[11px] ${tab === key ? "font-bold" : "font-semibold"}`}>{label}</span>
            </button>
          ))}
        </div>
      </nav>

      {touring && (
        <Tour
          steps={tourSteps}
          onTab={setTab}
          onClose={(finished, step) => {
            setTouring(false);
            markTourSeen();
            setTab("itinerary");
            track(finished ? "tour finished" : "tour skipped", { step: step + 1, steps: tourSteps.length });
          }}
        />
      )}

      <ItemDialog
        state={dialog}
        trip={trip}
        hasCost={openItem ? costIsIn(openItem) : false}
        confirmsItself={
          openItem?.pay_mode === "own" && ownMarks.some((m) => m.item_id === openItem.id) && !costIsIn(openItem)
        }
        onConfirmCost={
          openItem && editable
            ? () => {
                track("confirm opened", { from: "plan top", kind: openItem.kind });
                setExpenseTarget({ kind: "item", item: openItem, expense: expenseByItem.get(openItem.id) });
                setDialog(null);
              }
            : undefined
        }
        stopOn={(day) => (stops.find((s) => day >= s.start_date && day < s.end_date) ?? stops[stops.length - 1])?.name ?? null}
        travelers={travelers}
        meId={meId}
        canEdit={editable}
        onImport={
          editable
            ? () => {
                setDialog(null);
                track("import opened", { from: "add a plan" });
                setImporting(true);
              }
            : undefined
        }
        extras={
          openItem && (
            <PlanPanel
              section="going"
              votes={
                votes
                  ? {
                      names: travelers.filter((t) => votes.some((v) => v.item_id === openItem.id && v.traveler_id === t.id)).map((t) => (t.id === meId ? "You" : t.name)),
                      mine: votes.some((v) => v.item_id === openItem.id && v.traveler_id === meId),
                    }
                  : null
              }
              onVote={
                meId
                  ? async (on) => {
                      await setVote(openItem.id, meId, on);
                      track(on ? "plan voted" : "plan vote removed", { kind: openItem.kind });
                      await reload();
                    }
                  : undefined
              }
              tripName={trip.name}
              item={openItem}
              travelers={travelers}
              itemPeople={itemPeople}
              meId={meId}
              expense={expenseByItem.get(openItem.id)}
              expenses={expenses}
              ownMarks={ownMarks}
              canEdit={editable}
              onPayMode={async (mode) => {
                await updateItem(openItem.id, { pay_mode: mode });
                track("plan updated", { kind: openItem.kind, status: openItem.status, who_pays: mode });
                await reload();
              }}
              onLogOwn={async (travelerId, cents, withPoints) => {
                const after = await logOwnLine(openItem.id, travelerId, cents, withPoints);
                trackOwn(openItem, travelerId, cents, withPoints, openItem.status, after);
                await reload();
              }}
              onClearOwn={async (travelerId) => {
                const after = await clearOwnLine(openItem.id, travelerId);
                if (after !== openItem.status) {
                  track("plan status changed", { kind: openItem.kind, from: openItem.status, to: after, who_pays: "own" });
                }
                await reload();
              }}
              onGoing={async (travelerId, going) => {
                await setGoing(openItem.id, travelerId, going);
                if (travelerId === meId) track(going ? "opted in" : "opted out", { kind: openItem.kind });
                await reload();
              }}
              onConfirm={() => {
                setExpenseTarget({ kind: "item", item: openItem, expense: expenseByItem.get(openItem.id) });
                setDialog(null);
              }}
            />
          )
        }
        costExtras={
          openItem && (
            <PlanPanel
              section="cost"
              tripName={trip.name}
              item={openItem}
              travelers={travelers}
              itemPeople={itemPeople}
              meId={meId}
              expense={expenseByItem.get(openItem.id)}
              expenses={expenses}
              ownMarks={ownMarks}
              canEdit={editable}
              onPayMode={async (mode) => {
                await updateItem(openItem.id, { pay_mode: mode });
                track("plan updated", { kind: openItem.kind, status: openItem.status, who_pays: mode });
                await reload();
              }}
              onLogOwn={async (travelerId, cents, withPoints) => {
                const after = await logOwnLine(openItem.id, travelerId, cents, withPoints);
                trackOwn(openItem, travelerId, cents, withPoints, openItem.status, after);
                await reload();
              }}
              onClearOwn={async (travelerId) => {
                const after = await clearOwnLine(openItem.id, travelerId);
                if (after !== openItem.status) {
                  track("plan status changed", { kind: openItem.kind, from: openItem.status, to: after, who_pays: "own" });
                }
                await reload();
              }}
              onGoing={async (travelerId, going) => {
                await setGoing(openItem.id, travelerId, going);
                if (travelerId === meId) track(going ? "opted in" : "opted out", { kind: openItem.kind });
                await reload();
              }}
              onConfirm={() => {
                setExpenseTarget({ kind: "item", item: openItem, expense: expenseByItem.get(openItem.id) });
                setDialog(null);
              }}
            />
          )
        }
        onClose={() => {
          setDialog(null);
          trackedEdit.current = null;
        }}
        onSave={async (input, existing, paid, patch) => {
          // A day just outside the trip stretches the trip first (the dialog says so before saving).
          if (input.day < trip.start_date || input.day > trip.end_date) {
            await extendTrip(trip.id, input.day);
            track("trip extended", { via: "plan", kind: input.kind, side: input.day < trip.start_date ? "before" : "after" });
          }
          if (existing) {
            // As saved last, which a save a moment ago may have changed.
            const current = items.find((i) => i.id === existing.id) ?? existing;
            await updateItem(existing.id, patch ?? input);
            if (trackedEdit.current !== existing.id) {
              track("plan updated", { kind: input.kind, status: input.status });
              trackedEdit.current = existing.id;
            }
            if ((patch ? patch.status !== undefined : true) && current.status !== input.status) {
              track("plan status changed", { kind: input.kind, from: current.status, to: input.status });
            }
          } else {
            // "Already booked and paid?" logs the one bill, or your own line, in the same step.
            await createPlan(input, paid, "form");
          }
          await reload();
        }}
        onDelete={async (item) => {
          await deleteItem(item.id);
          await reload();
        }}
      />
      {moveNote && (
        <div
          role="status"
          data-testid="move-note"
          className="glass-card-solid fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl px-4 py-3 text-sm shadow-xl lg:bottom-4"
        >
          <p className="min-w-0 flex-1 text-foreground">{moveNote.text}</p>
          {moveNote.undo && (
            <button type="button" onClick={moveNote.undo} className="shrink-0 font-semibold text-foreground underline underline-offset-4">
              Undo
            </button>
          )}
          <button type="button" onClick={() => setMoveNote(null)} className="shrink-0 text-xs text-muted-foreground" aria-label="Close">
            Close
          </button>
        </div>
      )}
      {editable && described && (
        <ImportDialog
          key="described"
          open
          initial={described}
          heading="Plans from your description"
          trip={trip}
          items={items}
          onClose={() => setDescribed(null)}
          onExtend={async (day) => {
            await extendTrip(trip.id, day);
            track("trip extended", { via: "description", side: day < trip.start_date ? "before" : "after" });
            await reload();
          }}
          onSave={(kept) => saveImported(kept, "description")}
          onDone={(result, keptCount) => track("described plans reviewed", { plans_proposed: result.plans.length, plans_kept: keptCount })}
          questions={described.questions}
          onQuestions={(parked) => {
            // The questions left ticked wait on the To do list of the person who described the trip.
            track("described questions parked", { asked: described.questions.length, parked: parked.length });
            if (!parked.length || !meId) return;
            Promise.all(parked.map((q) => addAction(trip.id, q, meId, null)))
              .then(reload)
              .catch((e: Error) => setError(e.message));
          }}
        />
      )}
      {editable && (
        <AiChoiceDialog
          open={choosingAi}
          onClose={() => setChoosingAi(false)}
          onPick={(choice) => {
            setChoosingAi(false);
            track("ai help opened", { choice });
            if (choice === "bookings") setImporting(true);
            else setPlanning(true);
          }}
        />
      )}
      {editable && (
        <ImportDialog
          key={`import-${parkNonce}`}
          open={importing}
          trip={trip}
          items={items}
          onClose={() => setImporting(false)}
          onPark={(n) => setParked((p) => ({ ...p, bookings: n }))}
          onExtend={async (day) => {
            await extendTrip(trip.id, day);
            track("trip extended", { via: "import", side: day < trip.start_date ? "before" : "after" });
            await reload();
          }}
          onSave={saveImported}
          forward={<ForwardAddress ready={inboxReady} getAddress={inboxAddressHere} resetAddress={resetInboxHere} />}
          onDone={(result, keptCount) =>
            track("ai import", {
              plans_proposed: result.plans.length,
              plans_kept: keptCount,
              cost_usd: result.usage.cost_usd,
              searches: result.usage.searches,
              model: result.usage.model,
              effort: result.usage.effort,
              latency_ms: result.usage.latency_ms,
            })
          }
        />
      )}
      {editable && reviewingInbox && (
        <ImportDialog
          key={reviewingInbox.id}
          open
          initial={{
            plans: reviewingInbox.plans,
            note: reviewingInbox.note,
            call_id: reviewingInbox.call_id,
            usage: { cost_usd: 0, searches: 0, input_tokens: 0, output_tokens: 0, latency_ms: 0, model: "", effort: "" },
          }}
          heading={inboxHeading(reviewingInbox, travelers)}
          trip={trip}
          items={items}
          onClose={() => setReviewingInbox(null)}
          onExtend={async (day) => {
            await extendTrip(trip.id, day);
            track("trip extended", { via: "email", side: day < trip.start_date ? "before" : "after" });
            await reload();
          }}
          onSave={async (kept) => {
            await saveImported(kept, "email");
            await markInbox(reviewingInbox.id, "saved");
            await reload();
          }}
          onDone={(result, keptCount) => track("inbox reviewed", { plans_proposed: result.plans.length, plans_kept: keptCount })}
        />
      )}
      {editable && (
        <PlanWithAiDialog
          key={`plan-${parkNonce}`}
          open={planning}
          trip={trip}
          onClose={() => setPlanning(false)}
          onPark={(n) => setParked((p) => ({ ...p, ideas: n }))}
          onSave={async (kept) => {
            // Ideas come in as Suggested, with why and where they were found in the notes.
            for (const idea of kept) {
              await createPlan(
                {
                  kind: idea.kind,
                  title: idea.title,
                  day: idea.day,
                  part: idea.part,
                  end_day: null,
                  location: idea.location,
                  notes: [idea.why, `Found on: ${idea.source_url}`].filter(Boolean).join("\n"),
                  status: "suggested",
                  est_cents: idea.est_cents,
                  cost_type: idea.est_cents != null ? "per_person" : "total",
                },
                undefined,
                "ai plan",
              );
            }
            await reload();
          }}
          onDone={(result, keptCount) =>
            track("ai plan", {
              ideas_proposed: result.suggestions.length,
              ideas_kept: keptCount,
              dropped_by_code: result.dropped,
              cost_usd: result.usage.cost_usd,
              searches: result.usage.searches,
              model: result.usage.model,
              effort: result.usage.effort,
              latency_ms: result.usage.latency_ms,
            })
          }
        />
      )}
      <ExpenseDialog
        target={expenseTarget}
        trip={trip}
        travelers={travelers}
        itemPeople={itemPeople}
        meId={meId}
        onClose={() => setExpenseTarget(null)}
        onSubmit={async (target, input) => {
          if (target.kind === "item") {
            await confirmItem(target.item.id, input.total, input.paidBy, input.mode, input.shares, travelers.map((t) => t.id));
            if (input.foreign || target.expense?.currency) {
              await markForeign(await expenseIdForItem(target.item.id), input.foreign, target.expense, target.item.title, input.paidBy, input.total);
            }
            track(target.expense ? "plan updated" : "plan confirmed", {
              kind: target.item.kind,
              split: input.mode,
              people: input.shares.length,
              from_status: target.item.status,
              who_pays: "split",
            });
            if (!target.expense) {
              track("plan status changed", { kind: target.item.kind, from: target.item.status, to: "confirmed", who_pays: "split" });
            }
          } else {
            const id = await saveExpense(trip.id, target.expense?.id ?? null, input.description, input.day, input.total, input.paidBy, input.mode, input.shares);
            await markForeign(id ?? target.expense?.id ?? null, input.foreign, target.expense, input.description.trim(), input.paidBy, input.total);
            if (!target.expense) track("expense added", { split: input.mode, people: input.shares.length });
          }
          await reload();
        }}
        onUndo={async (item) => {
          await unconfirmItem(item.id);
          track("plan status changed", { kind: item.kind, from: "confirmed", to: "planned", who_pays: "split" });
          await reload();
        }}
        onDelete={async (e) => {
          await deleteExpense(e.id);
          await reload();
        }}
      />
      <TripSettingsDialog
        open={settingsOpen}
        trip={trip}
        stops={stops}
        onClose={() => setSettingsOpen(false)}
        onSave={async (name, newStops) => {
          // Say which plans are in the way, rather than only that some are.
          const start = newStops.map((s) => s.start_date).sort()[0];
          const end = newStops.map((s) => s.end_date).sort().reverse()[0];
          const blocking = start && end ? plansOutside(items, start, end) : [];
          if (blocking.length > 0) {
            const named = blocking.slice(0, 4).map((i) => `${i.title} (${longDay(i.day)})`);
            const more = blocking.length > 4 ? ` and ${blocking.length - 4} more` : "";
            throw new Error(`These plans fall outside the new dates: ${named.join(", ")}${more}. Move or remove them first, or keep the dates wider.`);
          }
          await updateTrip(trip.id, name, newStops);
          await reload();
        }}
        onDelete={async () => {
          await deleteTrip(trip.id);
          navigate("/trips", { replace: true });
        }}
      />
      <SettleDialog
        open={settling}
        transfers={transfers}
        travelers={travelers}
        meId={meId}
        canEdit={editable}
        tripName={trip.name}
        paymentsReady={paymentsReady}
        zelleReady={zelleReady}
        onRecord={(prefill) => {
          setSettling(false);
          setPaymentTarget(prefill);
        }}
        onSaveMyPay={(v, z) => saveMyPay(v, z, "settle up")}
        onSaveVenmoFor={async (travelerId, handle) => {
          await setVenmoFor(travelerId, handle);
          track("venmo added", { whose: "someone else" });
          await reload();
        }}
        onClose={() => setSettling(false)}
      />
      <RecordPaymentDialog
        prefill={paymentTarget}
        travelers={travelers}
        meId={meId}
        canEdit={editable}
        onClose={() => setPaymentTarget(null)}
        onSave={async (draft) => {
          await recordPayment(trip.id, draft);
          track("payment recorded", { method: draft.method, from_settle_up: Boolean(paymentTarget?.cents) });
          await reload();
          setPaymentTarget(null);
          setSettling(true);
        }}
      />
      <PayInfoDialog
        open={editingPay}
        me={me}
        zelleReady={zelleReady}
        onSave={(v, z) => saveMyPay(v, z, "people")}
        onClose={() => setEditingPay(false)}
      />
      <VenmoForDialog
        person={venmoFor}
        zelleReady={zelleReady}
        onSave={async (travelerId, venmo, zelle) => {
          if (zelleReady) await setPayFor(travelerId, venmo, zelle);
          else await setVenmoFor(travelerId, venmo);
          track("venmo added", { whose: "someone else", where: "people", has_zelle: Boolean(zelle.trim()) });
          await reload();
        }}
        onClose={() => setVenmoForPerson(null)}
      />
      <AddPersonDialog
        open={addingPerson}
        defaultRole={link?.default_role ?? "owner"}
        canInvite={Boolean(link?.enabled)}
        zelleReady={zelleReady}
        onClose={() => setAddingPerson(false)}
        onAdd={async (p, invite) => {
          const added = await addTraveler(trip.id, p);
          track("person added", { method: "direct", role: p.role, has_email: Boolean(p.email.trim()), has_phone: Boolean(p.phone.trim()), has_venmo: Boolean(p.venmo?.trim()), has_zelle: Boolean(p.zelle?.trim()), invited: invite });
          let note: string | null = null;
          if (invite) {
            const r = await sendInviteEmail(trip.id, added.id);
            track("invite emailed", { ok: r.ok, when: "added", ...(r.ok ? {} : { code: r.code }) });
            note = r.ok ? "We emailed them their invite." : `Their invite didn't go out: ${r.error}`;
          }
          await reload();
          return note;
        }}
      />
    </div>
  );
}

/** "From Vic's email", for import's review of what an email brought in. */
function inboxHeading(item: InboxItem, travelers: Traveler[]): string {
  const who = travelers.find((t) => t.id === item.from_traveler)?.name;
  return who ? `From ${who}'s email` : "From an email";
}

/** A to-do's title, kept to the 140 characters a to-do holds by shortening the plan's name. */
function todoTitle(before: string, plan: string, after: string): string {
  const room = 140 - before.length - after.length;
  const name = plan.length > room ? `${plan.slice(0, Math.max(1, room - 3)).trimEnd()}...` : plan;
  return `${before}${name}${after}`;
}
