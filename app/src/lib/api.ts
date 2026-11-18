/**
 * Every read and write the app makes. Each call goes to Supabase with the signed-in person's
 * token, and row-level security decides what it can see or change (supabase/migrations).
 */
import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { CostType, DayPart, GroupLink, Item, ItemKind, ItemStatus, PayMode, Role, Stop, StopDraft, Traveler, Trip } from "./model";
import type { SplitMode } from "./split";
import type { ImportResult } from "./importPlans";

/** Every traveler column a member may read; email and phone come from tripContacts (owners only). */
const TRAVELER_COLUMNS = "id, trip_id, name, role, user_id, claimed_at, added_by, created_at";

/** Turns a database error into a sentence a traveler can act on. */
export function friendly(error: PostgrestError | Error | null | undefined): string {
  if (!error) return "Something went wrong. Try again.";
  const msg = error.message ?? "";
  if (msg.includes("travelers_trip_name_idx") || msg.includes("already on the trip")) {
    return "Someone with that name is already on the trip.";
  }
  if (msg.includes("row-level security") || msg.includes("permission denied")) {
    return "Only the trip's owners can do that.";
  }
  if (msg.includes("expenses_paid_by_fkey") || msg.includes("expense_shares_traveler_id_fkey")) {
    return "They're on an expense. Change or remove that expense first.";
  }
  if (msg.includes("Failed to fetch")) return "Can't reach TripTab. Check your connection and try again.";
  const known = [
    "Pick a day inside the trip",
    "It can't arrive more than a day after the trip ends",
    "Pick a last day inside the trip",
    "Check-out can't be more than a day after the trip ends",
    "A trip needs at least one owner",
    "That name was already claimed",
    "This link isn't active",
    "Pick your name or add it",
    "Only owners can do that",
    "Confirm a plan with its cost, who paid and who's in",
    "Undo the confirmation to change its status",
    "The split has to add up to the cost",
    "Everyone in the split has to be on the trip",
    "Pick who paid from the trip",
    "Pick at least one person",
    "Assign it to someone on the trip",
    "Some plans fall outside the new dates; move or remove them first",
    "Only owners or the person it's assigned to can do that",
    "You can log your own cost; owners can log anyone's",
    "They logged this one themselves, so only they can change it",
    "This plan is one bill, split. Switch it to everyone pays their own first",
    "People have logged their own costs on this plan. Clear those to make it one bill",
    "Clear what's logged on this plan before switching who pays",
    "On this plan each person clears their own line",
    "It's confirmed once everyone going has logged their own cost",
    "Everyone going has booked, so it stays confirmed until a line is cleared",
    "Nothing is logged for them on this plan",
    "Enter the cost",
  ];
  const hit = known.find((k) => msg.includes(k));
  return hit ? `${hit}.` : msg || "Something went wrong. Try again.";
}

function must<T>(data: T | null, error: PostgrestError | null): T {
  if (error) throw new Error(friendly(error));
  return data as T;
}

// ---------- Trips ----------

export interface TripSummary extends Trip {
  stops: Pick<Stop, "name" | "position">[];
  travelers: Pick<Traveler, "id" | "user_id" | "role">[];
}

export async function listMyTrips(): Promise<TripSummary[]> {
  const { data, error } = await supabase
    .from("trips")
    .select("*, stops(name, position), travelers(id, user_id, role)")
    .order("start_date");
  return must(data as TripSummary[] | null, error) ?? [];
}

export async function createTrip(name: string, stops: StopDraft[], myName: string): Promise<string> {
  const { data, error } = await supabase.rpc("create_trip", {
    p_name: name.trim(),
    p_stops: stops.map((s) => ({ name: s.name.trim(), start_date: s.start_date, end_date: s.end_date })),
    p_my_name: myName.trim(),
  });
  return must(data as string | null, error);
}

export interface ExpenseShare {
  traveler_id: string;
  amount_cents: number;
  weight: number | null;
}

/** A recorded payment between two people on the trip (Build 3). TripTab never moves the money. */
export type PaymentMethod = "venmo" | "cash" | "zelle" | "other";
export interface Payment {
  id: string;
  trip_id: string;
  from_traveler: string;
  to_traveler: string;
  amount_cents: number;
  paid_on: string;
  method: PaymentMethod;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

/** Money that changed hands: a confirmed plan's cost (item_id set) or a general expense. */
export interface ExpenseRow {
  id: string;
  trip_id: string;
  item_id: string | null;
  description: string;
  day: string | null;
  total_cents: number;
  paid_by: string;
  split_mode: SplitMode;
  /**
   * An own line: one person's own price on an "everyone pays their own" plan. Its payer is its
   * only share, so it never moves a balance. The database only returns it to that person and to
   * whoever entered it.
   */
  own: boolean;
  /** Own lines only: paid with points; total_cents is then the optional cash value. */
  with_points: boolean;
  created_at: string;
  expense_shares: ExpenseShare[];
}

/** Someone has logged their own line on a plan (booked). Everyone on the trip sees this, never the price. */
export interface OwnMark {
  item_id: string;
  traveler_id: string;
}

/** Someone's in or out of a plan; no row means the default (in, except flights). */
export interface ItemPerson {
  item_id: string;
  traveler_id: string;
  going: boolean;
}

/** Something that still needs doing, and who's on it (Build 4). */
export interface ActionItem {
  id: string;
  trip_id: string;
  title: string;
  assignee: string | null;
  due_day: string | null;
  done: boolean;
  done_at: string | null;
  created_at: string;
}

export interface TripBundle {
  trip: Trip;
  stops: Stop[];
  travelers: Traveler[];
  items: Item[];
  /** Only owners can read the group link; null for viewers. */
  link: GroupLink | null;
  expenses: ExpenseRow[];
  itemPeople: ItemPerson[];
  ownMarks: OwnMark[];
  actions: ActionItem[];
  /**
   * Recorded payments, oldest first. Null when this database doesn't have them yet (production
   * until its migration is OK'd): the app then hides payments rather than failing to load.
   */
  payments: Payment[] | null;
}

export async function loadTrip(id: string): Promise<TripBundle | null> {
  const [trip, stops, travelers, items, link, expenses, people, actions, contacts, marks, payments, venmo] = await Promise.all([
    supabase.from("trips").select("*").eq("id", id).maybeSingle(),
    supabase.from("stops").select("*").eq("trip_id", id).order("position"),
    supabase.from("travelers").select(TRAVELER_COLUMNS).eq("trip_id", id).order("created_at"),
    supabase.from("items").select("*").eq("trip_id", id).order("created_at"),
    supabase.from("trip_links").select("*").eq("trip_id", id).maybeSingle(),
    supabase.from("expenses").select("*, expense_shares(traveler_id, amount_cents, weight)").eq("trip_id", id).order("created_at"),
    supabase.from("item_people").select("item_id, traveler_id, going, items!inner(trip_id)").eq("items.trip_id", id),
    supabase.from("action_items").select("*").eq("trip_id", id).order("created_at"),
    supabase.rpc("trip_contacts", { p_trip: id }),
    supabase.rpc("own_marks", { p_trip: id }),
    // Asked apart, so a database without payments yet still loads the trip.
    supabase.from("payments").select("*").eq("trip_id", id).order("paid_on").order("created_at"),
    supabase.from("travelers").select("id, venmo").eq("trip_id", id),
  ]);
  if (trip.error) throw new Error(friendly(trip.error));
  if (!trip.data) return null;
  return {
    trip: trip.data as Trip,
    stops: must(stops.data, stops.error) as Stop[],
    travelers: withContacts(
      must(travelers.data, travelers.error) as Omit<Traveler, "email" | "phone">[],
      (contacts.data as { traveler_id: string; email: string | null; phone: string | null }[] | null) ?? [],
    ).map((t) => ({ ...t, venmo: venmo.error ? undefined : ((venmo.data as { id: string; venmo: string | null }[]).find((v) => v.id === t.id)?.venmo ?? null) })),
    items: must(items.data, items.error) as Item[],
    link: (link.data as GroupLink | null) ?? null,
    expenses: must(expenses.data, expenses.error) as ExpenseRow[],
    itemPeople: (must(people.data, people.error) as (ItemPerson & { items: unknown })[]).map(
      ({ item_id, traveler_id, going }) => ({ item_id, traveler_id, going }),
    ),
    ownMarks: (marks.data as OwnMark[] | null) ?? [],
    actions: must(actions.data, actions.error) as ActionItem[],
    payments: payments.error ? null : (payments.data as Payment[]),
  };
}

// ---------- Payments ----------

export interface PaymentDraft {
  from: string;
  to: string;
  cents: number;
  paidOn: string;
  method: PaymentMethod;
  note: string;
}

/** Anyone on the trip records a payment they made or got; an Owner records any. */
export async function recordPayment(tripId: string, p: PaymentDraft): Promise<void> {
  const { error } = await supabase.from("payments").insert({
    trip_id: tripId,
    from_traveler: p.from,
    to_traveler: p.to,
    amount_cents: p.cents,
    paid_on: p.paidOn,
    method: p.method,
    note: p.note.trim() || null,
  });
  if (error) throw new Error(error.code === "42501" ? "You can record a payment you made or got. An owner can record any." : friendly(error));
}

/** Whoever recorded a payment, or an Owner, can remove it. */
export async function deletePayment(id: string): Promise<void> {
  const { data, error } = await supabase.from("payments").delete().eq("id", id).select("id");
  must(data, error);
  if (!data?.length) throw new Error("Only whoever recorded it, or an owner, can remove it.");
}

/** An Owner sets someone's Venmo username on this trip (they can still change it themselves). */
export async function setVenmoFor(travelerId: string, handle: string): Promise<void> {
  const { data, error } = await supabase.from("travelers").update({ venmo: cleanVenmo(handle) }).eq("id", travelerId).select("id");
  if (error) throw new Error(error.code === "23514" ? VENMO_FORMAT : friendly(error));
  if (!data?.length) throw new Error("Only the trip's owners can do that.");
}

/** Your Venmo username, on all your trips at once. Blank clears it. */
export async function setMyVenmo(handle: string): Promise<void> {
  const { error } = await supabase.rpc("set_my_venmo", { p_venmo: handle });
  if (error) throw new Error(error.code === "23514" ? VENMO_FORMAT : friendly(error));
}

// ---------- People ----------

export interface PersonDraft {
  name: string;
  email: string;
  phone: string;
  role: Role;
  /** Their Venmo username, so people can pay them from Settle up (optional). */
  venmo?: string;
}

const VENMO_FORMAT = "A Venmo username is 5 to 30 letters, numbers, - or _.";
/** "@Jordan-B" or " jordan-b " becomes "Jordan-B"; blank becomes null. */
export const cleanVenmo = (handle: string): string | null => handle.trim().replace(/^@/, "") || null;
export const venmoLooksRight = (handle: string): boolean => {
  const v = cleanVenmo(handle);
  return v === null || /^[A-Za-z0-9_-]{5,30}$/.test(v);
};

/** Owners get each person's email and phone; everyone else gets null for both. */
function withContacts(
  travelers: Omit<Traveler, "email" | "phone">[],
  contacts: { traveler_id: string; email: string | null; phone: string | null }[],
): Traveler[] {
  const byId = new Map(contacts.map((c) => [c.traveler_id, c]));
  return travelers.map((t) => ({ ...t, email: byId.get(t.id)?.email ?? null, phone: byId.get(t.id)?.phone ?? null }));
}

export async function addTraveler(tripId: string, p: PersonDraft): Promise<Traveler> {
  const { data, error } = await supabase
    .from("travelers")
    .insert({
      trip_id: tripId,
      name: p.name.trim(),
      email: p.email.trim() || null,
      phone: p.phone.trim() || null,
      role: p.role,
      // Only when given, so a database without Venmo names still adds people.
      ...(cleanVenmo(p.venmo ?? "") ? { venmo: cleanVenmo(p.venmo ?? "") } : {}),
    })
    .select(TRAVELER_COLUMNS)
    .single();
  if (error?.code === "23514") throw new Error(VENMO_FORMAT);
  const row = must(data as Omit<Traveler, "email" | "phone"> | null, error);
  return { ...row, email: p.email.trim() || null, phone: p.phone.trim() || null };
}

export async function setRole(travelerId: string, role: Role): Promise<void> {
  const { data, error } = await supabase.from("travelers").update({ role }).eq("id", travelerId).select("id");
  must(data, error);
  if (!data?.length) throw new Error("Only the trip's owners can do that.");
}

export async function removeTraveler(travelerId: string): Promise<void> {
  const { data, error } = await supabase.from("travelers").delete().eq("id", travelerId).select("id");
  must(data, error);
  if (!data?.length) throw new Error("Only the trip's owners can do that.");
}

// ---------- Group link ----------

/**
 * The online build (GitHub Pages, `npm run build:pages`) uses hash URLs like /app/#/join/abc,
 * because Pages serves files and can't route a deep link to the app. Local dev uses plain paths.
 */
export const HASH_ROUTES = import.meta.env.MODE === "pages";

/** A full link to a screen of the app, for sharing outside it (invites). */
export const appUrl = (path: string) =>
  HASH_ROUTES ? `${window.location.origin}${import.meta.env.BASE_URL}#${path}` : `${window.location.origin}${path}`;

export const inviteUrl = (token: string, travelerId?: string) =>
  appUrl(`/join/${token}${travelerId ? `?as=${travelerId}` : ""}`);

export type InviteResult = { ok: true } | { ok: false; code: string; error: string };

/**
 * Emails someone their invite from invites@triptab.org (the send-invite Edge Function, Owners only,
 * rate-limited there). `not_set_up` means the project has no email key yet: send it yourself instead.
 */
export async function sendInviteEmail(tripId: string, travelerId: string): Promise<InviteResult> {
  const { error } = await supabase.functions.invoke("send-invite", { body: { trip_id: tripId, traveler_id: travelerId } });
  if (!error) return { ok: true };
  const response = (error as { context?: unknown }).context;
  if (response instanceof Response) {
    // A project without the function yet (production before its rollout) behaves like no email key:
    // the Owner sends the invite from their own mail app, as before.
    if (response.status === 404) return { ok: false, code: "not_set_up", error: "Invite emails aren't set up yet." };
    try {
      const body = (await response.json()) as { code?: string; error?: string };
      if (body?.code) return { ok: false, code: body.code, error: body.error ?? "The email didn't go out." };
    } catch {
      // not JSON; fall through
    }
  }
  return { ok: false, code: "error", error: "Can't reach TripTab's email right now. Send the invite yourself for now." };
}

export async function updateLink(tripId: string, patch: Partial<Pick<GroupLink, "default_role" | "enabled">>) {
  const { data, error } = await supabase.from("trip_links").update(patch).eq("trip_id", tripId).select("*").single();
  return must(data as GroupLink | null, error);
}

export async function resetLink(tripId: string): Promise<string> {
  const { data, error } = await supabase.rpc("reset_group_link", { p_trip: tripId });
  return must(data as string | null, error);
}

export interface JoinPreview {
  trip_id: string;
  name: string;
  start_date: string;
  end_date: string;
  default_role: Role;
  stops: string[];
  people: { id: string; name: string; claimed: boolean }[];
  my_traveler_id: string | null;
}

export async function joinPreview(token: string): Promise<JoinPreview | null> {
  const { data, error } = await supabase.rpc("join_preview", { p_token: token });
  return must(data as JoinPreview | null, error);
}

export async function joinTrip(token: string, pick: { travelerId?: string; newName?: string }): Promise<string> {
  const { data, error } = await supabase.rpc("join_trip", {
    p_token: token,
    p_traveler_id: pick.travelerId ?? null,
    p_new_name: pick.newName ?? null,
  });
  return must(data as string | null, error);
}

// ---------- Itinerary items ----------

export interface ItemInput {
  kind: ItemKind;
  title: string;
  day: string;
  part: DayPart;
  end_day: string | null;
  location: string | null;
  notes: string | null;
  status: ItemStatus;
  est_cents: number | null;
  cost_type: CostType;
  /** Left out, the database picks by kind: flights are their own, the rest one bill. */
  pay_mode?: PayMode;
  /** Plans that span time: the last part covered, and a flight's departure and arrival times ("HH:MM"). */
  end_part?: DayPart | null;
  start_time?: string | null;
  end_time?: string | null;
}

export async function addItem(tripId: string, input: ItemInput): Promise<Item> {
  const { data, error } = await supabase
    .from("items")
    .insert({ trip_id: tripId, ...input })
    .select("*")
    .single();
  return must(data as Item | null, error);
}

export async function updateItem(id: string, patch: Partial<ItemInput>): Promise<Item> {
  const { data, error } = await supabase.from("items").update(patch).eq("id", id).select("*").maybeSingle();
  if (!error && !data) throw new Error("Only the trip's owners can do that.");
  return must(data as Item | null, error);
}

export async function deleteItem(id: string): Promise<void> {
  const { data, error } = await supabase.from("items").delete().eq("id", id).select("id");
  must(data, error);
  if (!data?.length) throw new Error("Only the trip's owners can do that.");
}

// ---------- Money (Build 3) ----------

export interface ShareInput {
  traveler_id: string;
  amount_cents: number;
  weight?: number | null;
}

/** Confirm a plan: its real cost, who paid, who's in and the split, all in one transaction. */
export async function confirmItem(itemId: string, total: number, paidBy: string, mode: SplitMode, shares: ShareInput[]) {
  const { error } = await supabase.rpc("confirm_item", {
    p_item: itemId,
    p_total_cents: total,
    p_paid_by: paidBy,
    p_split_mode: mode,
    p_shares: shares,
  });
  if (error) throw new Error(friendly(error));
}

/** Undo a confirmation: the expense goes and the plan is Planned again. */
export async function unconfirmItem(itemId: string) {
  const { error } = await supabase.rpc("unconfirm_item", { p_item: itemId });
  if (error) throw new Error(friendly(error));
}

/** Add or edit a general expense (not tied to a plan). */
export async function saveExpense(
  tripId: string,
  expenseId: string | null,
  description: string,
  day: string | null,
  total: number,
  paidBy: string,
  mode: SplitMode,
  shares: ShareInput[],
) {
  const { error } = await supabase.rpc("save_expense", {
    p_trip: tripId,
    p_expense: expenseId,
    p_description: description.trim(),
    p_day: day,
    p_total_cents: total,
    p_paid_by: paidBy,
    p_split_mode: mode,
    p_shares: shares,
  });
  if (error) throw new Error(friendly(error));
}

export async function deleteExpense(id: string) {
  const { data, error } = await supabase.from("expenses").delete().eq("id", id).select("id");
  must(data, error);
  if (!data?.length) throw new Error("Only the trip's owners can do that.");
}

/**
 * Log (or change) one person's own line on an "everyone pays their own" plan: what they paid, or
 * the cash value if it was points. Anyone logs their own; owners can log anyone's. Returns the
 * plan's status afterwards, which follows the lines.
 */
export async function logOwnLine(itemId: string, travelerId: string, cents: number, withPoints: boolean): Promise<ItemStatus> {
  const { data, error } = await supabase.rpc("log_own_line", {
    p_item: itemId,
    p_traveler: travelerId,
    p_cents: cents,
    p_with_points: withPoints,
  });
  if (error) throw new Error(friendly(error));
  return data as ItemStatus;
}

/** Remove an own line (not booked after all). Returns the plan's status afterwards. */
export async function clearOwnLine(itemId: string, travelerId: string): Promise<ItemStatus> {
  const { data, error } = await supabase.rpc("clear_own_line", { p_item: itemId, p_traveler: travelerId });
  if (error) throw new Error(friendly(error));
  return data as ItemStatus;
}

/** In or out of a plan. You can set your own; owners can set anyone's. */
export async function setGoing(itemId: string, travelerId: string, going: boolean) {
  const { error } = await supabase.from("item_people").upsert({ item_id: itemId, traveler_id: travelerId, going });
  if (error) throw new Error(friendly(error));
}

// ---------- Action items (Build 4) ----------

export async function addAction(tripId: string, title: string, assignee: string | null, dueDay: string | null) {
  const { error } = await supabase
    .from("action_items")
    .insert({ trip_id: tripId, title: title.trim(), assignee, due_day: dueDay });
  if (error) throw new Error(friendly(error));
}

export async function updateAction(id: string, patch: Partial<Pick<ActionItem, "title" | "assignee" | "due_day">>) {
  const { data, error } = await supabase.from("action_items").update(patch).eq("id", id).select("id");
  must(data, error);
  if (!data?.length) throw new Error("Only the trip's owners can do that.");
}

/** Tick off (or back on): owners, or whoever it's assigned to. */
export async function setActionDone(id: string, done: boolean) {
  const { error } = await supabase.rpc("set_action_done", { p_id: id, p_done: done });
  if (error) throw new Error(friendly(error));
}

export async function deleteAction(id: string) {
  const { data, error } = await supabase.from("action_items").delete().eq("id", id).select("id");
  must(data, error);
  if (!data?.length) throw new Error("Only the trip's owners can do that.");
}

// ---------- Trip settings ----------

/** Rename a trip and replace its stops (which set its dates), in one step. Owners only. */
export async function updateTrip(tripId: string, name: string, stops: StopDraft[]) {
  const { error } = await supabase.rpc("update_trip", {
    p_trip: tripId,
    p_name: name.trim(),
    p_stops: stops.map((s) => ({ name: s.name.trim(), start_date: s.start_date, end_date: s.end_date })),
  });
  if (error) throw new Error(friendly(error));
}

/** Stretch the trip to include a day up to a week before or after it (the first stop starts earlier
 *  or the last one ends later). Never shrinks it. Owners only. */
export async function extendTrip(tripId: string, day: string) {
  const { error } = await supabase.rpc("extend_trip", { p_trip: tripId, p_day: day });
  if (error) throw new Error(friendly(error));
}

/** Delete the whole trip: plans, people, money and all. Owners only. */
export async function deleteTrip(tripId: string) {
  const { data, error } = await supabase.from("trips").delete().eq("id", tripId).select("id");
  must(data, error);
  if (!data?.length) throw new Error("Only the trip's owners can do that.");
}

// ---------- AI import (Build 4) ----------

/**
 * Asks the import-bookings Edge Function to propose plans from pasted text or an attached file.
 * Owners only; the function checks. Nothing is saved by this call: the review step saves what
 * the Owner keeps. Automated click-throughs mark their calls test_run in the cost log.
 */
/** One idea from Plan with AI (supabase/functions/plan-with-ai). */
export interface PlanIdea {
  kind: "activity" | "meal";
  title: string;
  day: string;
  part: DayPart;
  location: string | null;
  est_cents: number | null;
  why: string;
  source_url: string;
}
export interface PlanAiResult {
  suggestions: PlanIdea[];
  note: string | null;
  dropped: number;
  call_id: string | null;
  usage: { cost_usd: number; searches: number; latency_ms: number; model: string; effort: string };
}

/** Ask Plan with AI for ideas for the trip's empty slots. Nothing is saved until the Owner keeps them. */
export async function planWithAi(tripId: string, request: string): Promise<PlanAiResult> {
  let testRun = false;
  try {
    testRun = localStorage.getItem("triptab.test_run") === "1";
  } catch {
    // storage can be unavailable
  }
  const { data, error } = await supabase.functions.invoke("plan-with-ai", { body: { trip_id: tripId, request, test_run: testRun } });
  if (error) {
    let message = "Can't reach Plan with AI right now. Check your connection and try again.";
    const response = (error as { context?: unknown }).context;
    if (response instanceof Response) {
      try {
        const body = (await response.json()) as { error?: string };
        if (body?.error) message = body.error;
      } catch {
        // not JSON; keep the general message
      }
    }
    throw new Error(message);
  }
  return data as PlanAiResult;
}

export async function importBookings(
  tripId: string,
  text: string,
  file: { media_type: string; data: string } | null,
): Promise<ImportResult> {
  let testRun = false;
  try {
    testRun = localStorage.getItem("triptab.test_run") === "1";
  } catch {
    // storage can be unavailable
  }
  const { data, error } = await supabase.functions.invoke("import-bookings", {
    body: { trip_id: tripId, text, file, test_run: testRun },
  });
  if (error) {
    // The function answers refusals with a sentence for the traveler in `error`.
    let message = "Can't reach TripTab's import right now. Check your connection and try again.";
    const response = (error as { context?: unknown }).context;
    if (response instanceof Response) {
      try {
        const body = (await response.json()) as { error?: string };
        if (body?.error) message = body.error;
      } catch {
        // not JSON; keep the general message
      }
    }
    throw new Error(message);
  }
  return data as ImportResult;
}
