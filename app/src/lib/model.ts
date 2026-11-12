/**
 * TripTab's data model, mirroring the Supabase tables (supabase/migrations).
 * Rule from the spring post-mortem: ONE record per itinerary item, carrying its status.
 * Dates are ISO strings (YYYY-MM-DD); money is whole cents.
 */

export type Role = "owner" | "viewer";
export type ItemStatus = "suggested" | "planned" | "confirmed";
export type ItemKind = "activity" | "meal" | "transport" | "flight" | "stay";
export type DayPart = "morning" | "day" | "evening" | "night";
export type CostType = "total" | "per_person";

export interface Trip {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  created_by: string | null;
  created_at: string;
}

export interface Stop {
  id: string;
  trip_id: string;
  name: string;
  start_date: string;
  end_date: string;
  position: number;
}

export interface Traveler {
  id: string;
  trip_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  /** The signed-in account that claimed this spot; null until they join. */
  user_id: string | null;
  claimed_at: string | null;
  created_at: string;
}

export interface Item {
  id: string;
  trip_id: string;
  kind: ItemKind;
  title: string;
  /** The day it happens; for a stay, the check-in day. */
  day: string;
  part: DayPart;
  /** Stays only: the check-out day (after the last night). */
  end_day: string | null;
  location: string | null;
  notes: string | null;
  status: ItemStatus;
  /** Rough cost while suggested or planned. */
  est_cents: number | null;
  cost_type: CostType;
  created_by: string | null;
  created_at: string;
}

export interface GroupLink {
  trip_id: string;
  token: string;
  default_role: Role;
  enabled: boolean;
}

export const PARTS: DayPart[] = ["morning", "day", "evening", "night"];
export const PART_LABEL: Record<DayPart, string> = { morning: "Morning", day: "Day", evening: "Evening", night: "Night" };
export const KIND_LABEL: Record<ItemKind, string> = {
  activity: "Activity",
  meal: "Meal",
  transport: "Transport",
  flight: "Flight",
  stay: "Stay",
};
export const STATUS_LABEL: Record<ItemStatus, string> = {
  suggested: "Suggested",
  planned: "Planned",
  confirmed: "Confirmed",
};
export const ROLE_LABEL: Record<Role, string> = { owner: "Owner", viewer: "Viewer" };

// ---------- Dates ----------

const DAY_MS = 24 * 60 * 60 * 1000;
const toUtc = (iso: string) => new Date(`${iso}T00:00:00Z`);
const toIso = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(iso: string, n: number): string {
  const d = toUtc(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toIso(d);
}

/** Every date from start to end, inclusive. */
export function tripDays(start: string, end: string): string[] {
  const days: string[] = [];
  for (let d = start; d <= end && days.length < 400; d = addDays(d, 1)) days.push(d);
  return days;
}

export function nightsBetween(start: string, end: string): number {
  return Math.round((toUtc(end).getTime() - toUtc(start).getTime()) / DAY_MS);
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Day chip: the actual day, "Thu" over "2/5" (vision: not "Day 1"). */
export function dayChip(iso: string): { weekday: string; date: string } {
  const d = toUtc(iso);
  return { weekday: WEEKDAYS[d.getUTCDay()], date: `${d.getUTCMonth() + 1}/${d.getUTCDate()}` };
}

/** "Thu, Feb 5" */
export function longDay(iso: string): string {
  const d = toUtc(iso);
  return `${WEEKDAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** "Feb 5 to 16, 2027" or "Jan 30 to Feb 2, 2027" */
export function dateRange(start: string, end: string): string {
  const s = toUtc(start);
  const e = toUtc(end);
  const sm = MONTHS[s.getUTCMonth()];
  const em = MONTHS[e.getUTCMonth()];
  const year = e.getUTCFullYear();
  if (start === end) return `${sm} ${s.getUTCDate()}, ${year}`;
  if (sm === em && s.getUTCFullYear() === year) return `${sm} ${s.getUTCDate()} to ${e.getUTCDate()}, ${year}`;
  return `${sm} ${s.getUTCDate()} to ${em} ${e.getUTCDate()}, ${year}`;
}

// ---------- Roles ----------

/** Owners change the trip; viewers see it and opt in or out (vision, "Inviting people"). */
export const canEdit = (role: Role | null | undefined): boolean => role === "owner";

// ---------- Money labels ----------

export function dollars(cents: number): string {
  const whole = cents % 100 === 0;
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Suggested and planned show "~$25 est."; confirmed shows the exact amount (spring EditablePrice.tsx). */
export function priceLabel(
  item: Pick<Item, "status" | "est_cents" | "cost_type" | "kind">,
  exactCents?: number | null,
): string | null {
  if (item.status === "confirmed") return exactCents == null ? null : dollars(exactCents);
  if (item.est_cents == null || item.est_cents <= 0) return null;
  const per = item.kind === "stay" ? "" : item.cost_type === "per_person" ? " pp" : "";
  return `~${dollars(item.est_cents)}${per} est.`;
}

// ---------- Validation ----------

export interface StopDraft {
  name: string;
  start_date: string;
  end_date: string;
}

/** A trip runs from its earliest stop's start to its latest stop's end. */
export function tripSpan(stops: StopDraft[]): { start: string; end: string } {
  const start = stops.reduce((m, s) => (s.start_date < m ? s.start_date : m), stops[0].start_date);
  const end = stops.reduce((m, s) => (s.end_date > m ? s.end_date : m), stops[0].end_date);
  return { start, end };
}

/** Checks a new trip's name and stops; returns a list of problems (empty when it's fine). */
export function validateTrip(name: string, stops: StopDraft[]): string[] {
  const errors: string[] = [];
  if (!name.trim()) errors.push("Give the trip a name.");
  if (name.trim().length > 120) errors.push("Keep the trip name under 120 characters.");
  if (stops.length === 0) errors.push("Add at least one stop with dates.");
  stops.forEach((s, i) => {
    const label = s.name.trim() || `Stop ${i + 1}`;
    if (!s.name.trim()) errors.push(`Stop ${i + 1} needs a place.`);
    if (!s.start_date || !s.end_date) errors.push(`${label} needs both dates.`);
    else if (s.end_date < s.start_date) errors.push(`${label} ends before it starts.`);
  });
  const dated = stops.filter((s) => s.start_date && s.end_date);
  if (dated.length) {
    const { start, end } = tripSpan(dated);
    if (nightsBetween(start, end) > 60) errors.push("Trips can be up to 60 days long.");
  }
  return errors;
}

export interface ItemDraft {
  kind: ItemKind;
  title: string;
  day: string;
  part: DayPart;
  end_day: string | null;
  status: ItemStatus;
  est_cents: number | null;
}

/** Checks an itinerary item against its trip's dates. */
export function validateItem(d: ItemDraft, trip: Pick<Trip, "start_date" | "end_date">): string[] {
  const errors: string[] = [];
  if (!d.title.trim()) errors.push("Give it a name.");
  if (d.title.trim().length > 140) errors.push("Keep the name under 140 characters.");
  if (d.day < trip.start_date || d.day > trip.end_date) errors.push("Pick a day inside the trip.");
  if (d.kind === "stay") {
    if (!d.end_day) errors.push("A stay needs a check-out day.");
    else if (d.end_day <= d.day) errors.push("Check-out has to be after check-in.");
    else if (d.end_day > addDays(trip.end_date, 1)) errors.push("Check-out can't be more than a day after the trip ends.");
  }
  if (d.est_cents != null && (d.est_cents < 0 || !Number.isInteger(d.est_cents))) {
    errors.push("The estimate has to be a positive amount.");
  }
  return errors;
}
