/**
 * Who can read and change what, checked against the real database (row-level security).
 * Four people: an Owner who starts the trip, a Viewer the owner added by name who claims that
 * name through the group link, a Joiner who adds themselves through the link, and a Stranger
 * with an account but no link. Plus a visitor who isn't signed in at all.
 *
 * Run: npm run test:rls (needs app/.env.local).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL!;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
const run = Math.random().toString(36).slice(2, 8);
const password = `pw-${run}-${Math.random().toString(36).slice(2)}`;

const client = () =>
  createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function signedIn(who: string, name: string): Promise<SupabaseClient> {
  const email = `rls-${run}-${who}@example.com`;
  const res = await fetch(`${url}/functions/v1/sign-up`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password }),
  });
  expect(res.status, `sign-up for ${who}`).toBe(200);
  const c = client();
  const { error } = await c.auth.signInWithPassword({ email, password });
  expect(error).toBeNull();
  return c;
}

let owner: SupabaseClient;
let viewer: SupabaseClient;
let joiner: SupabaseClient;
let stranger: SupabaseClient;
const visitor = client();

let tripId: string;
let token: string;
let itemId: string;
let vicId: string;
const extraTrips: string[] = [];

beforeAll(async () => {
  [owner, viewer, joiner, stranger] = await Promise.all([
    signedIn("owner", "Mike"),
    signedIn("viewer", "Vic"),
    signedIn("joiner", "Jules"),
    signedIn("stranger", "Stan"),
  ]);

  const { data, error } = await owner.rpc("create_trip", {
    p_name: "RLS test: Euro ski trip",
    p_stops: [
      { name: "Chamonix", start_date: "2027-02-05", end_date: "2027-02-12" },
      { name: "Barcelona", start_date: "2027-02-12", end_date: "2027-02-13" },
      { name: "Andorra", start_date: "2027-02-13", end_date: "2027-02-16" },
    ],
    p_my_name: "Mike",
  });
  expect(error).toBeNull();
  tripId = data as string;
});

afterAll(async () => {
  for (const id of [tripId, ...extraTrips]) if (id) await owner.from("trips").delete().eq("id", id);
});

describe("an owner", () => {
  it("starts a trip with its stops, as its first owner, with a group link", async () => {
    const { data: trip } = await owner.from("trips").select("*").eq("id", tripId).single();
    expect(trip).toMatchObject({ start_date: "2027-02-05", end_date: "2027-02-16" });
    const { data: stops } = await owner.from("stops").select("name").eq("trip_id", tripId).order("position");
    expect(stops?.map((s) => s.name)).toEqual(["Chamonix", "Barcelona", "Andorra"]);
    const { data: people } = await owner.from("travelers").select("name, role, user_id").eq("trip_id", tripId);
    expect(people).toHaveLength(1);
    expect(people?.[0]).toMatchObject({ name: "Mike", role: "owner" });
    const { data: link } = await owner.from("trip_links").select("token, default_role").eq("trip_id", tripId).single();
    expect(link?.default_role).toBe("owner");
    expect(link?.token).toMatch(/^[0-9a-f]{36}$/);
    token = link!.token;
  });

  it("adds people directly, before they ever sign in", async () => {
    const { data, error } = await owner
      .from("travelers")
      .insert([
        { trip_id: tripId, name: "Vic", email: "vic@example.com", role: "viewer" },
        { trip_id: tripId, name: "Priya", phone: "+15555550123", role: "owner" },
      ])
      .select("id, name, user_id");
    expect(error).toBeNull();
    expect(data?.every((p) => p.user_id === null)).toBe(true);
    vicId = data!.find((p) => p.name === "Vic")!.id;
  });

  it("can't add a person and attach someone's account to them", async () => {
    const { data: me } = await owner.auth.getUser();
    const { error } = await owner
      .from("travelers")
      .insert({ trip_id: tripId, name: "Sneaky", role: "owner", user_id: me.user!.id });
    expect(error).not.toBeNull();
  });

  it("adds a plan, and the database keeps it inside the trip's dates", async () => {
    const { data, error } = await owner
      .from("items")
      .insert({ trip_id: tripId, title: "Ski school", day: "2027-02-06", part: "morning", est_cents: 9000 })
      .select("id, status")
      .single();
    expect(error).toBeNull();
    expect(data?.status).toBe("suggested");
    itemId = data!.id;

    const outside = await owner.from("items").insert({ trip_id: tripId, title: "Too late", day: "2027-03-01" });
    expect(outside.error?.message).toMatch(/inside the trip/);
  });
});

describe("someone who isn't on the trip", () => {
  it("sees nothing when signed in", async () => {
    for (const table of ["trips", "stops", "travelers", "items"] as const) {
      const col = table === "trips" ? "id" : "trip_id";
      const { data } = await stranger.from(table).select("*").eq(col, tripId);
      expect(data, table).toEqual([]);
    }
    const { data: link } = await stranger.from("trip_links").select("*").eq("trip_id", tripId);
    expect(link).toEqual([]);
  });

  it("can't add, change or delete anything", async () => {
    const add = await stranger.from("items").insert({ trip_id: tripId, title: "Party", day: "2027-02-07" });
    expect(add.error).not.toBeNull();
    const person = await stranger.from("travelers").insert({ trip_id: tripId, name: "Stan", role: "owner" });
    expect(person.error).not.toBeNull();
    const edit = await stranger.from("trips").update({ name: "Hijacked" }).eq("id", tripId).select();
    expect(edit.data ?? []).toEqual([]);
    const del = await stranger.from("items").delete().eq("id", itemId).select();
    expect(del.data ?? []).toEqual([]);
    const { data: still } = await owner.from("items").select("id").eq("id", itemId);
    expect(still).toHaveLength(1);
  });

  it("sees nothing and can't start a trip when not signed in", async () => {
    const { data } = await visitor.from("trips").select("*");
    expect(data ?? []).toEqual([]);
    const { error } = await visitor.rpc("create_trip", { p_name: "x", p_stops: [], p_my_name: "x" });
    expect(error).not.toBeNull();
  });
});

describe("the group link", () => {
  it("shows the trip and the names to pick from, even before signing in", async () => {
    const { data } = await visitor.rpc("join_preview", { p_token: token });
    expect(data.name).toBe("RLS test: Euro ski trip");
    expect(data.stops).toEqual(["Chamonix", "Barcelona", "Andorra"]);
    expect(data.people.map((p: { name: string }) => p.name)).toEqual(["Mike", "Vic", "Priya"]);
    expect(data.people.find((p: { name: string }) => p.name === "Mike").claimed).toBe(true);
    expect(data).not.toHaveProperty("token");
  });

  it("shows nothing for a made-up token", async () => {
    const { data } = await visitor.rpc("join_preview", { p_token: "not-a-real-token" });
    expect(data).toBeNull();
  });

  it("lets Vic claim the name the owner added, keeping the Viewer role the owner chose", async () => {
    const { data, error } = await viewer.rpc("join_trip", { p_token: token, p_traveler_id: vicId });
    expect(error).toBeNull();
    expect(data).toBe(tripId);
    const { data: me } = await viewer.from("travelers").select("name, role, user_id").eq("id", vicId).single();
    expect(me).toMatchObject({ name: "Vic", role: "viewer" });
    expect(me?.user_id).not.toBeNull();
  });

  it("won't let anyone else take a claimed name", async () => {
    const { error } = await stranger.rpc("join_trip", { p_token: token, p_traveler_id: vicId });
    expect(error?.message).toMatch(/already claimed/);
  });

  it("lets Jules add their own name and get the link's default role (Owner)", async () => {
    const { error } = await joiner.rpc("join_trip", { p_token: token, p_new_name: "Jules" });
    expect(error).toBeNull();
    const { data } = await joiner.from("travelers").select("role").eq("trip_id", tripId).eq("name", "Jules").single();
    expect(data?.role).toBe("owner");
    const add = await joiner.from("items").insert({ trip_id: tripId, title: "Fondue", day: "2027-02-06", part: "evening" });
    expect(add.error).toBeNull();
  });

  it("joining twice changes nothing", async () => {
    const { error } = await joiner.rpc("join_trip", { p_token: token, p_new_name: "Jules again" });
    expect(error).toBeNull();
    const { data } = await joiner.from("travelers").select("name").eq("trip_id", tripId);
    expect(data?.map((p) => p.name)).not.toContain("Jules again");
  });

  it("gives Viewer when the owner sets the link's default to Viewer", async () => {
    const set = await owner.from("trip_links").update({ default_role: "viewer" }).eq("trip_id", tripId).select();
    expect(set.data).toHaveLength(1);
    const { error } = await stranger.rpc("join_trip", { p_token: token, p_new_name: "Stan" });
    expect(error).toBeNull();
    const { data } = await stranger.from("travelers").select("role").eq("trip_id", tripId).eq("name", "Stan").single();
    expect(data?.role).toBe("viewer");
  });

  it("stops working when the owner makes a new link", async () => {
    const { data: fresh, error } = await owner.rpc("reset_group_link", { p_trip: tripId });
    expect(error).toBeNull();
    expect(fresh).not.toBe(token);
    const old = await visitor.rpc("join_preview", { p_token: token });
    expect(old.data).toBeNull();
    token = fresh as string;
  });

  it("stops working when the owner turns it off", async () => {
    await owner.from("trip_links").update({ enabled: false }).eq("trip_id", tripId);
    const { data } = await visitor.rpc("join_preview", { p_token: token });
    expect(data).toBeNull();
    const outsider = await signedIn("late", "Lou");
    const { error } = await outsider.rpc("join_trip", { p_token: token, p_new_name: "Lou" });
    expect(error?.message).toMatch(/isn't active/);
    await owner.from("trip_links").update({ enabled: true }).eq("trip_id", tripId);
  });
});

describe("a viewer", () => {
  it("sees the trip, its stops, its people and its plans", async () => {
    const { data: trip } = await viewer.from("trips").select("name").eq("id", tripId).single();
    expect(trip?.name).toBe("RLS test: Euro ski trip");
    const { data: items } = await viewer.from("items").select("title").eq("trip_id", tripId);
    expect(items?.map((i) => i.title).sort()).toEqual(["Fondue", "Ski school"]);
    const { data: people } = await viewer.from("travelers").select("name").eq("trip_id", tripId);
    expect(people?.length).toBeGreaterThanOrEqual(4);
  });

  it("can't see the group link, so can't hand out more access than they have", async () => {
    const { data } = await viewer.from("trip_links").select("*").eq("trip_id", tripId);
    expect(data).toEqual([]);
    const { error } = await viewer.rpc("reset_group_link", { p_trip: tripId });
    expect(error).not.toBeNull();
  });

  it("can't add, change or delete plans", async () => {
    const add = await viewer.from("items").insert({ trip_id: tripId, title: "Viewer plan", day: "2027-02-07" });
    expect(add.error).not.toBeNull();
    const edit = await viewer.from("items").update({ status: "planned" }).eq("id", itemId).select();
    expect(edit.data ?? []).toEqual([]);
    const del = await viewer.from("items").delete().eq("id", itemId).select();
    expect(del.data ?? []).toEqual([]);
  });

  it("can't add people or make themselves an owner", async () => {
    const add = await viewer.from("travelers").insert({ trip_id: tripId, name: "Friend", role: "owner" });
    expect(add.error).not.toBeNull();
    const promote = await viewer.from("travelers").update({ role: "owner" }).eq("id", vicId).select();
    expect(promote.data ?? []).toEqual([]);
    const { data } = await owner.from("travelers").select("role").eq("id", vicId).single();
    expect(data?.role).toBe("viewer");
  });

  it("can't rename or delete the trip", async () => {
    const edit = await viewer.from("trips").update({ name: "Mine now" }).eq("id", tripId).select();
    expect(edit.data ?? []).toEqual([]);
    const del = await viewer.from("trips").delete().eq("id", tripId).select();
    expect(del.data ?? []).toEqual([]);
  });

  it("becomes able to edit when an owner makes them an owner", async () => {
    const promote = await owner.from("travelers").update({ role: "owner" }).eq("id", vicId).select();
    expect(promote.data).toHaveLength(1);
    const edit = await viewer.from("items").update({ status: "planned" }).eq("id", itemId).select();
    expect(edit.data).toHaveLength(1);
    await owner.from("travelers").update({ role: "viewer" }).eq("id", vicId);
  });
});

describe("keeping an owner", () => {
  it("won't let the only owner demote or remove themselves", async () => {
    const { data: solo } = await owner.rpc("create_trip", {
      p_name: "RLS test: solo",
      p_stops: [{ name: "Lisbon", start_date: "2027-03-01", end_date: "2027-03-03" }],
      p_my_name: "Mike",
    });
    extraTrips.push(solo as string);
    const { data: me } = await owner.from("travelers").select("id").eq("trip_id", solo).single();
    const demote = await owner.from("travelers").update({ role: "viewer" }).eq("id", me!.id);
    expect(demote.error?.message).toMatch(/at least one owner/);
    const remove = await owner.from("travelers").delete().eq("id", me!.id);
    expect(remove.error?.message).toMatch(/at least one owner/);
  });

  it("lets an owner delete the whole trip", async () => {
    const id = extraTrips.pop()!;
    const del = await owner.from("trips").delete().eq("id", id).select();
    expect(del.data).toHaveLength(1);
  });
});
