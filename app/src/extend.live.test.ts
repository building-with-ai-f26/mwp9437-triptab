/**
 * Extending a trip in one tap (Mike's call, 11/16), checked against the real database: an Owner
 * can stretch the trip up to a week at either end, the stops follow, nothing shrinks, and nobody
 * else can do it. Run: npm run test:rls (needs app/.env.local).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signedIn } from "./test/live";

let owner: SupabaseClient;
let viewer: SupabaseClient;
let stranger: SupabaseClient;
let tripId: string;

const dates = async () => {
  const { data: trip } = await owner.from("trips").select("start_date, end_date").eq("id", tripId).single();
  const { data: stops } = await owner.from("stops").select("name, start_date, end_date").eq("trip_id", tripId).order("position");
  return { trip, stops };
};

beforeAll(async () => {
  [owner, viewer, stranger] = await Promise.all([signedIn("x-owner", "Mike"), signedIn("x-viewer", "Vic"), signedIn("x-stranger", "Stan")]);
  const { data } = await owner.rpc("create_trip", {
    p_name: "RLS test: extend",
    p_stops: [
      { name: "Chamonix", start_date: "2027-02-05", end_date: "2027-02-12" },
      { name: "Andorra", start_date: "2027-02-12", end_date: "2027-02-16" },
    ],
    p_my_name: "Mike",
  });
  tripId = data as string;
  await owner.from("travelers").insert({ trip_id: tripId, name: "Vic", role: "viewer" });
  const { data: vic } = await owner.from("travelers").select("id").eq("trip_id", tripId).eq("name", "Vic").single();
  const { data: link } = await owner.from("trip_links").select("token").eq("trip_id", tripId).single();
  await viewer.rpc("join_trip", { p_token: link!.token, p_traveler_id: vic!.id });
});

afterAll(async () => {
  await owner.from("trips").delete().eq("id", tripId);
});

describe("extending a trip in one tap", () => {
  it("a day before the trip moves the first stop and the trip's start", async () => {
    expect((await owner.rpc("extend_trip", { p_trip: tripId, p_day: "2027-02-04" })).error).toBeNull();
    const { trip, stops } = await dates();
    expect(trip).toEqual({ start_date: "2027-02-04", end_date: "2027-02-16" });
    expect(stops![0]).toMatchObject({ name: "Chamonix", start_date: "2027-02-04", end_date: "2027-02-12" });
    expect(stops![1]).toMatchObject({ name: "Andorra", start_date: "2027-02-12", end_date: "2027-02-16" });
  });

  it("then a plan on that day is allowed", async () => {
    const { error } = await owner.from("items").insert({ trip_id: tripId, kind: "flight", title: "UA 57", day: "2027-02-04", part: "evening" });
    expect(error).toBeNull();
  });

  it("a day after the trip moves the last stop and the trip's end", async () => {
    expect((await owner.rpc("extend_trip", { p_trip: tripId, p_day: "2027-02-18" })).error).toBeNull();
    const { trip, stops } = await dates();
    expect(trip).toEqual({ start_date: "2027-02-04", end_date: "2027-02-18" });
    expect(stops![1]).toMatchObject({ name: "Andorra", start_date: "2027-02-12", end_date: "2027-02-18" });
  });

  it("a day inside the trip changes nothing; it never shrinks", async () => {
    expect((await owner.rpc("extend_trip", { p_trip: tripId, p_day: "2027-02-10" })).error).toBeNull();
    expect((await dates()).trip).toEqual({ start_date: "2027-02-04", end_date: "2027-02-18" });
  });

  it("more than a week outside is refused, and the dates stay", async () => {
    const far = await owner.rpc("extend_trip", { p_trip: tripId, p_day: "2027-02-26" });
    expect(far.error?.message).toContain("more than a week outside the trip");
    expect((await dates()).trip).toEqual({ start_date: "2027-02-04", end_date: "2027-02-18" });
  });

  it("a Viewer or an outsider can't extend it", async () => {
    expect((await viewer.rpc("extend_trip", { p_trip: tripId, p_day: "2027-02-19" })).error).not.toBeNull();
    expect((await stranger.rpc("extend_trip", { p_trip: tripId, p_day: "2027-02-19" })).error).not.toBeNull();
    expect((await dates()).trip).toEqual({ start_date: "2027-02-04", end_date: "2027-02-18" });
  });

  it("the 60-day cap still holds", async () => {
    const { data } = await owner.rpc("create_trip", {
      p_name: "RLS test: extend cap",
      p_stops: [{ name: "Long", start_date: "2027-03-01", end_date: "2027-04-28" }],
      p_my_name: "Mike",
    });
    const longId = data as string;
    const res = await owner.rpc("extend_trip", { p_trip: longId, p_day: "2027-05-03" });
    expect(res.error?.message).toContain("up to 60 days");
    await owner.from("trips").delete().eq("id", longId);
  });
});
