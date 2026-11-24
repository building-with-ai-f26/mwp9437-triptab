/**
 * AI import, on the app's side: turning a proposal from the import-bookings function into a
 * draft the Owner reviews, spotting likely duplicates, and saying what still blocks saving one.
 * Pure functions, tested offline. Nothing here saves anything: the review step does.
 */
import { addDays, canExtendTo, defaultPayMode, dollars, longDay, nightsBetween, PARTS, partOfEndTime, type DayPart, type Item, type ItemKind, type ItemStatus, type PayMode, type Trip } from "./model";
import type { UsdRate } from "./rates";

/** A proposed plan, as the Edge Function returns it (supabase/functions/import-bookings/rules.ts). */
export interface Proposal {
  kind: ItemKind;
  title: string;
  day: string | null;
  part: DayPart | null;
  end_day: string | null;
  depart_time: string | null;
  arrive_time: string | null;
  times_from: "input" | "lookup" | null;
  source_url: string | null;
  location: string | null;
  confirmation_code: string | null;
  cost_cents: number | null;
  currency: string | null;
  cost_is_per_person: boolean;
  who_pays: PayMode;
  paid: boolean;
  unsure: string[];
  /** The booking's or listing's page, as written in the input (C32). Import only. */
  link?: string | null;
  /** A listing's headline or description as written: it goes in Notes, not Where (C32). */
  details?: string | null;
  /** Paid wholly or partly with miles or points (T8): the cost is only the cash part. */
  with_points?: boolean;
  /** The price paid in parts, as the booking shows it (T7), in the price's currency. */
  payment_schedule?: { amount_cents: number; due_day: string | null; paid: boolean }[];
}

export interface ImportUsage {
  cost_usd: number;
  searches: number;
  input_tokens: number;
  output_tokens: number;
  latency_ms: number;
  model: string;
  effort: string;
}

export interface ImportResult {
  plans: Proposal[];
  note: string | null;
  call_id: string | null;
  usage: ImportUsage;
}

/** One proposal in the review list: what the Owner can edit, and whether they're keeping it. */
export interface Draft {
  keep: boolean;
  kind: ItemKind;
  title: string;
  /** Empty when the proposal's day is missing or outside the trip: the Owner picks one. */
  day: string;
  part: DayPart;
  /** The last part of the day it runs through, when the Owner picks several (11/19); null for one. */
  end_part: DayPart | null;
  end_day: string;
  /** Dollars as typed; empty for no cost. */
  cost: string;
  perPerson: boolean;
  payMode: PayMode;
  paid: boolean;
  location: string;
  /** The booking's or listing's page (C32): saved as the plan's Link. */
  link: string;
  notes: string;
  /** Fields to mark "check this". */
  unsure: string[];
  /** Why it starts unticked or needs a look, in the Owner's words. */
  warnings: string[];
  /** The title of a plan already on the trip that this looks like. */
  duplicateOf: string | null;
  /**
   * That plan: kept, the draft fills in what it's missing instead of adding a second one (C25,
   * Mike's call 11/21).
   */
  mergeInto: Item | null;
  /** A price in another currency, as found (C28): converted to dollars at the day's rate for review. */
  foreign: { currency: string; cents: number } | null;
  /** The rate the cost was converted at, once looked up. */
  converted: UsdRate | null;
  /**
   * A leg whose fare is on another plan (C26, Mike's call 11/21: a round trip is two plans and one
   * expense): which draft on the review carries the one fare.
   */
  fareOn: number | null;
  /** That leg's title, filled in when the review is saved. */
  fareTitle?: string;
  /** A day just outside the trip that the trip can be extended to in one tap (the proposal's day). */
  extendTo: string | null;
  source: Proposal;
}

const FLIGHT_NO = /\b([A-Z]{2}|[A-Z]\d|\d[A-Z])\s?(\d{1,4})\b/;
const flightNo = (s: string) => {
  const m = s.toUpperCase().match(FLIGHT_NO);
  return m ? `${m[1]}${Number(m[2])}` : null;
};
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * A name that says what kind of plan it is but not which one: "Airbnb", "Hotel", "Flight home",
 * "Rental car (TBD)". Someone put it on the trip before the booking was made (C34, Mike's call
 * 11/21: the chalet merged into a plan called Airbnb). Kept short on purpose: a name with anything
 * of its own in it ("Ski chalet in Chamonix") is someone's choice and stays.
 */
const GENERAL_NAMES = new Set([
  "airbnb", "vrbo", "booking com", "hotel", "hostel", "lodging", "accommodation", "accommodations", "stay", "place to stay",
  "where we stay", "apartment", "house", "rental", "villa", "chalet", "condo", "cabin", "flight", "flights", "flight out",
  "flight there", "flight home", "flight back", "outbound flight", "return flight", "car", "rental car", "car rental", "train",
  "bus", "ferry", "transfer", "shuttle", "taxi", "transport", "dinner", "lunch", "breakfast", "brunch", "restaurant", "meal",
  "activity", "tickets", "tour",
]);
const FILLER = /\b(tbd|tba|tbc|placeholder|to book|maybe|our|the|a)\b/g;
export function isGeneralName(title: string): boolean {
  const n = norm(title).replace(FILLER, " ").replace(/\s+/g, " ").trim();
  return n === "" || GENERAL_NAMES.has(n);
}

/** The name a merge gives the plan already on the trip: the booking's, when that plan's is general (C34); else null, and it keeps its own. */
export function mergedTitle(existingTitle: string, incomingTitle: string | null | undefined): string | null {
  const next = (incomingTitle ?? "").trim();
  if (!next || !isGeneralName(existingTitle) || norm(next) === norm(existingTitle)) return null;
  return next;
}

/** A plan already on the trip that a proposal looks like: the same flight that day, the same stay dates, or the same name that day. */
export function possibleDuplicate(p: Pick<Proposal, "kind" | "title" | "day" | "end_day">, items: Item[]): Item | null {
  for (const it of items) {
    if (it.kind !== p.kind || !p.day || it.day !== p.day) continue;
    if (p.kind === "flight") {
      const a = flightNo(p.title);
      if (a ? a === flightNo(it.title) : norm(it.title) === norm(p.title)) return it;
    } else if (p.kind === "stay") {
      if (!p.end_day || it.end_day === p.end_day) return it;
    } else if (norm(it.title) === norm(p.title)) return it;
  }
  return null;
}

/** Times and the confirmation code go in the plan's notes, with where looked-up times came from. */
export function notesFor(p: Proposal): string {
  const lines: string[] = [];
  // A listing's headline ("4*, central, hot tub") is worth keeping, but not as the address (C32).
  if (p.details) lines.push(p.details);
  if (p.depart_time || p.arrive_time) {
    const lands = p.kind === "flight" && p.end_day && p.day && p.end_day > p.day ? ` on ${longDay(p.end_day)}` : "";
    const times = [p.depart_time && `Departs ${p.depart_time}`, p.arrive_time && `arrives ${p.arrive_time}${lands}`].filter(Boolean).join(", ");
    lines.push(p.times_from === "lookup" ? `${times} (looked up, check against your booking: ${p.source_url})` : times);
  }
  if (p.confirmation_code) lines.push(`Confirmation: ${p.confirmation_code}`);
  return lines.join("\n");
}

const partFromTime = (time: string | null): DayPart | null => {
  if (!time) return null;
  const h = Number(time.slice(0, 2));
  return h < 12 ? "morning" : h < 17 ? "day" : h < 21 ? "evening" : "night";
};

const travels = (kind: Item["kind"]) => kind === "flight" || kind === "transport";

/** Turns a proposal into a review draft for this trip. */
export function toDraft(p: Proposal, trip: Pick<Trip, "start_date" | "end_date">, items: Item[]): Draft {
  const warnings: string[] = [];
  const inTrip = Boolean(p.day && p.day >= trip.start_date && p.day <= trip.end_date);
  const extendTo = p.day && !inTrip && canExtendTo(trip, p.day) ? p.day : null;
  if (!p.day) warnings.push("No day found. Pick one.");
  else if (extendTo) {
    warnings.push(
      `${longDay(extendTo)} is ${extendTo < trip.start_date ? "before" : "after"} the trip (${longDay(trip.start_date)} to ${longDay(trip.end_date)}). Add that day to the trip, or pick a day in it.`,
    );
  } else if (!inTrip) {
    warnings.push(
      `${longDay(p.day)} is outside the trip's dates (${longDay(trip.start_date)} to ${longDay(trip.end_date)}). Pick a day in the trip, or change the trip's dates in settings first.`,
    );
  }
  const day = inTrip ? (p.day as string) : "";
  let end_day = "";
  if (p.kind === "stay") {
    const last = addDays(trip.end_date, 1);
    if (p.end_day && day && p.end_day > day && p.end_day <= last) end_day = p.end_day;
    else {
      if (day) end_day = addDays(day, 1);
      warnings.push(p.end_day ? `Check-out ${longDay(p.end_day)} doesn't fit the trip. Pick one.` : "No check-out day found. Pick one.");
    }
  }
  const usd = p.currency === "USD" || (p.cost_cents != null && !p.currency);
  if (p.cost_cents != null && !p.currency) warnings.push("No currency was found for this price. Check that it's in US dollars before saving.");
  if (p.kind === "flight" && !p.depart_time && !p.arrive_time) warnings.push("No times found. Add times in the notes once you have them.");
  if (p.times_from === "lookup") warnings.push("Times were looked up, not in what you pasted. Check them against your booking.");
  const dup = possibleDuplicate(p, items);
  const part: DayPart = p.part ?? partFromTime(p.depart_time) ?? "day";
  // A same-day flight or transfer shows the parts it covers on the card: 11:00 to 14:15 is Morning and Day.
  const lastPart = travels(p.kind) && p.arrive_time && (!p.end_day || p.end_day === p.day) ? partOfEndTime(p.arrive_time) : null;
  const sameDayEnd = lastPart && PARTS.indexOf(lastPart) > PARTS.indexOf(part) ? lastPart : null;
  const ready = Boolean(day) && (p.kind !== "stay" || warnings.every((w) => !w.includes("check-out") && !w.includes("Check-out")));
  return {
    // A match is merged into the plan already on the trip (C25), so it starts ticked too.
    keep: ready,
    kind: p.kind,
    title: p.title,
    day,
    part,
    end_part: sameDayEnd,
    end_day,
    cost: p.cost_cents != null && usd ? String(p.cost_cents / 100) : "",
    perPerson: p.cost_is_per_person,
    payMode: p.who_pays ?? defaultPayMode(p.kind),
    // Paid with no amount found is fine: the amount comes later, as a to-do (C27).
    paid: p.paid,
    location: p.location ?? "",
    link: p.link ?? "",
    notes: notesFor(p),
    unsure: [...p.unsure],
    warnings,
    duplicateOf: dup?.title ?? null,
    mergeInto: dup,
    foreign: p.cost_cents != null && p.currency && p.currency !== "USD" ? { currency: p.currency, cents: p.cost_cents } : null,
    converted: null,
    fareOn: null,
    extendTo,
    source: p,
  };
}

/** Where a reviewed plan goes on the timeline, and its times: what the save step writes. */
export interface DraftPlacement {
  day: string;
  part: DayPart;
  end_day: string | null;
  end_part: DayPart | null;
  start_time: string | null;
  end_time: string | null;
}

/**
 * T1 (Mike's 11/23 ski trip test): the times on the confirmation are the plan's times, whatever
 * the review card does to the day. Moving the departure day moves the arrival day by as many days
 * and keeps both clock times; an overnight flight's arrival part comes from its arrival time on the
 * arrival day, not from the parts picked on the card (those are the departure day's). Before this,
 * a 7:25 AM landing saved as "Lands in the: Night", and a flight whose day changed lost its times.
 */
export function draftPlacement(d: Draft, trip: Pick<Trip, "start_date" | "end_date">): DraftPlacement {
  if (d.kind === "stay") return { day: d.day, part: "night", end_day: d.end_day || null, end_part: null, start_time: null, end_time: null };
  const p = d.source;
  const travel = travels(d.kind);
  const shift = p.day && d.day ? nightsBetween(p.day, d.day) : 0;
  // The booking's last day (a flight's arrival, an activity's last day), moved with the departure.
  let end_day: string | null = p.end_day && p.day && p.end_day > p.day ? addDays(p.end_day, shift) : null;
  // A rental car's return day isn't an arrival: only a transfer with an arrival time runs on.
  if (d.kind === "transport" && !p.arrive_time) end_day = null;
  const limit = travel ? addDays(trip.end_date, 1) : trip.end_date;
  const overnightBooking = end_day != null;
  if (end_day && end_day > limit) end_day = null;
  const start_time = travel ? p.depart_time : null;
  // An overnight arrival that no longer fits the trip keeps no landing time: it would read as the same day.
  const end_time = travel && !(overnightBooking && !end_day) ? p.arrive_time : null;
  let end_part: DayPart | null;
  if (travel && end_day) end_part = end_time ? partOfEndTime(end_time) : null;
  // A same-day landing time sets its part too; the card's picks count only when there's no time.
  else if (travel) end_part = end_time ? partOfEndTime(end_time) : d.end_part;
  else end_part = d.end_part;
  // On one day, an end part at or before the start part is no span at all.
  if (end_part && !end_day && PARTS.indexOf(end_part) <= PARTS.indexOf(d.part)) end_part = null;
  return { day: d.day, part: d.part, end_day, end_part, start_time, end_time };
}

/** The cost a draft carries, in cents, or null when it has none (or it isn't a number). */
export function draftCents(d: Pick<Draft, "cost">): number | null {
  const typed = d.cost.trim() === "" ? null : Number(d.cost.replace(/[$,\s]/g, ""));
  return typed == null || Number.isNaN(typed) || typed < 0 ? null : Math.round(typed * 100);
}

/** What stops a kept draft from being saved; empty when it's ready. */
export function draftProblems(d: Draft, trip: Pick<Trip, "start_date" | "end_date">): string[] {
  const out: string[] = [];
  if (!d.title.trim()) out.push("Give it a name.");
  if (!d.day || d.day < trip.start_date || d.day > trip.end_date) out.push("Pick a day inside the trip.");
  if (d.kind === "stay" && (!d.end_day || d.end_day <= d.day)) out.push("Pick a check-out day after check-in.");
  if (d.cost.trim() !== "" && draftCents(d) == null) out.push("Type the cost as a number, like 420.");
  return out;
}

/**
 * A foreign price still at the day's converted estimate (C28): pending until whoever paid checks the
 * card. A dollar amount typed over it is the real charge, and isn't.
 */
export function atEstimate(d: Pick<Draft, "foreign" | "converted" | "cost">): boolean {
  if (!d.foreign || !d.converted) return false;
  return draftCents(d) === Math.round(d.foreign.cents * d.converted.rate);
}

/** Paid, with the amount to come: it saves as Confirmed and the payer gets a to-do (C27). Not a leg on another's fare. */
export const costToCome = (d: Pick<Draft, "paid" | "cost" | "fareOn">): boolean => d.paid && draftCents(d) == null && d.fareOn == null;

/**
 * Legs of one booking with one fare (C26): flights or transfers kept on the review with no cost of
 * their own and not already on another leg's fare. Two or more, in trip order.
 */
export function sharedFareLegs(drafts: Draft[]): number[] {
  const legs = drafts
    .map((d, i) => ({ d, i }))
    .filter(({ d }) => d.keep && (d.kind === "flight" || d.kind === "transport") && d.cost.trim() === "" && d.fareOn == null)
    .sort((a, b) => (a.d.day || "9999").localeCompare(b.d.day || "9999"));
  return legs.length >= 2 ? legs.map(({ i }) => i) : [];
}

/** Puts one fare on the first leg, and marks the others as on it (C26). */
export function oneFare(drafts: Draft[], legs: number[], totalCents: number): Draft[] {
  if (legs.length < 2) return drafts;
  const [first, ...rest] = legs;
  const carrier = drafts[first];
  const others = rest.map((i) => drafts[i].title);
  return drafts.map((d, i) => {
    if (i === first) {
      const line = `One fare for the round trip, with ${others.join(" and ")}.`;
      return { ...d, cost: String(totalCents / 100), perPerson: false, notes: [d.notes, line].filter(Boolean).join("\n") };
    }
    if (rest.includes(i)) return { ...d, cost: "", fareOn: first, paid: carrier.paid };
    return d;
  });
}

/** The one dollar amount an import's note names ("the $992.39 total covers both flights"), or null. */
export function noteTotalCents(note: string | null | undefined): number | null {
  const found = new Set([...String(note ?? "").matchAll(/\$\s?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/g)].map((m) => Math.round(Number(m[1].replace(/,/g, "")) * 100)));
  return found.size === 1 ? [...found][0] : null;
}

const STATUS_RANK: Record<ItemStatus, number> = { suggested: 0, planned: 1, confirmed: 2 };

/**
 * What a merged draft adds to a plan already on the trip: only what that plan is missing (C25), and
 * the booking's name in place of a general one (C34). Cost and paid stay as that plan has them.
 */
export interface PlanFields {
  title?: string;
  location: string | null;
  link?: string | null;
  notes: string | null;
  start_time?: string | null;
  end_time?: string | null;
  end_day: string | null;
  end_part?: DayPart | null;
  est_cents: number | null;
  status: ItemStatus;
}
export function mergePatch(existing: Item, incoming: PlanFields): Partial<PlanFields> {
  const patch: Partial<PlanFields> = {};
  const title = mergedTitle(existing.title, incoming.title);
  if (title) patch.title = title;
  if (!existing.location && incoming.location) patch.location = incoming.location;
  if (!existing.link && incoming.link) patch.link = incoming.link;
  if (!existing.start_time && incoming.start_time) patch.start_time = incoming.start_time;
  if (!existing.end_time && incoming.end_time) patch.end_time = incoming.end_time;
  if (existing.kind !== "stay" && !existing.end_day && incoming.end_day) patch.end_day = incoming.end_day;
  if (existing.kind !== "stay" && !existing.end_part && incoming.end_part) patch.end_part = incoming.end_part;
  const had = (existing.notes ?? "").split("\n").map((l) => l.trim());
  const added = (incoming.notes ?? "").split("\n").map((l) => l.trim()).filter((l) => l && !had.includes(l));
  if (added.length) patch.notes = [existing.notes?.trim(), ...added].filter(Boolean).join("\n");
  if (existing.est_cents == null && incoming.est_cents != null && existing.status !== "confirmed") patch.est_cents = incoming.est_cents;
  if (STATUS_RANK[incoming.status] > STATUS_RANK[existing.status]) patch.status = incoming.status;
  return patch;
}

/** The cost of one import, shown to the Owner: "$0.0012", or "$0.03" from a cent up. */
export const usdCost = (n: number): string => (n >= 0.01 ? dollars(Math.round(n * 100)) : `$${n.toFixed(4)}`);
