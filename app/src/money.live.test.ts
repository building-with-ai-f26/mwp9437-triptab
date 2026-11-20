/**
 * Build 3 money rules, checked against the real database: confirming a plan writes its cost,
 * who paid and who's in together; Confirmed means paid; general expenses; opting in and out;
 * and who may do each. Run: npm run test:rls (needs app/.env.local).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signedIn } from "./test/live";

let owner: SupabaseClient;
let viewer: SupabaseClient;
let stranger: SupabaseClient;
let tripId: string;
let otherTripId: string;
const ids: Record<string, string> = {};
let dinner: string;
let tickets: string;

const shares = (list: [string, number][]) => list.map(([who, cents]) => ({ traveler_id: ids[who], amount_cents: cents }));

beforeAll(async () => {
  [owner, viewer, stranger] = await Promise.all([
    signedIn("m-owner", "Mike"),
    signedIn("m-viewer", "Vic"),
    signedIn("m-stranger", "Stan"),
  ]);
  const { data } = await owner.rpc("create_trip", {
    p_name: "RLS test: money",
    p_stops: [{ name: "Chamonix", start_date: "2027-02-05", end_date: "2027-02-08" }],
    p_my_name: "Mike",
  });
  tripId = data as string;
  const other = await stranger.rpc("create_trip", {
    p_name: "RLS test: someone else's trip",
    p_stops: [{ name: "Lisbon", start_date: "2027-03-01", end_date: "2027-03-02" }],
    p_my_name: "Stan",
  });
  otherTripId = other.data as string;

  await owner.from("travelers").insert([
    { trip_id: tripId, name: "Vic", role: "viewer" },
    { trip_id: tripId, name: "Priya", role: "owner" },
  ]);
  const { data: people } = await owner.from("travelers").select("id, name").eq("trip_id", tripId);
  for (const p of people ?? []) ids[p.name] = p.id;
  const { data: link } = await owner.from("trip_links").select("token").eq("trip_id", tripId).single();
  await viewer.rpc("join_trip", { p_token: link!.token, p_traveler_id: ids.Vic });
  const { data: stan } = await stranger.from("travelers").select("id").eq("trip_id", otherTripId).single();
  ids.Stan = stan!.id;

  const { data: items } = await owner
    .from("items")
    .insert([
      { trip_id: tripId, title: "Fondue", day: "2027-02-06", part: "evening", status: "planned", est_cents: 12000 },
      { trip_id: tripId, title: "Lift tickets", day: "2027-02-07", part: "morning", status: "planned" },
    ])
    .select("id, title");
  dinner = items!.find((i) => i.title === "Fondue")!.id;
  tickets = items!.find((i) => i.title === "Lift tickets")!.id;
});

afterAll(async () => {
  await owner.from("trips").delete().eq("id", tripId);
  await stranger.from("trips").delete().eq("id", otherTripId);
});

describe("confirming a plan", () => {
  it("writes the cost, who paid and who's in, and marks it Confirmed, in one step", async () => {
    const { error } = await owner.rpc("confirm_item", {
      p_item: dinner,
      p_total_cents: 12000,
      p_paid_by: ids.Mike,
      p_split_mode: "even",
      p_shares: shares([["Mike", 4000], ["Vic", 4000], ["Priya", 4000]]),
    });
    expect(error).toBeNull();
    const { data: item } = await owner.from("items").select("status").eq("id", dinner).single();
    expect(item?.status).toBe("confirmed");
    const { data: exp } = await owner.from("expenses").select("id, total_cents, paid_by, expense_shares(amount_cents)").eq("item_id", dinner).single();
    expect(exp?.total_cents).toBe(12000);
    expect(exp?.paid_by).toBe(ids.Mike);
    expect(exp?.expense_shares).toHaveLength(3);
  });

  it("can mark a plan Confirmed without a cost, and back (C21, 11/20)", async () => {
    const up = await owner.from("items").update({ status: "confirmed" }).eq("id", tickets);
    expect(up.error).toBeNull();
    const back = await owner.from("items").update({ status: "planned" }).eq("id", tickets);
    expect(back.error).toBeNull();
    const add = await owner.from("items").insert({ trip_id: tripId, title: "Christening", day: "2027-02-06", status: "confirmed" }).select("id").single();
    expect(add.error).toBeNull();
    await owner.from("items").delete().eq("id", add.data!.id);
  });

  it("can't quietly un-confirm a paid plan", async () => {
    const { error } = await owner.from("items").update({ status: "planned" }).eq("id", dinner);
    expect(error?.message).toMatch(/Undo the confirmation/);
  });

  it("refuses a split that doesn't add up, or someone who isn't on the trip", async () => {
    const short = await owner.rpc("confirm_item", {
      p_item: tickets, p_total_cents: 9000, p_paid_by: ids.Mike, p_split_mode: "exact",
      p_shares: shares([["Mike", 3000], ["Vic", 3000]]),
    });
    expect(short.error?.message).toMatch(/add up to the cost/);
    const outsider = await owner.rpc("confirm_item", {
      p_item: tickets, p_total_cents: 6000, p_paid_by: ids.Mike, p_split_mode: "exact",
      p_shares: shares([["Mike", 3000], ["Stan", 3000]]),
    });
    expect(outsider.error?.message).toMatch(/on the trip/);
    const { data } = await owner.from("items").select("status").eq("id", tickets).single();
    expect(data?.status).toBe("planned");
  });

  it("confirming again edits the same expense instead of adding a second", async () => {
    await owner.rpc("confirm_item", {
      p_item: dinner, p_total_cents: 9000, p_paid_by: ids.Priya, p_split_mode: "exact",
      p_shares: shares([["Mike", 5000], ["Priya", 4000]]),
    });
    const { data } = await owner.from("expenses").select("total_cents, paid_by, expense_shares(traveler_id)").eq("item_id", dinner);
    expect(data).toHaveLength(1);
    expect(data?.[0].total_cents).toBe(9000);
    expect(data?.[0].expense_shares).toHaveLength(2);
  });

  it("a free plan confirms at $0", async () => {
    const { error } = await owner.rpc("confirm_item", {
      p_item: tickets, p_total_cents: 0, p_paid_by: ids.Mike, p_split_mode: "even",
      p_shares: shares([["Mike", 0], ["Vic", 0]]),
    });
    expect(error).toBeNull();
  });

  it("undo removes the expense and puts the plan back to Planned", async () => {
    const { error } = await owner.rpc("unconfirm_item", { p_item: tickets });
    expect(error).toBeNull();
    const { data: exp } = await owner.from("expenses").select("id").eq("item_id", tickets);
    expect(exp).toEqual([]);
    const { data: item } = await owner.from("items").select("status").eq("id", tickets).single();
    expect(item?.status).toBe("planned");
  });
});

describe("general expenses", () => {
  let groceries: string;
  it("an owner puts a grocery run on the tab without a plan", async () => {
    const { data, error } = await owner.rpc("save_expense", {
      p_trip: tripId, p_expense: null, p_description: "Groceries for the chalet", p_day: "2027-02-05",
      p_total_cents: 8400, p_paid_by: ids.Vic, p_split_mode: "shares",
      p_shares: [
        { traveler_id: ids.Mike, amount_cents: 4200, weight: 2 },
        { traveler_id: ids.Vic, amount_cents: 2100, weight: 1 },
        { traveler_id: ids.Priya, amount_cents: 2100, weight: 1 },
      ],
    });
    expect(error).toBeNull();
    groceries = data as string;
    const { data: exp } = await viewer.from("expenses").select("item_id, split_mode").eq("id", groceries).single();
    expect(exp).toEqual({ item_id: null, split_mode: "shares" });
  });

  it("an owner can delete a general expense, but not a plan's expense directly", async () => {
    const plan = await owner.from("expenses").delete().eq("item_id", dinner).select();
    expect(plan.data ?? []).toEqual([]);
    const gen = await owner.from("expenses").delete().eq("id", groceries).select();
    expect(gen.data).toHaveLength(1);
  });

  it("someone who paid can't be taken off the trip while their expense stands", async () => {
    const { error } = await owner.from("travelers").delete().eq("id", ids.Priya);
    expect(error).not.toBeNull();
  });
});

describe("who can see and change money", () => {
  it("a viewer sees the expenses and everyone's share", async () => {
    const { data } = await viewer.from("expenses").select("total_cents, expense_shares(amount_cents)").eq("trip_id", tripId);
    expect(data?.length).toBeGreaterThan(0);
  });

  it("a viewer can't confirm, undo, add or delete expenses", async () => {
    const confirm = await viewer.rpc("confirm_item", {
      p_item: tickets, p_total_cents: 100, p_paid_by: ids.Vic, p_split_mode: "even", p_shares: shares([["Vic", 100]]),
    });
    expect(confirm.error).not.toBeNull();
    const undo = await viewer.rpc("unconfirm_item", { p_item: dinner });
    expect(undo.error).not.toBeNull();
    const add = await viewer.rpc("save_expense", {
      p_trip: tripId, p_expense: null, p_description: "x", p_day: null, p_total_cents: 100,
      p_paid_by: ids.Vic, p_split_mode: "even", p_shares: shares([["Vic", 100]]),
    });
    expect(add.error).not.toBeNull();
    const raw = await viewer.from("expenses").insert({ trip_id: tripId, description: "x", total_cents: 1, paid_by: ids.Vic });
    expect(raw.error).not.toBeNull();
  });

  it("someone not on the trip sees no money at all", async () => {
    const { data } = await stranger.from("expenses").select("*").eq("trip_id", tripId);
    expect(data).toEqual([]);
    const { data: s } = await stranger.from("expense_shares").select("*").eq("traveler_id", ids.Mike);
    expect(s).toEqual([]);
  });
});

describe("opting in and out", () => {
  it("a viewer can opt themselves out of a plan", async () => {
    const { error } = await viewer.from("item_people").upsert({ item_id: tickets, traveler_id: ids.Vic, going: false });
    expect(error).toBeNull();
    const { data } = await owner.from("item_people").select("going").eq("item_id", tickets).eq("traveler_id", ids.Vic).single();
    expect(data?.going).toBe(false);
  });

  it("a viewer can't opt someone else in or out", async () => {
    const { error } = await viewer.from("item_people").upsert({ item_id: tickets, traveler_id: ids.Priya, going: false });
    expect(error).not.toBeNull();
  });

  it("an owner can set who's going for anyone", async () => {
    const { error } = await owner.from("item_people").upsert({ item_id: tickets, traveler_id: ids.Priya, going: false });
    expect(error).toBeNull();
  });

  it("someone not on the trip can't touch it", async () => {
    const { error } = await stranger.from("item_people").upsert({ item_id: tickets, traveler_id: ids.Stan, going: true });
    expect(error).not.toBeNull();
  });
});

describe("deleting a trip", () => {
  it("a viewer can't; an owner can, expenses and all", async () => {
    const byViewer = await viewer.from("trips").delete().eq("id", tripId).select();
    expect(byViewer.data ?? []).toEqual([]);
    const { data: before } = await owner.from("expenses").select("id").eq("trip_id", tripId);
    expect(before?.length).toBeGreaterThan(0);
    const del = await owner.from("trips").delete().eq("id", tripId).select();
    expect(del.error).toBeNull();
    expect(del.data).toHaveLength(1);
  });
});
