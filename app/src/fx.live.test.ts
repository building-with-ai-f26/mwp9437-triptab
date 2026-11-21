/**
 * A cost in another currency (C33, Mike's call 11/21), checked against TripTab dev: an Owner marks an
 * expense as priced in euros (an estimate, pending); whoever paid, or an Owner, enters what the card
 * charged, and everyone's part scales to it exactly; or keeps the estimate. Nobody else can. Own
 * costs stay in dollars. Run: npm run test:rls (needs app/.env.local).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signedIn } from "./test/live";

let owner: SupabaseClient;
let viewer: SupabaseClient;
let stranger: SupabaseClient;
let tripId: string;
const ids: Record<string, string> = {};
let chalet: string;
let chaletExpense: string;

const shares = (list: [string, number][]) => list.map(([who, cents]) => ({ traveler_id: ids[who], amount_cents: cents }));
const read = async () =>
  (await owner.from("expenses").select("total_cents, currency, foreign_cents, fx_pending, expense_shares(traveler_id, amount_cents)").eq("id", chaletExpense).single())
    .data!;

beforeAll(async () => {
  [owner, viewer, stranger] = await Promise.all([signedIn("fx-owner", "Mike"), signedIn("fx-viewer", "Vic"), signedIn("fx-stranger", "Stan")]);
  const { data } = await owner.rpc("create_trip", {
    p_name: "RLS test: costs in euros",
    p_stops: [{ name: "Chamonix", start_date: "2027-02-05", end_date: "2027-02-12" }],
    p_my_name: "Mike",
  });
  tripId = data as string;
  await owner.from("travelers").insert([
    { trip_id: tripId, name: "Vic", role: "viewer" },
    { trip_id: tripId, name: "Priya", role: "viewer" },
  ]);
  const { data: people } = await owner.from("travelers").select("id, name").eq("trip_id", tripId);
  for (const p of people ?? []) ids[p.name] = p.id;
  const { data: link } = await owner.from("trip_links").select("token").eq("trip_id", tripId).single();
  await viewer.rpc("join_trip", { p_token: link!.token, p_traveler_id: ids.Vic });
  const { data: item } = await owner.from("items").insert({ trip_id: tripId, title: "Chalet", day: "2027-02-05", part: "night", status: "planned" }).select("id").single();
  chalet = item!.id;
  // Vic paid EUR 6,947.50, about $7,635.30 at the day's rate, split three ways.
  const confirmed = await owner.rpc("confirm_item", {
    p_item: chalet,
    p_total_cents: 763530,
    p_paid_by: ids.Vic,
    p_split_mode: "even",
    p_shares: shares([["Mike", 254510], ["Vic", 254510], ["Priya", 254510]]),
  });
  expect(confirmed.error).toBeNull();
  chaletExpense = (await owner.from("expenses").select("id").eq("item_id", chalet).single()).data!.id;
});

afterAll(async () => {
  await owner.from("trips").delete().eq("id", tripId);
});

describe("marking a cost as in another currency", () => {
  it("is for the trip's Owners: not whoever paid, nor a stranger", async () => {
    for (const c of [viewer, stranger]) {
      const { error } = await c.rpc("set_expense_fx", { p_expense: chaletExpense, p_currency: "EUR", p_foreign_cents: 694750 });
      expect(error?.code).toBe("42501");
    }
  });

  it("keeps the amount as written and marks the dollars pending", async () => {
    const { error } = await owner.rpc("set_expense_fx", { p_expense: chaletExpense, p_currency: "eur", p_foreign_cents: 694750 });
    expect(error).toBeNull();
    const e = await read();
    expect([e.total_cents, e.currency, e.foreign_cents, e.fx_pending]).toEqual([763530, "EUR", 694750, true]);
  });

  it("refuses dollars, a made-up code or no amount as a foreign currency", async () => {
    for (const [cur, cents] of [["USD", 100], ["EURO", 100], ["EUR", null], ["EUR", -1]] as const) {
      const { error } = await owner.rpc("set_expense_fx", { p_expense: chaletExpense, p_currency: cur, p_foreign_cents: cents });
      expect(error?.code, `${cur} ${cents}`).toBe("22023");
    }
  });

  it("can't be written straight to the table", async () => {
    const { error } = await owner.from("expenses").update({ fx_pending: false }).eq("id", chaletExpense);
    expect(error?.code).toBe("42501");
  });
});

describe("settling the estimate", () => {
  it("is refused to someone who neither paid nor owns the trip", async () => {
    const { error } = await stranger.rpc("settle_fx", { p_expense: chaletExpense, p_total_cents: 770000 });
    expect(error?.code).toBe("42501");
    expect((await read()).fx_pending).toBe(true);
  });

  it("whoever paid enters the card's charge: every part scales to it and they add up exactly", async () => {
    const { error } = await viewer.rpc("settle_fx", { p_expense: chaletExpense, p_total_cents: 770001 });
    expect(error).toBeNull();
    const e = await read();
    expect(e.total_cents).toBe(770001);
    expect(e.fx_pending).toBe(false);
    expect(e.currency).toBe("EUR");
    const parts = e.expense_shares.map((s: { amount_cents: number }) => s.amount_cents).sort();
    expect(parts.reduce((a: number, b: number) => a + b, 0)).toBe(770001);
    expect(parts).toEqual([256667, 256667, 256667]);
  });

  it("once settled, it isn't pending, and settling again changes nothing", async () => {
    await viewer.rpc("settle_fx", { p_expense: chaletExpense, p_total_cents: 1 });
    expect((await read()).total_cents).toBe(770001);
  });

  it("an Owner can keep the estimate instead", async () => {
    await owner.rpc("set_expense_fx", { p_expense: chaletExpense, p_currency: "EUR", p_foreign_cents: 700000 });
    expect((await read()).fx_pending).toBe(true);
    const { error } = await owner.rpc("settle_fx", { p_expense: chaletExpense, p_total_cents: null });
    expect(error).toBeNull();
    const e = await read();
    expect([e.total_cents, e.fx_pending, e.foreign_cents]).toEqual([770001, false, 700000]);
  });

  it("an uneven split scales by each part, and the leftover cents go where the remainders are largest", async () => {
    await owner.rpc("confirm_item", {
      p_item: chalet,
      p_total_cents: 1000,
      p_paid_by: ids.Vic,
      p_split_mode: "exact",
      p_shares: shares([["Mike", 500], ["Vic", 300], ["Priya", 200]]),
    });
    await owner.rpc("set_expense_fx", { p_expense: chaletExpense, p_currency: "GBP", p_foreign_cents: 800 });
    await viewer.rpc("settle_fx", { p_expense: chaletExpense, p_total_cents: 1001 });
    const e = await read();
    const by = Object.fromEntries(e.expense_shares.map((s: { traveler_id: string; amount_cents: number }) => [s.traveler_id, s.amount_cents]));
    // 500.5, 300.3, 200.2: the floors add to 1000, and the one cent left goes to Mike's .5.
    expect([by[ids.Mike], by[ids.Vic], by[ids.Priya]]).toEqual([501, 300, 200]);
  });

  it("clearing the currency (re-entered in dollars) drops the mark", async () => {
    await owner.rpc("set_expense_fx", { p_expense: chaletExpense, p_currency: null, p_foreign_cents: null });
    const e = await read();
    expect([e.currency, e.foreign_cents, e.fx_pending]).toEqual([null, null, false]);
  });
});

describe("own costs", () => {
  it("stay in dollars: they can't be marked foreign", async () => {
    const { data: flight } = await owner
      .from("items").insert({ trip_id: tripId, title: "UA 956", kind: "flight", day: "2027-02-05", part: "evening", status: "planned", pay_mode: "own" })
      .select("id").single();
    await owner.rpc("log_own_line", { p_item: flight!.id, p_traveler: ids.Mike, p_cents: 99239, p_with_points: false });
    const own = (await owner.from("expenses").select("id").eq("item_id", flight!.id).eq("own", true).single()).data!;
    const { error } = await owner.rpc("set_expense_fx", { p_expense: own.id, p_currency: "EUR", p_foreign_cents: 90000 });
    expect(error?.code).toBe("22023");
  });
});
