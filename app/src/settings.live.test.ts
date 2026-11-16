/**
 * Changing a trip after starting it (update_trip), checked against the real database.
 * Run: npm run test:rls (needs app/.env.local).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signedIn } from "./test/live";

let owner: SupabaseClient;
let viewer: SupabaseClient;
let stranger: SupabaseClient;
let tripId: string;

beforeAll(async () => {
  [owner, viewer, stranger] = await Promise.all([
    signedIn("s-owner", "Mike"),
    signedIn("s-viewer", "Vic"),
    signedIn("s-stranger", "Stan"),
  ]);
  const { data } = await owner.rpc("create_trip", {
    p_name: "RLS test: settings",
    p_stops: [{ name: "Chamonix", start_date: "2027-02-05", end_date: "2027-02-12" }],
    p_my_name: "Mike",
  });
  tripId = data as string;
  await owner.from("travelers").insert({ trip_id: tripId, name: "Vic", role: "viewer" });
  const { data: vic } = await owner.from("travelers").select("id").eq("trip_id", tripId).eq("name", "Vic").single();
  const { data: link } = await owner.from("trip_links").select("token").eq("trip_id", tripId).single();
  await viewer.rpc("join_trip", { p_token: link!.token, p_traveler_id: vic!.id });
  await owner.from("items").insert({ trip_id: tripId, title: "Ski day", day: "2027-02-10", part: "day" });
});

afterAll(async () => {
  await owner.from("trips").delete().eq("id", tripId);
});

const stops = (list: [string, string, string][]) => list.map(([name, start_date, end_date]) => ({ name, start_date, end_date }));

describe("changing a trip", () => {
  it("an owner renames it and changes its stops, and the dates follow the stops", async () => {
    const { error } = await owner.rpc("update_trip", {
      p_trip: tripId,
      p_name: "Euro ski trip (final)",
      p_stops: stops([["Chamonix", "2027-02-05", "2027-02-12"], ["Barcelona", "2027-02-12", "2027-02-14"]]),
    });
    expect(error).toBeNull();
    const { data: trip } = await viewer.from("trips").select("name, start_date, end_date").eq("id", tripId).single();
    expect(trip).toEqual({ name: "Euro ski trip (final)", start_date: "2027-02-05", end_date: "2027-02-14" });
    const { data: list } = await viewer.from("stops").select("name").eq("trip_id", tripId).order("position");
    expect(list?.map((s) => s.name)).toEqual(["Chamonix", "Barcelona"]);
  });

  it("refuses dates that would leave a plan outside the trip", async () => {
    const { error } = await owner.rpc("update_trip", {
      p_trip: tripId,
      p_name: "Shorter",
      p_stops: stops([["Chamonix", "2027-02-05", "2027-02-08"]]),
    });
    expect(error?.message).toMatch(/outside the new dates/);
    const { data } = await owner.from("trips").select("end_date").eq("id", tripId).single();
    expect(data?.end_date).toBe("2027-02-14");
  });

  it("a viewer or an outsider can't change it", async () => {
    const byViewer = await viewer.rpc("update_trip", { p_trip: tripId, p_name: "Mine", p_stops: stops([["X", "2027-02-05", "2027-02-14"]]) });
    expect(byViewer.error).not.toBeNull();
    const byStranger = await stranger.rpc("update_trip", { p_trip: tripId, p_name: "Mine", p_stops: stops([["X", "2027-02-05", "2027-02-14"]]) });
    expect(byStranger.error).not.toBeNull();
    const { data } = await owner.from("trips").select("name").eq("id", tripId).single();
    expect(data?.name).toBe("Euro ski trip (final)");
  });
});
