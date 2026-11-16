/**
 * Action items (Build 4), checked against the real database: owners add and assign them,
 * everyone on the trip sees them, and the person an item is assigned to can tick it off.
 * Run: npm run test:rls (needs app/.env.local).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signedIn } from "./test/live";

let owner: SupabaseClient;
let vic: SupabaseClient;
let sam: SupabaseClient;
let stranger: SupabaseClient;
let tripId: string;
const ids: Record<string, string> = {};
let flights: string;
let dinner: string;

beforeAll(async () => {
  [owner, vic, sam, stranger] = await Promise.all([
    signedIn("a-owner", "Mike"),
    signedIn("a-vic", "Vic"),
    signedIn("a-sam", "Sam"),
    signedIn("a-stranger", "Stan"),
  ]);
  const { data } = await owner.rpc("create_trip", {
    p_name: "RLS test: action items",
    p_stops: [{ name: "Barcelona", start_date: "2027-02-12", end_date: "2027-02-13" }],
    p_my_name: "Mike",
  });
  tripId = data as string;
  await owner.from("travelers").insert([
    { trip_id: tripId, name: "Vic", role: "viewer" },
    { trip_id: tripId, name: "Sam", role: "viewer" },
  ]);
  const { data: people } = await owner.from("travelers").select("id, name").eq("trip_id", tripId);
  for (const p of people ?? []) ids[p.name] = p.id;
  const { data: link } = await owner.from("trip_links").select("token").eq("trip_id", tripId).single();
  await vic.rpc("join_trip", { p_token: link!.token, p_traveler_id: ids.Vic });
  await sam.rpc("join_trip", { p_token: link!.token, p_traveler_id: ids.Sam });
});

afterAll(async () => {
  await owner.from("trips").delete().eq("id", tripId);
});

describe("action items", () => {
  it("an owner adds them and hands them out", async () => {
    const { data, error } = await owner
      .from("action_items")
      .insert([
        { trip_id: tripId, title: "Book the Barcelona flight", assignee: ids.Vic, due_day: "2027-01-15" },
        { trip_id: tripId, title: "Thursday night plans", assignee: ids.Sam },
      ])
      .select("id, title");
    expect(error).toBeNull();
    flights = data!.find((a) => a.title.startsWith("Book"))!.id;
    dinner = data!.find((a) => a.title.startsWith("Thursday"))!.id;
  });

  it("can only be assigned to someone on the trip", async () => {
    const { data: other } = await stranger.rpc("create_trip", {
      p_name: "RLS test: elsewhere",
      p_stops: [{ name: "Lisbon", start_date: "2027-03-01", end_date: "2027-03-02" }],
      p_my_name: "Stan",
    });
    const { data: stan } = await stranger.from("travelers").select("id").eq("trip_id", other).single();
    const { error } = await owner.from("action_items").update({ assignee: stan!.id }).eq("id", flights);
    expect(error?.message).toMatch(/someone on the trip/);
    await stranger.from("trips").delete().eq("id", other);
  });

  it("everyone on the trip sees who has what; nobody else sees anything", async () => {
    const { data } = await vic.from("action_items").select("title, assignee").eq("trip_id", tripId);
    expect(data).toHaveLength(2);
    const { data: none } = await stranger.from("action_items").select("*").eq("trip_id", tripId);
    expect(none).toEqual([]);
  });

  it("the person it's assigned to can tick it off, even as a viewer", async () => {
    const { error } = await vic.rpc("set_action_done", { p_id: flights, p_done: true });
    expect(error).toBeNull();
    const { data } = await owner.from("action_items").select("done, done_at").eq("id", flights).single();
    expect(data?.done).toBe(true);
    expect(data?.done_at).not.toBeNull();
  });

  it("someone else can't tick it off, and a viewer can't add, edit or delete", async () => {
    const tick = await vic.rpc("set_action_done", { p_id: dinner, p_done: true });
    expect(tick.error?.message).toMatch(/assigned to/);
    const add = await vic.from("action_items").insert({ trip_id: tripId, title: "Mine" });
    expect(add.error).not.toBeNull();
    const edit = await vic.from("action_items").update({ assignee: ids.Vic }).eq("id", dinner).select();
    expect(edit.data ?? []).toEqual([]);
    const del = await vic.from("action_items").delete().eq("id", dinner).select();
    expect(del.data ?? []).toEqual([]);
    const out = await stranger.rpc("set_action_done", { p_id: dinner, p_done: true });
    expect(out.error).not.toBeNull();
  });

  it("an owner can reassign, untick and delete", async () => {
    const re = await owner.from("action_items").update({ assignee: ids.Vic }).eq("id", dinner).select();
    expect(re.data).toHaveLength(1);
    const untick = await owner.rpc("set_action_done", { p_id: flights, p_done: false });
    expect(untick.error).toBeNull();
    const { data } = await owner.from("action_items").select("done, done_at").eq("id", flights).single();
    expect(data).toEqual({ done: false, done_at: null });
    const del = await owner.from("action_items").delete().eq("id", dinner).select();
    expect(del.data).toHaveLength(1);
  });
});
