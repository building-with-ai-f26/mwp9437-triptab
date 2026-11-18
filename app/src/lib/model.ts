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
/** Who pays for a plan: one bill that gets split, or each person going pays their own price. */
export type PayMode = "split" | "own";

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
  /** Their Venmo username, for "Pay with Venmo" (Build 3); missing on a database without payments yet. */
  venmo?: string | null;
  /** Their Zelle phone (10 digits) or email; only they can add it. Missing on a database without it yet. */
  zelle?: string | null;
  /** True once they set their own Venmo or Zelle: then only they can change it. */
  pay_locked?: boolean;
}

export interface Item {
  id: string;
  trip_id: string;
  kind: ItemKind;
  title: string;
  /** The day it happens; for a stay, the check-in day. */
  day: string;
  part: DayPart;
  /**
   * A stay's check-out day (after the last night); an activity's or meal's last day, when it
   * runs over several days; the day a flight or transfer arrives, when that's a later day.
   */
  end_day: string | null;
  /** The last part of the day it covers, when it runs past the part it starts in. */
  end_part: DayPart | null;
  /** Clock times, local to where it is, as "HH:MM:SS" or "HH:MM": a flight's departure and arrival. */
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  notes: string | null;
  status: ItemStatus;
  /** Rough cost while suggested or planned. */
  est_cents: number | null;
  cost_type: CostType;
  pay_mode: PayMode;
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
export const PAY_MODE_LABEL: Record<PayMode, string> = { split: "One bill, split", own: "Everyone pays their own" };
/** Flights are bought one by one; stays, transport, meals and activities are usually one bill. */
export const defaultPayMode = (kind: ItemKind): PayMode => (kind === "flight" ? "own" : "split");
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

/** Today on this device's calendar, as YYYY-MM-DD. */
export function todayIso(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/**
 * The days an action item can be due: from today through the trip's last day, so bookings that
 * happen before the trip get a date too. Once the trip is over, any day up to its last one.
 */
export function dueWindow(tripEnd: string, today: string = todayIso()): { min: string | undefined; max: string } {
  return { min: today <= tripEnd ? today : undefined, max: tripEnd };
}

/** Whether a due day falls in that window. */
export function dueDayOk(day: string, tripEnd: string, today: string = todayIso()): boolean {
  const { min, max } = dueWindow(tripEnd, today);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && day <= max && (min === undefined || day >= min);
}

/** Every date from start to end, inclusive. */
/** How far outside a trip a plan's day may fall and still be offered "add it to the trip" in one
 *  tap (Mike's call, 11/16: travel spills a day either side). The database allows up to a week. */
export const EXTEND_LIMIT_DAYS = 7;
/** Days offered before and after the trip in Add a plan. */
export const SPILL_DAYS = 2;

/** The trip as it would be with `day` included: unchanged when the day is already inside. */
export function widenTrip<T extends { start_date: string; end_date: string }>(trip: T, day: string | null | undefined): T {
  if (!day) return trip;
  return { ...trip, start_date: day < trip.start_date ? day : trip.start_date, end_date: day > trip.end_date ? day : trip.end_date };
}

/** Whether a day outside the trip is close enough to extend the trip to it in one tap. */
export function canExtendTo(trip: { start_date: string; end_date: string }, day: string | null | undefined): boolean {
  if (!day || (day >= trip.start_date && day <= trip.end_date)) return false;
  const widened = widenTrip(trip, day);
  return (
    day >= addDays(trip.start_date, -EXTEND_LIMIT_DAYS) &&
    day <= addDays(trip.end_date, EXTEND_LIMIT_DAYS) &&
    tripDays(widened.start_date, widened.end_date).length <= 61
  );
}

/** Plans that new trip dates would leave outside, by the database's rule (update_trip): a plan's
 *  day must be inside, a stay's check-out or a flight's or transfer's arrival at most a day after
 *  the end, and an activity's or meal's last day inside. */
export function plansOutside<T extends Pick<Item, "kind" | "day" | "end_day">>(items: T[], start: string, end: string): T[] {
  const after = addDays(end, 1);
  return items.filter(
    (i) =>
      i.day < start ||
      i.day > end ||
      (i.end_day != null && (i.kind === "stay" || i.kind === "flight" || i.kind === "transport" ? i.end_day > after : i.end_day > end)),
  );
}

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

/** "17:05" or "17:05:00" as "5:05 PM". */
export function clock(time: string): string {
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** The part of the day a clock time falls in (the same bands the calendar export uses). */
export function partOfTime(time: string): DayPart {
  const h = Number(time.slice(0, 2));
  return h < 12 ? "morning" : h < 17 ? "day" : h < 21 ? "evening" : "night";
}

/** The part of the day a plan ending at this time ends in: a class until noon ends in the morning. */
export function partOfEndTime(time: string): DayPart {
  const [h, m] = time.split(":").map(Number);
  const before = Math.max(0, h * 60 + m - 1);
  return partOfTime(`${String(Math.floor(before / 60)).padStart(2, "0")}:${String(before % 60).padStart(2, "0")}`);
}

/**
 * Parts of the day as select all that apply (11/17 pod feedback). A plan covers one run of
 * parts, so picking a part outside the run stretches it to that part, picking an end of the run
 * drops that end, and picking one in the middle starts over from there. Indexes into PARTS.
 */
export function togglePart(from: number, to: number, i: number): { from: number; to: number } {
  if (i < from || i > to) return { from: Math.min(from, i), to: Math.max(to, i) };
  if (from === to) return { from, to };
  if (i === from) return { from: from + 1, to };
  if (i === to) return { from, to: to - 1 };
  return { from: i, to: i };
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
  end_part?: DayPart | null;
  start_time?: string | null;
  end_time?: string | null;
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
  if (d.kind !== "stay") {
    const travel = d.kind === "flight" || d.kind === "transport";
    if (d.end_day && d.end_day < d.day) errors.push(travel ? "It can't arrive before it leaves." : "The last day can't be before the first.");
    else if (d.end_day && travel && d.end_day > addDays(trip.end_date, 1)) errors.push("It can't arrive more than a day after the trip ends.");
    else if (d.end_day && !travel && d.end_day > trip.end_date) errors.push("Pick a last day inside the trip.");
    const sameDay = !d.end_day || d.end_day === d.day;
    if (d.end_part && (sameDay || !travel) && PARTS.indexOf(d.end_part) < PARTS.indexOf(d.part)) {
      errors.push(travel ? "On the same day it can't arrive earlier than it leaves." : "It can't end in an earlier part of the day than it starts.");
    }
    if (!travel && d.start_time && d.end_time && d.end_time.slice(0, 5) <= d.start_time.slice(0, 5)) {
      errors.push("It has to end after it starts.");
    }
  }
  if (d.est_cents != null && (d.est_cents < 0 || !Number.isInteger(d.est_cents))) {
    errors.push("The estimate has to be a positive amount.");
  }
  return errors;
}
