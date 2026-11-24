/**
 * Payment schedules (T7, Mike's 11/23 ski trip test, C63), against the live database (TripTab dev):
 * an Owner adds, marks paid and removes a plan's payments; everyone on the trip reads them; a Viewer
 * can't change them; nobody puts a payment on another trip's plan, names a payer from another trip
 * or links another trip's to-do (AGENTS.md rule 10); strangers and signed-out visitors see nothing.
 * Run: npm run test:rls.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { client, signedIn } from "./test/live";

let owner: SupabaseClient;
let viewer: SupabaseClient;
let stranger: SupabaseClient;
let tripId: string;
let theirTrip: string;
let item: string;
let theirItem: string;
let mike: string;
let vic: string;
let stan: string;
let theirTodo: string;

const row = (over: Record<string, unknown> = {}) => ({
  trip_id: tripId,
  item_id: item,
  position: 0,
  amount_cents: 110000,
  currency: "EUR",
  foreign_cents: 100000,
  due_day: null,
  paid: true,
  paid_on: "2026-11-18",
  paid_by: mike,
  ...over,
});
const rows = async (c: SupabaseClient) => (await c.from("plan_payments").select("id, amount_cents, paid").eq("item_id", item).order("position")).data ?? [];

beforeAll(async () => {
  [owner, viewer, stranger] = await Promise.all([signedIn("pp-owner", "Mike"), signedIn("pp-viewer", "Vic"), signedIn("pp-stranger", "Stan")]);
  const trip = async (c: SupabaseClient, name: string, me: string) =>
    (await c.rpc("create_trip", { p_name: name, p_stops: [{ name: "Chamonix", start_date: "2027-02-05", end_date: "2027-02-12" }], p_my_name: me })).data as string;
  const spot = async (c: SupabaseClient, t: string, name: string) => (await c.from("travelers").select("id").eq("trip_id", t).eq("name", name).single()).data!.id as string;
  tripId = await trip(owner, "RLS test: payment schedule", "Mike");
  theirTrip = await trip(stranger, "RLS test: Stan's schedule trip", "Stan");
  vic = (await owner.from("travelers").insert({ trip_id: tripId, name: "Vic", role: "viewer" }).select("id").single()).data!.id as string;
  const { data: link } = await owner.from("trip_links").select("token").eq("trip_id", tripId).single();
  await viewer.rpc("join_trip", { p_token: link!.token, p_traveler_id: vic });
  mike = await spot(owner, tripId, "Mike");
  stan = await spot(stranger, theirTrip, "Stan");
  const stay = async (c: SupabaseClient, t: string) =>
    (await c.from("items").insert({ trip_id: t, kind: "stay", title: "Chalet", day: "2027-02-05", part: "night", end_day: "2027-02-12" }).select("id").single()).data!.id as string;
  item = await stay(owner, tripId);
  theirItem = await stay(stranger, theirTrip);
  theirTodo = (await stranger.from("action_items").insert({ trip_id: theirTrip, title: "Pay Chalet: payment 2" }).select("id").single()).data!.id as string;
});

afterAll(async () => {
  await owner?.from("trips").delete().eq("id", tripId);
  await stranger?.from("trips").delete().eq("id", theirTrip);
});

describe("a plan's payment schedule", () => {
  it("is added, marked paid and read by an Owner; everyone on the trip reads it", async () => {
    expect((await owner.from("plan_payments").insert(row())).error).toBeNull();
    const todo = (await owner.from("action_items").insert({ trip_id: tripId, title: "Pay Chalet: payment 2", assignee: mike, due_day: "2026-12-11" }).select("id").single()).data!.id;
    const second = await owner.from("plan_payments").insert(row({ position: 1, amount_cents: 220000, foreign_cents: 200000, paid: false, paid_on: null, due_day: "2026-12-11", action_id: todo })).select("id").single();
    expect(second.error).toBeNull();
    expect((await rows(viewer)).map((r) => [r.amount_cents, r.paid])).toEqual([[110000, true], [220000, false]]);
    expect((await owner.from("plan_payments").update({ paid: true, paid_on: "2026-12-10" }).eq("id", second.data!.id).select("id")).data).toHaveLength(1);
    expect((await rows(owner)).every((r) => r.paid)).toBe(true);
  });

  it("can't be changed by a Viewer", async () => {
    expect((await viewer.from("plan_payments").insert(row({ paid_by: vic }))).error?.code).toBe("42501");
    const [first] = await rows(owner);
    expect((await viewer.from("plan_payments").update({ amount_cents: 1 }).eq("id", first.id).select("id")).data).toEqual([]);
    await viewer.from("plan_payments").delete().eq("id", first.id);
    expect((await rows(owner)).length).toBe(2);
  });

  it("can't go on another trip's plan, name a payer from another trip or link another trip's to-do", async () => {
    expect((await owner.from("plan_payments").insert(row({ item_id: theirItem }))).error?.code).toBe("42501");
    expect((await owner.from("plan_payments").insert(row({ paid_by: stan }))).error?.code).toBe("42501");
    expect((await owner.from("plan_payments").insert(row({ action_id: theirTodo }))).error?.code).toBe("42501");
    expect((await stranger.from("plan_payments").insert(row({ trip_id: theirTrip, item_id: item, paid_by: stan }))).error?.code).toBe("42501");
  });

  it("is invisible to someone off the trip, and to anyone signed out", async () => {
    expect(await rows(stranger)).toEqual([]);
    expect(((await client().from("plan_payments").select("id")).data ?? []).length).toBe(0);
    expect((await client().from("plan_payments").insert(row())).error).not.toBeNull();
  });

  it("goes when its plan does", async () => {
    await owner.from("items").delete().eq("id", item);
    expect(((await owner.from("plan_payments").select("id").eq("trip_id", tripId)).data ?? []).length).toBe(0);
  });
});
