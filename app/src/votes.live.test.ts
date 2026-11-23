/**
 * Votes on Suggested plans (11/23 review, item 7), against the live database (TripTab dev): anyone
 * on a trip adds or takes back their own thumbs up; nobody votes as someone else or on another
 * trip's plan; strangers and signed-out visitors see and do nothing. Run: npm run test:rls.
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

const votes = async (c: SupabaseClient, id: string) => ((await c.from("item_votes").select("traveler_id").eq("item_id", id)).data ?? []).map((v) => v.traveler_id).sort();

beforeAll(async () => {
  [owner, viewer, stranger] = await Promise.all([signedIn("v-owner", "Mike"), signedIn("v-viewer", "Vic"), signedIn("v-stranger", "Stan")]);
  const trip = async (c: SupabaseClient, name: string, me: string) =>
    (await c.rpc("create_trip", { p_name: name, p_stops: [{ name: "Chamonix", start_date: "2027-02-05", end_date: "2027-02-08" }], p_my_name: me })).data as string;
  const spot = async (c: SupabaseClient, t: string, name: string) => (await c.from("travelers").select("id").eq("trip_id", t).eq("name", name).single()).data!.id as string;
  tripId = await trip(owner, "RLS test: votes", "Mike");
  theirTrip = await trip(stranger, "RLS test: Stan's votes trip", "Stan");
  vic = (await owner.from("travelers").insert({ trip_id: tripId, name: "Vic", role: "viewer" }).select("id").single()).data!.id as string;
  const { data: link } = await owner.from("trip_links").select("token").eq("trip_id", tripId).single();
  await viewer.rpc("join_trip", { p_token: link!.token, p_traveler_id: vic });
  mike = await spot(owner, tripId, "Mike");
  stan = await spot(stranger, theirTrip, "Stan");
  const plan = async (c: SupabaseClient, t: string) =>
    (await c.from("items").insert({ trip_id: t, title: "Glacier hike", day: "2027-02-06", part: "day" }).select("id").single()).data!.id as string;
  item = await plan(owner, tripId);
  theirItem = await plan(stranger, theirTrip);
});

afterAll(async () => {
  await owner?.from("trips").delete().eq("id", tripId);
  await stranger?.from("trips").delete().eq("id", theirTrip);
});

describe("a thumbs up on a plan", () => {
  it("is added by anyone on the trip, a Viewer included, once each", async () => {
    expect((await owner.from("item_votes").insert({ item_id: item, traveler_id: mike })).error).toBeNull();
    expect((await viewer.from("item_votes").insert({ item_id: item, traveler_id: vic })).error).toBeNull();
    expect((await viewer.from("item_votes").insert({ item_id: item, traveler_id: vic })).error?.code).toBe("23505");
    expect(await votes(viewer, item)).toEqual([mike, vic].sort());
  });

  it("can't be cast as someone else, an Owner included", async () => {
    expect((await viewer.from("item_votes").delete().eq("item_id", item).eq("traveler_id", vic)).error).toBeNull();
    expect((await owner.from("item_votes").insert({ item_id: item, traveler_id: vic })).error?.code).toBe("42501");
    expect((await viewer.from("item_votes").insert({ item_id: item, traveler_id: mike })).error?.code).toBe("42501");
    expect(await votes(owner, item)).toEqual([mike]);
  });

  it("can't be taken back by anyone but its person", async () => {
    await viewer.from("item_votes").delete().eq("item_id", item).eq("traveler_id", mike);
    expect(await votes(owner, item)).toEqual([mike]);
    await owner.from("item_votes").delete().eq("item_id", item).eq("traveler_id", mike);
    expect(await votes(owner, item)).toEqual([]);
  });

  it("can't pair your own spot with another trip's plan, or their spot with yours", async () => {
    expect((await owner.from("item_votes").insert({ item_id: theirItem, traveler_id: mike })).error?.code).toBe("42501");
    expect((await stranger.from("item_votes").insert({ item_id: item, traveler_id: stan })).error?.code).toBe("42501");
  });

  it("is invisible to someone off the trip, and to anyone signed out", async () => {
    await owner.from("item_votes").insert({ item_id: item, traveler_id: mike });
    expect(await votes(stranger, item)).toEqual([]);
    expect(((await client().from("item_votes").select("traveler_id")).data ?? []).length).toBe(0);
    expect((await client().from("item_votes").insert({ item_id: item, traveler_id: mike })).error).not.toBeNull();
  });

  it("goes when its plan does", async () => {
    await owner.from("items").delete().eq("id", item);
    expect(await votes(owner, item)).toEqual([]);
  });
});
