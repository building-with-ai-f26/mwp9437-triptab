/**
 * AI import, on the app's side: turning a proposal from the import-bookings function into a
 * draft the Owner reviews, spotting likely duplicates, and saying what still blocks saving one.
 * Pure functions, tested offline. Nothing here saves anything: the review step does.
 */
import { addDays, defaultPayMode, dollars, longDay, type DayPart, type Item, type ItemKind, type PayMode, type Trip } from "./model";

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
  end_day: string;
  /** Dollars as typed; empty for no cost. */
  cost: string;
  perPerson: boolean;
  payMode: PayMode;
  paid: boolean;
  location: string;
  notes: string;
  /** Fields to mark "check this". */
  unsure: string[];
  /** Why it starts unticked or needs a look, in the Owner's words. */
  warnings: string[];
  /** The title of a plan already on the trip that this looks like. */
  duplicateOf: string | null;
  source: Proposal;
}

const FLIGHT_NO = /\b([A-Z]{2}|[A-Z]\d|\d[A-Z])\s?(\d{1,4})\b/;
const flightNo = (s: string) => {
  const m = s.toUpperCase().match(FLIGHT_NO);
  return m ? `${m[1]}${Number(m[2])}` : null;
};
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

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

/** Turns a proposal into a review draft for this trip. */
export function toDraft(p: Proposal, trip: Pick<Trip, "start_date" | "end_date">, items: Item[]): Draft {
  const warnings: string[] = [];
  const inTrip = Boolean(p.day && p.day >= trip.start_date && p.day <= trip.end_date);
  if (!p.day) warnings.push("No day found. Pick one.");
  else if (!inTrip) {
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
  if (p.cost_cents != null && p.currency && p.currency !== "USD") {
    warnings.push(`Priced in ${p.currency} ${(p.cost_cents / 100).toFixed(2)}. TripTab keeps the tab in US dollars: enter what your card was charged.`);
  }
  if (p.kind === "flight" && !p.depart_time && !p.arrive_time) warnings.push("No times found. Add times in the notes once you have them.");
  if (p.times_from === "lookup") warnings.push("Times were looked up, not in what you pasted. Check them against your booking.");
  const dup = possibleDuplicate(p, items);
  const ready = Boolean(day) && (p.kind !== "stay" || warnings.every((w) => !w.includes("check-out") && !w.includes("Check-out")));
  return {
    keep: !dup && ready,
    kind: p.kind,
    title: p.title,
    day,
    part: p.part ?? partFromTime(p.depart_time) ?? "day",
    end_day,
    cost: p.cost_cents != null && usd ? String(p.cost_cents / 100) : "",
    perPerson: p.cost_is_per_person,
    payMode: p.who_pays ?? defaultPayMode(p.kind),
    paid: p.paid && usd && p.cost_cents != null,
    location: p.location ?? "",
    notes: notesFor(p),
    unsure: [...p.unsure],
    warnings,
    duplicateOf: dup?.title ?? null,
    source: p,
  };
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
  if (d.paid && draftCents(d) == null) out.push("Enter what was paid, or untick Paid.");
  return out;
}

/** The cost of one import, shown to the Owner: "$0.0012", or "$0.03" from a cent up. */
export const usdCost = (n: number): string => (n >= 0.01 ? dollars(Math.round(n * 100)) : `$${n.toFixed(4)}`);
