/**
 * Plans that span time, checked against the real database: an activity over several days and
 * parts, a flight that lands the next day, and the limits the database holds them to.
 * Run: npm run test:rls (needs app/.env.local).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signedIn } from "./test/live";

let owner: SupabaseClient;
let tripId: string;
const stops = [{ name: "Chamonix", start_date: "2027-02-05", end_date: "2027-02-12" }];
const add = (row: Record<string, unknown>) =>
  owner.from("items").insert({ trip_id: tripId, title: "Plan", day: "2027-02-06", part: "morning", status: "planned", ...row }).select("id, end_day, end_part, start_time, end_time").single();

beforeAll(async () => {
  owner = await signedIn("s-owner", "Mike");
  const { data } = await owner.rpc("create_trip", { p_name: "RLS test: spans", p_stops: stops, p_my_name: "Mike" });
  tripId = data as string;
});

afterAll(async () => {
  await owner.from("trips").delete().eq("id", tripId);
});

describe("plans that span time", () => {
  it("an activity can run over several parts and several days as one plan", async () => {
    const { data, error } = await add({ kind: "activity", title: "Skiing", end_day: "2027-02-11", end_part: "day" });
    expect(error).toBeNull();
    expect(data).toMatchObject({ end_day: "2027-02-11", end_part: "day" });
    const { data: all } = await owner.from("items").select("id").eq("trip_id", tripId).eq("title", "Skiing");
    expect(all).toHaveLength(1);
  });

  it("a flight keeps its departure and arrival times, and can land the next morning", async () => {
    const { data, error } = await add({ kind: "flight", title: "UA 57", day: "2027-02-05", part: "evening", end_day: "2027-02-06", end_part: "morning", start_time: "17:05", end_time: "07:10" });
    expect(error).toBeNull();
    expect(data).toMatchObject({ end_day: "2027-02-06", end_part: "morning", start_time: "17:05:00", end_time: "07:10:00" });
  });

  it("a flight home may land the day after the trip ends, and no later", async () => {
    expect((await add({ kind: "flight", title: "Home", day: "2027-02-12", part: "night", end_day: "2027-02-13", end_part: "morning" })).error).toBeNull();
    const late = await add({ kind: "flight", title: "Too late", day: "2027-02-12", part: "night", end_day: "2027-02-14" });
    expect(late.error?.message).toContain("can't arrive more than a day after the trip ends");
  });

  it("an activity's last day has to be inside the trip, and not before its first", async () => {
    expect((await add({ kind: "activity", end_day: "2027-02-13" })).error?.message).toContain("Pick a last day inside the trip");
    expect((await add({ kind: "activity", end_day: "2027-02-05" })).error).not.toBeNull();
  });

  it("on one day a plan can't end in an earlier part than it starts", async () => {
    expect((await add({ kind: "meal", part: "evening", end_part: "morning" })).error).not.toBeNull();
    expect((await add({ kind: "meal", part: "day", end_part: "evening" })).error).toBeNull();
  });

  it("a stay has nights, not parts or clock times", async () => {
    const { error } = await add({ kind: "stay", part: "night", end_day: "2027-02-08", end_part: "morning" });
    expect(error).not.toBeNull();
  });

  it("the trip's dates can't be cut so a spanning plan's last day falls outside them", async () => {
    const shorter = [{ name: "Chamonix", start_date: "2027-02-05", end_date: "2027-02-09" }];
    const { error } = await owner.rpc("update_trip", { p_trip: tripId, p_name: "RLS test: spans", p_stops: shorter });
    expect(error?.message).toContain("Some plans fall outside the new dates");
  });
});
