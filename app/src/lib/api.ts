/**
 * Every read and write the app makes. Each call goes to Supabase with the signed-in person's
 * token, and row-level security decides what it can see or change (supabase/migrations).
 */
import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { CostType, DayPart, GroupLink, Item, ItemKind, ItemStatus, PayMode, Role, Stop, StopDraft, Traveler, Trip } from "./model";
import type { SplitMode } from "./split";
import type { ImportResult } from "./importPlans";
import { cleanVenmo, cleanZelle, VENMO_FORMAT, venmoLooksRight, ZELLE_FORMAT, zelleLooksRight } from "./pay";
import { inboxAddressFor, type InboxItem } from "./inbox";
import { peopleMatchingBills } from "./ledger";

export { cleanVenmo, venmoLooksRight, zelleLabel, zelleLooksRight } from "./pay";

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
  /**
   * A cost in another currency (C33, Mike's call 11/21): the amount as written. total_cents is then
   * dollars at the day's rate, an estimate while fx_pending, until whoever paid enters the card's
   * charge or keeps it. Undefined on a database without the columns yet.
   */
  currency?: string | null;
  foreign_cents?: number | null;
  fx_pending?: boolean;
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
  /**
   * Emails forwarded to the trip's address that wait for a look (new, or unreadable), newest first.
   * Owners only (everyone else gets none). Null when this database doesn't have email-in yet.
   */
  inbox: InboxItem[] | null;
}

export async function loadTrip(id: string): Promise<TripBundle | null> {
  const [trip, stops, travelers, items, link, expenses, people, actions, contacts, marks, payments, venmo, pay, inbox] = await Promise.all([
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
    supabase.from("travelers").select("id, zelle, pay_locked").eq("trip_id", id),
    // Asked apart too, so a database without email-in still loads the trip.
    supabase.from("inbox_items").select("*").eq("trip_id", id).in("status", ["new", "failed", "held"]).order("received_at", { ascending: false }),
  ]);
  if (trip.error) throw new Error(friendly(trip.error));
  if (!trip.data) return null;
  return {
    trip: trip.data as Trip,
    stops: must(stops.data, stops.error) as Stop[],
    travelers: withContacts(
      must(travelers.data, travelers.error) as Omit<Traveler, "email" | "phone">[],
      (contacts.data as { traveler_id: string; email: string | null; phone: string | null }[] | null) ?? [],
    ).map((t) => {
      const v = venmo.error ? undefined : (venmo.data as { id: string; venmo: string | null }[]).find((x) => x.id === t.id);
      const z = pay.error ? undefined : (pay.data as { id: string; zelle: string | null; pay_locked: boolean }[]).find((x) => x.id === t.id);
      return {
        ...t,
        venmo: venmo.error ? undefined : (v?.venmo ?? null),
        // Asked apart again, so a database without Zelle yet keeps Venmo working.
        ...(pay.error ? {} : { zelle: z?.zelle ?? null, pay_locked: z?.pay_locked ?? false }),
      };
    }),
    items: must(items.data, items.error) as Item[],
    link: (link.data as GroupLink | null) ?? null,
    expenses: must(expenses.data, expenses.error) as ExpenseRow[],
    // Who's in follows a plan's bill once it has one (C47), so every screen reads the same people.
    itemPeople: peopleMatchingBills(
      (must(people.data, people.error) as (ItemPerson & { items: unknown })[]).map(({ item_id, traveler_id, going }) => ({ item_id, traveler_id, going })),
      must(expenses.data, expenses.error) as ExpenseRow[],
      must(travelers.data, travelers.error) as { id: string }[],
    ),
    ownMarks: (marks.data as OwnMark[] | null) ?? [],
    actions: must(actions.data, actions.error) as ActionItem[],
    payments: payments.error ? null : (payments.data as Payment[]),
    inbox: inbox.error ? null : (inbox.data as InboxItem[]),
  };
}

// ---------- Email-in (Mike's call, 11/20) ----------

/** Whether email-in takes mail: on production once INBOX_SECRET is set (by name only), on dev always. */
export async function inboxReady(): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke("inbox-email", { body: { probe: true } });
  return !error && (data as { ready?: unknown } | null)?.ready === true;
}

/** The trip's own address for forwarding bookings, made the first time an Owner asks. */
export async function tripInboxAddress(tripId: string): Promise<string> {
  const { data, error } = await supabase.rpc("inbox_address", { p_trip: tripId });
  return inboxAddressFor(must(data as string | null, error));
}

/** A new address in place of the old one, which stops taking email at once. */
export async function resetTripInbox(tripId: string): Promise<string> {
  const { data, error } = await supabase.rpc("reset_inbox", { p_trip: tripId });
  return inboxAddressFor(must(data as string | null, error));
}

/** An Owner marks an email's plans saved (kept on the trip) or dismisses it. */
/**
 * An Owner reads a held email (C36): the AI reads it now, billed to them. With mine, its address
 * counts as theirs from then on (Also forward from), so their next forward from it isn't held.
 */
export async function readHeldEmail(itemId: string, mine: boolean): Promise<void> {
  const { error } = await supabase.functions.invoke("inbox-email", { body: { action: "read_held", item_id: itemId, mine } });
  if (!error) return;
  const res = (error as { context?: unknown }).context;
  const code = res instanceof Response ? ((await res.json().catch(() => ({}))) as { code?: string }).code : undefined;
  if (code === "not_held") throw new Error("Someone already read or dismissed that email.");
  if (code === "not_owner") throw new Error("Only the trip's Owners can read it.");
  throw new Error("Couldn't read that email just now. Try again.");
}

export async function markInbox(id: string, status: "saved" | "dismissed"): Promise<void> {
  const { data, error } = await supabase.from("inbox_items").update({ status }).eq("id", id).select("id");
  must(data, error);
  if (!data?.length) throw new Error("Only the trip's owners can do that.");
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

/**
 * An Owner adds or fixes someone's Venmo username on this trip, until that person sets their own
 * (then the database refuses it, and says so).
 */
export async function setVenmoFor(travelerId: string, handle: string): Promise<void> {
  const { data, error } = await supabase.from("travelers").update({ venmo: cleanVenmo(handle) }).eq("id", travelerId).select("id");
  if (error?.code === "42501" && /set their own Venmo/.test(error.message)) throw new Error(error.message);
  if (error) throw new Error(error.code === "23514" ? VENMO_FORMAT : friendly(error));
  if (!data?.length) throw new Error("Only the trip's owners can do that.");
}

/**
 * An Owner adds or fixes someone's Venmo and Zelle (C20, Mike's call 11/20), until that person sets
 * their own. Blank clears either one.
 */
export async function setPayFor(travelerId: string, venmo: string, zelle: string): Promise<void> {
  if (!venmoLooksRight(venmo)) throw new Error(VENMO_FORMAT);
  if (!zelleLooksRight(zelle)) throw new Error(ZELLE_FORMAT);
  const { data, error } = await supabase
    .from("travelers")
    .update({ venmo: cleanVenmo(venmo), zelle: cleanZelle(zelle) })
    .eq("id", travelerId)
    .select("id");
  if (error?.code === "42501" && /set their own/.test(error.message)) throw new Error(error.message);
  if (error?.code === "23514") throw new Error(error.message.includes("zelle") ? ZELLE_FORMAT : VENMO_FORMAT);
  if (error) throw new Error(friendly(error));
  if (!data?.length) throw new Error("Only the trip's owners can do that.");
}

/** Your Venmo username, on all your trips at once. Blank clears it. (Databases without Zelle yet.) */
export async function setMyVenmo(handle: string): Promise<void> {
  const { error } = await supabase.rpc("set_my_venmo", { p_venmo: handle });
  if (error) throw new Error(error.code === "23514" ? VENMO_FORMAT : friendly(error));
}

/**
 * How people pay you: your Venmo and Zelle, on all your trips at once, and locked to you (only you
 * can change them). Blank clears one.
 */
export async function setMyPay(venmo: string, zelle: string): Promise<void> {
  if (!venmoLooksRight(venmo)) throw new Error(VENMO_FORMAT);
  if (!zelleLooksRight(zelle)) throw new Error(ZELLE_FORMAT);
  const { error } = await supabase.rpc("set_my_pay", { p_venmo: cleanVenmo(venmo) ?? "", p_zelle: cleanZelle(zelle) ?? "" });
  if (error?.code === "23514") throw new Error(error.message.includes("zelle") ? ZELLE_FORMAT : VENMO_FORMAT);
  if (error) throw new Error(friendly(error));
}

// ---------- Your profile (C50, Mike's call 11/23) ----------

/** Venmo, Zelle and phone kept once and put on every trip you join, with the lock you set. */
export interface Profile {
  venmo: string | null;
  zelle: string | null;
  phone: string | null;
  /** Locked: no Owner can change your Venmo, Zelle or phone on any trip. */
  locked: boolean;
  /** False until you've saved it once; it then starts from what your trips hold. */
  saved: boolean;
  /** The preferences survey (C51). Left out by a database that doesn't have it yet. */
  cuisines?: string[];
  activities?: string[];
  /** Shared with the people on your trips, or private (the default). Plan with AI counts both, with no names. */
  prefs_shared?: boolean;
}

/** Saves your preferences and whether the group sees them. */
export async function saveMyPrefs(cuisines: string[], activities: string[], shared: boolean): Promise<void> {
  const { error } = await supabase.rpc("save_my_prefs", { p_cuisines: cuisines, p_activities: activities, p_shared: shared });
  if (error) throw new Error(friendly(error));
}

/** What the people on a trip chose to share, by traveler. Empty on a database without preferences yet. */
export interface TripTaste {
  traveler_id: string;
  cuisines: string[];
  activities: string[];
}
export async function tripTastes(tripId: string): Promise<TripTaste[]> {
  const { data, error } = await supabase.rpc("trip_tastes", { p_trip: tripId });
  return error ? [] : ((data as TripTaste[] | null) ?? []);
}

/** Your profile, or null on a database that doesn't have profiles yet. */
export async function myProfile(): Promise<Profile | null> {
  const { data, error } = await supabase.rpc("my_profile");
  if (error) return null;
  return data as Profile;
}

/** Saves your profile and puts it on every trip you're on. Blank clears Venmo or Zelle. */
export async function saveMyProfile(p: { venmo: string; zelle: string; phone: string; locked: boolean }): Promise<void> {
  if (!venmoLooksRight(p.venmo)) throw new Error(VENMO_FORMAT);
  if (!zelleLooksRight(p.zelle)) throw new Error(ZELLE_FORMAT);
  if (p.phone.trim().length > 32) throw new Error("That phone number is too long.");
  const { error } = await supabase.rpc("save_my_profile", {
    p_venmo: cleanVenmo(p.venmo) ?? "",
    p_zelle: cleanZelle(p.zelle) ?? "",
    p_phone: p.phone.trim(),
    p_locked: p.locked,
  });
  if (error?.code === "23514") throw new Error(error.message.includes("zelle") ? ZELLE_FORMAT : error.message.includes("phone") ? "That phone number is too long." : VENMO_FORMAT);
  if (error) throw new Error(friendly(error));
}

/** Your own Venmo, Zelle and lock on one trip (after joining it), or null if this database has no Zelle yet. */
export async function myPayOn(tripId: string, userId: string): Promise<{ venmo: string | null; zelle: string | null; pay_locked: boolean } | null> {
  const { data, error } = await supabase.from("travelers").select("venmo, zelle, pay_locked").eq("trip_id", tripId).eq("user_id", userId).maybeSingle();
  if (error || !data) return null;
  return data as { venmo: string | null; zelle: string | null; pay_locked: boolean };
}

// ---------- People ----------

export interface PersonDraft {
  name: string;
  email: string;
  phone: string;
  role: Role;
  /** Their Venmo username, so people can pay them from Settle up (optional). */
  venmo?: string;
  /** Their Zelle phone or email (optional; C20). */
  zelle?: string;
}

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
      ...(cleanZelle(p.zelle ?? "") ? { zelle: cleanZelle(p.zelle ?? "") } : {}),
    })
    .select(TRAVELER_COLUMNS)
    .single();
  if (error?.code === "23514") throw new Error(error.message.includes("zelle") ? ZELLE_FORMAT : VENMO_FORMAT);
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
  /**
   * The trip before sign-up (C45, 11/23): who started it, how many plans it has and the next 3.
   * Left out by a database that doesn't have that migration yet; the invite then shows as before.
   */
  invited_by?: string | null;
  plan_count?: number;
  plans?: { title: string; kind: ItemKind; day: string; part: DayPart; start_time: string | null; status: ItemStatus }[];
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
  /** A web page for it, such as an Airbnb listing (C22). */
  link?: string | null;
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
export async function confirmItem(
  itemId: string,
  total: number,
  paidBy: string,
  mode: SplitMode,
  shares: ShareInput[],
  /** Everyone on the trip, so the people left off the bill are marked out of the plan too (C47). */
  everyone: string[] = [],
) {
  const { error } = await supabase.rpc("confirm_item", {
    p_item: itemId,
    p_total_cents: total,
    p_paid_by: paidBy,
    p_split_mode: mode,
    p_shares: shares,
  });
  if (error) throw new Error(friendly(error));
  // Who's in follows the bill (C47): the same people stay in or out if the bill is undone later.
  if (everyone.length) {
    const on = new Set(shares.map((s) => s.traveler_id));
    const { error: e2 } = await supabase
      .from("item_people")
      .upsert(everyone.map((id) => ({ item_id: itemId, traveler_id: id, going: on.has(id) })));
    if (e2) throw new Error(friendly(e2));
  }
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
): Promise<string> {
  const { data, error } = await supabase.rpc("save_expense", {
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
  return data as string;
}

// ---------- A cost in another currency (C33, Mike's call 11/21) ----------

/** The split bill's expense on a plan, once it's confirmed. */
export async function expenseIdForItem(itemId: string): Promise<string | null> {
  const { data, error } = await supabase.from("expenses").select("id").eq("item_id", itemId).eq("own", false).maybeSingle();
  if (error) throw new Error(friendly(error));
  return (data?.id as string | undefined) ?? null;
}

/** Owners: mark an expense as priced in another currency (an estimate, pending), or clear that with a null currency. */
export async function setExpenseFx(expenseId: string, foreign: { currency: string; cents: number } | null) {
  const { error } = await supabase.rpc("set_expense_fx", {
    p_expense: expenseId,
    p_currency: foreign?.currency ?? null,
    p_foreign_cents: foreign?.cents ?? null,
  });
  if (error) throw new Error(friendly(error));
}

/** Whoever paid, or an Owner: what the card charged in dollars (everyone's part scales to it), or null to keep the estimate. */
export async function settleFx(expenseId: string, totalCents: number | null) {
  const { error } = await supabase.rpc("settle_fx", { p_expense: expenseId, p_total_cents: totalCents });
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

/** What describing a trip hands back: the trip's name and stops, plans in import's format, and follow-up questions. */
export interface DescribeResult extends ImportResult {
  trip: { name: string; stops: { name: string; start_date: string; end_date: string }[] };
  questions: string[];
}

/**
 * Describe your trip (Start a trip): the person's own words become a trip, its plans and a few
 * questions. Nothing is saved; the app shows it all for review first.
 */
/** Where Start a trip leaves a description's plans and questions for the new trip's page, which picks them up once. */
export const describedKey = (tripId: string) => `triptab.described.${tripId}`;

export async function describeTrip(text: string): Promise<DescribeResult> {
  let testRun = false;
  try {
    testRun = localStorage.getItem("triptab.test_run") === "1";
  } catch {
    // storage can be unavailable
  }
  const { data, error } = await supabase.functions.invoke("describe-trip", { body: { text, test_run: testRun } });
  if (error) {
    let message = "Can't reach TripTab right now. Check your connection and try again, or fill in the form.";
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
  return data as DescribeResult;
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

// ---------- Also forward from (C31, Mike's call 11/21) ----------
// More addresses an account forwards bookings from, each confirmed by a code emailed there. The
// confirm-email Edge Function adds them and checks codes; a person reads and removes their own.

export interface ForwardFrom {
  id: string;
  email: string;
  confirmed_at: string | null;
  created_at: string;
}

/** The function's own message when it refused, else a general one. */
async function functionMessage(error: unknown, fallback: string): Promise<string> {
  const response = (error as { context?: unknown }).context;
  if (response instanceof Response) {
    try {
      const body = (await response.json()) as { error?: string };
      if (body?.error) return body.error;
    } catch {
      // not JSON
    }
  }
  return fallback;
}

export async function myForwardAddresses(): Promise<ForwardFrom[]> {
  const { data, error } = await supabase.from("forward_addresses").select("id, email, confirmed_at, created_at").order("created_at");
  return must(data as ForwardFrom[] | null, error) ?? [];
}

/** Sends a code to an address (a new one, or a fresh code for one still waiting). Dev test addresses get the code back. */
export async function addForwardAddress(email: string): Promise<{ id: string; confirmed: boolean; devCode: string | null }> {
  const { data, error } = await supabase.functions.invoke("confirm-email", { body: { action: "forward_add", email } });
  if (error) throw new Error(await functionMessage(error, "Couldn't send a code just now. Try again in a bit."));
  const d = data as { id: string; confirmed?: boolean; dev_code?: string };
  return { id: d.id, confirmed: Boolean(d.confirmed), devCode: d.dev_code ?? null };
}

export async function confirmForwardAddress(id: string, code: string): Promise<void> {
  const { error } = await supabase.functions.invoke("confirm-email", { body: { action: "forward_confirm", id, code } });
  if (error) throw new Error(await functionMessage(error, "Couldn't check that code just now. Try again."));
}

export async function removeForwardAddress(id: string): Promise<void> {
  const { data, error } = await supabase.from("forward_addresses").delete().eq("id", id).select("id");
  if (!must(data, error)?.length) throw new Error("Couldn't remove that address. Try again.");
}
