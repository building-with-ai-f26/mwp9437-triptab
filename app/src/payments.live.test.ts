/**
 * Recorded payments (Build 3), against the live database (TripTab dev): who can record one, who
 * can see and remove it, and that nobody can fake who recorded it or reach another trip.
 * Plus Venmo usernames: you set your own, on all your trips at once. Run: npm run test:rls.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signedIn } from "./test/live";

let owner: SupabaseClient;
let viewer: SupabaseClient;
let stranger: SupabaseClient;
let tripId: string;
let otherTrip: string;
let mike: string;
let vic: string;
let priya: string;
let stan: string;

const pay = (c: SupabaseClient, from: string, to: string, cents = 5000, trip = tripId) =>
  c.from("payments").insert({ trip_id: trip, from_traveler: from, to_traveler: to, amount_cents: cents, method: "venmo" }).select("id, created_by").single();

beforeAll(async () => {
  [owner, viewer, stranger] = await Promise.all([signedIn("p-owner", "Mike"), signedIn("p-viewer", "Vic"), signedIn("p-stranger", "Stan")]);
  const { data } = await owner.rpc("create_trip", {
    p_name: "RLS test: payments",
    p_stops: [{ name: "Chamonix", start_date: "2027-02-05", end_date: "2027-02-08" }],
    p_my_name: "Mike",
  });
  tripId = data as string;
  const { data: me } = await owner.from("travelers").select("id").eq("trip_id", tripId).single();
  mike = me!.id;
  const add = async (name: string) => (await owner.from("travelers").insert({ trip_id: tripId, name, role: "viewer" }).select("id").single()).data!.id as string;
  vic = await add("Vic");
  priya = await add("Priya");
  const { data: link } = await owner.from("trip_links").select("token").eq("trip_id", tripId).single();
  await viewer.rpc("join_trip", { p_token: link!.token, p_traveler_id: vic });
  const { data: theirs } = await stranger.rpc("create_trip", {
    p_name: "RLS test: someone else's trip",
    p_stops: [{ name: "Paris", start_date: "2027-03-01", end_date: "2027-03-02" }],
    p_my_name: "Stan",
  });
  otherTrip = theirs as string;
  stan = (await stranger.from("travelers").select("id").eq("trip_id", otherTrip).single()).data!.id;
});

afterAll(async () => {
  await owner.from("trips").delete().eq("id", tripId);
  await stranger.from("trips").delete().eq("id", otherTrip);
});

describe("recording a payment", () => {
  it("a Viewer records one they made, and it's theirs", async () => {
    const { data, error } = await pay(viewer, vic, mike);
    expect(error).toBeNull();
    const { data: who } = await viewer.auth.getUser();
    expect(data!.created_by).toBe(who.user!.id);
  });

  it("a Viewer records one they received", async () => {
    expect((await pay(viewer, mike, vic, 1000)).error).toBeNull();
  });

  it("a Viewer can't record one between two other people", async () => {
    expect((await pay(viewer, priya, mike)).error).not.toBeNull();
  });

  it("an Owner records one between any two people on the trip", async () => {
    expect((await pay(owner, priya, vic, 2500)).error).toBeNull();
  });

  it("a stranger can't record one on the trip, even naming themselves", async () => {
    expect((await pay(stranger, stan, mike)).error).not.toBeNull();
    expect((await pay(stranger, vic, mike)).error).not.toBeNull();
  });

  it("someone from another trip can't be on either side", async () => {
    expect((await pay(owner, stan, mike)).error).not.toBeNull();
    expect((await pay(owner, mike, stan)).error).not.toBeNull();
  });

  it("nobody fakes who recorded it", async () => {
    const { error } = await owner
      .from("payments")
      .insert({ trip_id: tripId, from_traveler: priya, to_traveler: mike, amount_cents: 100, created_by: "00000000-0000-0000-0000-000000000000" });
    expect(error).not.toBeNull();
  });

  it("a payment needs two different people and an amount", async () => {
    expect((await pay(owner, mike, mike)).error).not.toBeNull();
    expect((await pay(owner, priya, mike, 0)).error).not.toBeNull();
    expect((await pay(owner, priya, mike, -500)).error).not.toBeNull();
  });
});

describe("seeing and removing payments", () => {
  it("everyone on the trip sees them; a stranger sees none", async () => {
    expect((await owner.from("payments").select("id").eq("trip_id", tripId)).data).toHaveLength(3);
    expect((await viewer.from("payments").select("id").eq("trip_id", tripId)).data).toHaveLength(3);
    expect((await stranger.from("payments").select("id").eq("trip_id", tripId)).data).toEqual([]);
  });

  it("nobody edits one", async () => {
    const { data } = await viewer.from("payments").update({ amount_cents: 1 }).eq("trip_id", tripId).select("id");
    expect(data ?? []).toEqual([]);
    const { data: rows } = await owner.from("payments").select("amount_cents").eq("trip_id", tripId);
    expect(rows!.map((r) => r.amount_cents).sort((a, b) => a - b)).toEqual([1000, 2500, 5000]);
  });

  it("a Viewer removes only what they recorded; an Owner removes any", async () => {
    const ownersPayment = (await owner.from("payments").select("id").eq("trip_id", tripId).eq("amount_cents", 2500).single()).data!.id;
    const { data: notTheirs } = await viewer.from("payments").delete().eq("id", ownersPayment).select("id");
    expect(notTheirs ?? []).toEqual([]);
    const { data: theirs } = await viewer.from("payments").delete().eq("trip_id", tripId).eq("amount_cents", 1000).select("id");
    expect(theirs).toHaveLength(1);
    const { data: any } = await owner.from("payments").delete().eq("id", ownersPayment).select("id");
    expect(any).toHaveLength(1);
  });

  it("a person who paid or was paid can't be removed from the trip", async () => {
    const { error } = await owner.from("travelers").delete().eq("id", vic);
    expect(error).not.toBeNull();
  });
});

describe("Venmo usernames", () => {
  it("you set your own, and everyone on the trip reads it", async () => {
    expect((await viewer.rpc("set_my_venmo", { p_venmo: "@Vic-Ski_27" })).error).toBeNull();
    const { data } = await owner.from("travelers").select("venmo").eq("id", vic).single();
    expect(data!.venmo).toBe("Vic-Ski_27");
  });

  it("a Viewer can't set someone else's", async () => {
    const { data } = await viewer.from("travelers").update({ venmo: "not-mine" }).eq("id", mike).select("id");
    expect(data ?? []).toEqual([]);
  });

  it("an Owner sets one for someone who hasn't joined; a bad one is refused", async () => {
    expect((await owner.from("travelers").update({ venmo: "priya-p" }).eq("id", priya)).error).toBeNull();
    expect((await owner.from("travelers").update({ venmo: "no spaces!" }).eq("id", priya)).error).not.toBeNull();
  });

  it("a stranger can't read anyone's", async () => {
    expect((await stranger.from("travelers").select("venmo").eq("trip_id", tripId)).data).toEqual([]);
  });

  it("deleting the trip clears its payments", async () => {
    await pay(owner, priya, mike, 700);
    const { error } = await owner.from("trips").delete().eq("id", tripId);
    expect(error).toBeNull();
    expect((await owner.from("payments").select("id").eq("trip_id", tripId)).data).toEqual([]);
  });
});
