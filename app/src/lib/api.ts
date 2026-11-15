/**
 * Every read and write the app makes. Each call goes to Supabase with the signed-in person's
 * token, and row-level security decides what it can see or change (supabase/migrations).
 */
import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { CostType, DayPart, GroupLink, Item, ItemKind, ItemStatus, Role, Stop, StopDraft, Traveler, Trip } from "./model";
import type { SplitMode } from "./split";

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
    "Only owners or the person it's assigned to can do that",
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
  created_at: string;
  expense_shares: ExpenseShare[];
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
  actions: ActionItem[];
}

export async function loadTrip(id: string): Promise<TripBundle | null> {
  const [trip, stops, travelers, items, link, expenses, people, actions] = await Promise.all([
    supabase.from("trips").select("*").eq("id", id).maybeSingle(),
    supabase.from("stops").select("*").eq("trip_id", id).order("position"),
    supabase.from("travelers").select("*").eq("trip_id", id).order("created_at"),
    supabase.from("items").select("*").eq("trip_id", id).order("created_at"),
    supabase.from("trip_links").select("*").eq("trip_id", id).maybeSingle(),
    supabase.from("expenses").select("*, expense_shares(traveler_id, amount_cents, weight)").eq("trip_id", id).order("created_at"),
    supabase.from("item_people").select("item_id, traveler_id, going, items!inner(trip_id)").eq("items.trip_id", id),
    supabase.from("action_items").select("*").eq("trip_id", id).order("created_at"),
  ]);
  if (trip.error) throw new Error(friendly(trip.error));
  if (!trip.data) return null;
  return {
    trip: trip.data as Trip,
    stops: must(stops.data, stops.error) as Stop[],
    travelers: must(travelers.data, travelers.error) as Traveler[],
    items: must(items.data, items.error) as Item[],
    link: (link.data as GroupLink | null) ?? null,
    expenses: must(expenses.data, expenses.error) as ExpenseRow[],
    itemPeople: (must(people.data, people.error) as (ItemPerson & { items: unknown })[]).map(
      ({ item_id, traveler_id, going }) => ({ item_id, traveler_id, going }),
    ),
    actions: must(actions.data, actions.error) as ActionItem[],
  };
}

// ---------- People ----------

export interface PersonDraft {
  name: string;
  email: string;
  phone: string;
  role: Role;
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
    })
    .select("*")
    .single();
  return must(data as Traveler | null, error);
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

export const inviteUrl = (token: string, travelerId?: string) =>
  `${window.location.origin}/join/${token}${travelerId ? `?as=${travelerId}` : ""}`;

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
