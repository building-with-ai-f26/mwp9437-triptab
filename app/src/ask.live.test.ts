/**
 * Ask AI's conversation (T10, C60), against the live database (TripTab dev): each person's asks are
 * theirs alone. Another account can't read them, even an Owner of the same trip; nobody adds a turn
 * as someone else or edits one; strangers and signed-out visitors see nothing; your own clear works.
 * Run: npm run test:rls.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { client, signedIn } from "./test/live";

let mike: SupabaseClient;
let jo: SupabaseClient;
let stranger: SupabaseClient;
let tripId: string;
let joUser: string;
const thread = "8a4c7f2e-1b3d-4e5f-9a6b-7c8d9e0f1a2b";
const turn = (over: Record<string, unknown> = {}) => ({ trip_id: tripId, thread_id: thread, request: "A fondue dinner in Chamonix", options: [], ...over });
const turns = async (c: SupabaseClient) => (await c.from("ask_turns").select("request, user_id").eq("trip_id", tripId)).data ?? [];

beforeAll(async () => {
  [mike, jo, stranger] = await Promise.all([signedIn("ask-mike", "Mike"), signedIn("ask-jo", "Jo"), signedIn("ask-stranger", "Stan")]);
  tripId = (await mike.rpc("create_trip", { p_name: "RLS test: Ask AI", p_stops: [{ name: "Chamonix", start_date: "2027-02-05", end_date: "2027-02-08" }], p_my_name: "Mike" })).data as string;
  // Jo joins as an Owner too: even an Owner can't read Mike's asks.
  const jos = (await mike.from("travelers").insert({ trip_id: tripId, name: "Jo", role: "owner" }).select("id").single()).data!.id as string;
  const { data: link } = await mike.from("trip_links").select("token").eq("trip_id", tripId).single();
  await jo.rpc("join_trip", { p_token: link!.token, p_traveler_id: jos });
  joUser = (await jo.auth.getUser()).data.user!.id;
});

afterAll(async () => {
  await mike?.from("trips").delete().eq("id", tripId);
});

describe("an Ask AI conversation", () => {
  it("is added and read by its person", async () => {
    expect((await mike.from("ask_turns").insert(turn())).error).toBeNull();
    expect((await turns(mike)).map((t) => t.request)).toEqual(["A fondue dinner in Chamonix"]);
  });

  it("can't be read by another Owner of the same trip, a stranger or anyone signed out", async () => {
    expect(await turns(jo)).toEqual([]);
    expect(await turns(stranger)).toEqual([]);
    expect(((await client().from("ask_turns").select("id")).data ?? []).length).toBe(0);
  });

  it("can't be added as someone else, or on a trip you're not on, or edited", async () => {
    expect((await mike.from("ask_turns").insert(turn({ user_id: joUser }))).error?.code).toBe("42501");
    expect((await stranger.from("ask_turns").insert(turn())).error?.code).toBe("42501");
    await mike.from("ask_turns").update({ request: "changed" }).eq("trip_id", tripId);
    expect((await turns(mike)).map((t) => t.request)).toEqual(["A fondue dinner in Chamonix"]);
  });

  it("is cleared by its person only", async () => {
    await jo.from("ask_turns").delete().eq("trip_id", tripId);
    expect((await turns(mike)).length).toBe(1);
    await mike.from("ask_turns").delete().eq("trip_id", tripId);
    expect((await turns(mike)).length).toBe(0);
  });
});
