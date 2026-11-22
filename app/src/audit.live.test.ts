/**
 * The 11/22 security audit's fixes, checked against the real database (SECURITY.md,
 * journal/security/README.md). Each of these failed before migration
 * 20261122080000_audit_expense_caps_privileges.sql and passes after. Run: npm run test:rls.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { client, signedIn } from "./test/live";

let owner: SupabaseClient;
let viewer: SupabaseClient;
let tripId: string;
let viewersOwnTrip: string;
let expenseId: string;
const ids: Record<string, string> = {};

const split = async () => {
  const { data } = await owner.from("expense_shares").select("traveler_id, amount_cents").eq("expense_id", expenseId).order("traveler_id");
  return data;
};

beforeAll(async () => {
  [owner, viewer] = await Promise.all([signedIn("au-owner", "Olive"), signedIn("au-viewer", "Vic")]);
  const { data } = await owner.rpc("create_trip", {
    p_name: "RLS test: audit",
    p_stops: [{ name: "Chamonix", start_date: "2027-02-05", end_date: "2027-02-08" }],
    p_my_name: "Olive",
  });
  tripId = data as string;
  await owner.from("travelers").insert([{ trip_id: tripId, name: "Vic", role: "viewer" }, { trip_id: tripId, name: "Priya", role: "viewer" }]);
  const { data: people } = await owner.from("travelers").select("id, name").eq("trip_id", tripId);
  for (const p of people ?? []) ids[p.name] = p.id;
  const { data: link } = await owner.from("trip_links").select("token").eq("trip_id", tripId).single();
  await viewer.rpc("join_trip", { p_token: link!.token, p_traveler_id: ids.Vic });
  const saved = await owner.rpc("save_expense", {
    p_trip: tripId, p_expense: null, p_description: "Groceries", p_day: "2027-02-06", p_total_cents: 9000, p_paid_by: ids.Olive, p_split_mode: "even",
    p_shares: [{ traveler_id: ids.Olive, amount_cents: 3000 }, { traveler_id: ids.Vic, amount_cents: 3000 }, { traveler_id: ids.Priya, amount_cents: 3000 }],
  });
  expenseId = saved.data as string;
  // The Viewer's own trip, where they are the Owner.
  const own = await viewer.rpc("create_trip", {
    p_name: "RLS test: audit, the viewer's own trip",
    p_stops: [{ name: "Lisbon", start_date: "2027-03-01", end_date: "2027-03-02" }],
    p_my_name: "Vic",
  });
  viewersOwnTrip = own.data as string;
  const { data: me } = await viewer.from("travelers").select("id").eq("trip_id", viewersOwnTrip).single();
  ids.VicOnOwnTrip = me!.id;
});

afterAll(async () => {
  await owner.from("trips").delete().eq("id", tripId);
  await viewer.from("trips").delete().eq("id", viewersOwnTrip);
});

describe("an expense can only be edited through its own trip", () => {
  it("a Viewer can't rewrite its split from a trip of their own", async () => {
    const before = await split();
    expect(before).toHaveLength(3);
    const { error } = await viewer.rpc("save_expense", {
      p_trip: viewersOwnTrip, p_expense: expenseId, p_description: "x", p_day: "2027-03-01", p_total_cents: 9000,
      p_paid_by: ids.VicOnOwnTrip, p_split_mode: "even", p_shares: [{ traveler_id: ids.VicOnOwnTrip, amount_cents: 9000 }],
    });
    expect(error?.message).toMatch(/That expense is gone/);
    expect(await split()).toEqual(before);
    const { data: exp } = await owner.from("expenses").select("description, total_cents, paid_by").eq("id", expenseId).single();
    expect(exp).toEqual({ description: "Groceries", total_cents: 9000, paid_by: ids.Olive });
  });

  it("the Owner still edits it on its own trip", async () => {
    const { error } = await owner.rpc("save_expense", {
      p_trip: tripId, p_expense: expenseId, p_description: "Groceries and wine", p_day: "2027-02-06", p_total_cents: 10000, p_paid_by: ids.Olive, p_split_mode: "even",
      p_shares: [{ traveler_id: ids.Olive, amount_cents: 5000 }, { traveler_id: ids.Vic, amount_cents: 5000 }],
    });
    expect(error).toBeNull();
    expect(await split()).toHaveLength(2);
  });
});

describe("who added a plan or a to-do can't be forged", () => {
  it("a plan added with someone else as created_by carries the Owner who added it", async () => {
    const { data: me } = await owner.auth.getUser();
    const { data: them } = await viewer.auth.getUser();
    const { data, error } = await owner.from("items").insert({ trip_id: tripId, title: "Forged", day: "2027-02-06", part: "day", created_by: them.user!.id }).select("created_by").single();
    expect(error).toBeNull();
    expect(data?.created_by).toBe(me.user!.id);
    const todo = await owner.from("action_items").insert({ trip_id: tripId, title: "Forged to-do", created_by: them.user!.id }).select("created_by").single();
    expect(todo.error).toBeNull();
    expect(todo.data?.created_by).toBe(me.user!.id);
  });
});

describe("the AI caps' count belongs to the server", () => {
  it("nobody can call it from the app, signed in or not", async () => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: me } = await owner.auth.getUser();
    for (const c of [owner, viewer, client()]) {
      const { data, error } = await c.rpc("ai_spend_today", { p_since: since, p_user: me.user!.id });
      expect(error).not.toBeNull();
      expect(data).toBeNull();
    }
  });
});
