/**
 * Every read and write the app makes. Each call goes to Supabase with the signed-in person's
 * token, and row-level security decides what it can see or change (supabase/migrations).
 */
import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { CostType, DayPart, GroupLink, Item, ItemKind, ItemStatus, Role, Stop, StopDraft, Traveler, Trip } from "./model";

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
  if (msg.includes("Failed to fetch")) return "Can't reach TripTab. Check your connection and try again.";
  const known = [
    "Pick a day inside the trip",
    "Check-out can't be more than a day after the trip ends",
    "A trip needs at least one owner",
    "That name was already claimed",
    "This link isn't active",
    "Pick your name or add it",
    "Only owners can do that",
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

export interface TripBundle {
  trip: Trip;
  stops: Stop[];
  travelers: Traveler[];
  items: Item[];
  /** Only owners can read the group link; null for viewers. */
  link: GroupLink | null;
}

export async function loadTrip(id: string): Promise<TripBundle | null> {
  const [trip, stops, travelers, items, link] = await Promise.all([
    supabase.from("trips").select("*").eq("id", id).maybeSingle(),
    supabase.from("stops").select("*").eq("trip_id", id).order("position"),
    supabase.from("travelers").select("*").eq("trip_id", id).order("created_at"),
    supabase.from("items").select("*").eq("trip_id", id).order("created_at"),
    supabase.from("trip_links").select("*").eq("trip_id", id).maybeSingle(),
  ]);
  if (trip.error) throw new Error(friendly(trip.error));
  if (!trip.data) return null;
  return {
    trip: trip.data as Trip,
    stops: must(stops.data, stops.error) as Stop[],
    travelers: must(travelers.data, travelers.error) as Traveler[],
    items: must(items.data, items.error) as Item[],
    link: (link.data as GroupLink | null) ?? null,
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
