/**
 * How people pay you (Mike's notes, 11/18), against the live database (TripTab dev): an Owner adds
 * or fixes someone's Venmo until that person saves their own, then it's locked to them; only the
 * person adds their Zelle; what you save comes along to trips you join later. Run: npm run test:rls.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { client, signedIn } from "./test/live";

let owner: SupabaseClient;
let viewer: SupabaseClient;
let stranger: SupabaseClient;
let tripId: string;
let otherTrip: string;
let vic: string;
let priya: string;

const row = async (c: SupabaseClient, id: string) =>
  (await c.from("travelers").select("venmo, zelle, pay_locked").eq("id", id).maybeSingle()).data as {
    venmo: string | null;
    zelle: string | null;
    pay_locked: boolean;
  } | null;

beforeAll(async () => {
  [owner, viewer, stranger] = await Promise.all([signedIn("pi-owner", "Mike"), signedIn("pi-viewer", "Vic"), signedIn("pi-stranger", "Stan")]);
  const { data } = await owner.rpc("create_trip", {
    p_name: "RLS test: how people pay you",
    p_stops: [{ name: "Chamonix", start_date: "2027-02-05", end_date: "2027-02-08" }],
    p_my_name: "Mike",
  });
  tripId = data as string;
  const add = async (c: SupabaseClient, trip: string, name: string) =>
    (await c.from("travelers").insert({ trip_id: trip, name, role: "viewer" }).select("id").single()).data!.id as string;
  vic = await add(owner, tripId, "Vic");
  priya = await add(owner, tripId, "Priya");
  const { data: link } = await owner.from("trip_links").select("token").eq("trip_id", tripId).single();
  await viewer.rpc("join_trip", { p_token: link!.token, p_traveler_id: vic });
  const { data: theirs } = await stranger.rpc("create_trip", {
    p_name: "RLS test: Stan's trip",
    p_stops: [{ name: "Paris", start_date: "2027-03-01", end_date: "2027-03-02" }],
    p_my_name: "Stan",
  });
  otherTrip = theirs as string;
});

afterAll(async () => {
  await owner.from("trips").delete().eq("id", tripId);
  await stranger.from("trips").delete().eq("id", otherTrip);
});

describe("an Owner and someone else's Venmo", () => {
  it("adds a Venmo for someone who hasn't set their own, and can fix it", async () => {
    expect((await owner.from("travelers").update({ venmo: "priya-typo" }).eq("id", priya).select("id")).error).toBeNull();
    expect((await owner.from("travelers").update({ venmo: "priya-tt" }).eq("id", priya).select("id")).error).toBeNull();
    expect(await row(owner, priya)).toEqual({ venmo: "priya-tt", zelle: null, pay_locked: false });
  });

  it("can't add anyone's Zelle, or lock or unlock a spot", async () => {
    expect((await owner.from("travelers").update({ zelle: "5551234567" }).eq("id", priya)).error?.code).toBe("42501");
    expect((await owner.from("travelers").update({ pay_locked: true }).eq("id", priya)).error?.code).toBe("42501");
  });
});

describe("saving your own", () => {
  it("cleans and saves your Venmo and Zelle, and locks them to you", async () => {
    expect((await viewer.rpc("set_my_pay", { p_venmo: "@vic-tt", p_zelle: "+1 (555) 123-4567" })).error).toBeNull();
    expect(await row(viewer, vic)).toEqual({ venmo: "vic-tt", zelle: "5551234567", pay_locked: true });
  });

  it("then an Owner can't change your Venmo, and is told why", async () => {
    const { error } = await owner.from("travelers").update({ venmo: "not-vic" }).eq("id", vic);
    expect(error?.code).toBe("42501");
    expect(error?.message).toMatch(/Vic set their own Venmo, so only they can change it/);
    expect((await row(owner, vic))!.venmo).toBe("vic-tt");
  });

  it("an email works for Zelle, in lower case; something else doesn't", async () => {
    expect((await viewer.rpc("set_my_pay", { p_venmo: "vic-tt", p_zelle: " Vic@Mail.Example.COM " })).error).toBeNull();
    expect((await row(viewer, vic))!.zelle).toBe("vic@mail.example.com");
    expect((await viewer.rpc("set_my_pay", { p_venmo: "vic-tt", p_zelle: "555-1234" })).error?.code).toBe("23514");
    expect((await viewer.rpc("set_my_pay", { p_venmo: "no", p_zelle: "" })).error?.code).toBe("23514");
    expect((await row(viewer, vic))!.zelle).toBe("vic@mail.example.com");
  });

  it("everyone on the trip reads it; someone off the trip reads nothing", async () => {
    expect((await row(owner, vic))!.zelle).toBe("vic@mail.example.com");
    expect(await row(stranger, vic)).toBeNull();
  });

  it("can't be done signed out", async () => {
    expect((await client().rpc("set_my_pay", { p_venmo: "anon-tt", p_zelle: "" })).error).not.toBeNull();
  });
});

describe("on a trip you join later", () => {
  it("what you saved comes along, locked", async () => {
    const vicThere = (await stranger.from("travelers").insert({ trip_id: otherTrip, name: "Vic", role: "viewer", venmo: "owner-guess" }).select("id").single()).data!.id as string;
    const { data: link } = await stranger.from("trip_links").select("token").eq("trip_id", otherTrip).single();
    expect((await viewer.rpc("join_trip", { p_token: link!.token, p_traveler_id: vicThere })).error).toBeNull();
    expect(await row(stranger, vicThere)).toEqual({ venmo: "vic-tt", zelle: "vic@mail.example.com", pay_locked: true });
  });

  it("clearing both unlocks your spots, so an Owner can add a Venmo again", async () => {
    expect((await viewer.rpc("set_my_pay", { p_venmo: "", p_zelle: "" })).error).toBeNull();
    expect(await row(viewer, vic)).toEqual({ venmo: null, zelle: null, pay_locked: false });
    expect((await owner.from("travelers").update({ venmo: "vic-by-owner" }).eq("id", vic).select("id")).error).toBeNull();
  });
});
