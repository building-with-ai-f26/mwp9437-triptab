/**
 * Invite emails (Build 3), checked against the deployed send-invite Edge Function: who can send one,
 * and every refusal that comes before an email would go out. No test here sends a real email: the
 * project has a real Resend key, and each send counts against the domain's daily allowance. The
 * rate limits are unit tested in src/lib/inviteRules.test.ts. Run: npm run test:rls.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { key, signedIn, url } from "./test/live";

let owner: SupabaseClient;
let viewer: SupabaseClient;
let stranger: SupabaseClient;
let tripId: string;
let noEmail: string;
let joined: string;
let withEmail: string;

const call = async (c: SupabaseClient | null, body: unknown) => {
  const token = c ? (await c.auth.getSession()).data.session?.access_token : key;
  const res = await fetch(`${url}/functions/v1/send-invite`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${token}`, "Content-Type": "application/json", Origin: "https://evil.example" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
};

beforeAll(async () => {
  [owner, viewer, stranger] = await Promise.all([signedIn("e-owner", "Mike"), signedIn("e-viewer", "Vic"), signedIn("e-stranger", "Stan")]);
  const { data } = await owner.rpc("create_trip", {
    p_name: "RLS test: invite emails",
    p_stops: [{ name: "Chamonix", start_date: "2027-02-05", end_date: "2027-02-08" }],
    p_my_name: "Mike",
  });
  tripId = data as string;
  const add = async (name: string, email: string | null, role = "viewer") =>
    (await owner.from("travelers").insert({ trip_id: tripId, name, email, role }).select("id").single()).data!.id as string;
  joined = await add("Vic", "vic@example.com");
  noEmail = await add("Priya", null);
  withEmail = await add("Jo", "jo@example.com");
  const { data: link } = await owner.from("trip_links").select("token").eq("trip_id", tripId).single();
  await viewer.rpc("join_trip", { p_token: link!.token, p_traveler_id: joined });
});

afterAll(async () => {
  await owner.from("trips").delete().eq("id", tripId);
});

describe("who can send an invite email", () => {
  it("someone who isn't signed in is refused", async () => {
    expect((await call(null, { trip_id: tripId, traveler_id: withEmail })).status).toBe(401);
  });

  it("a stranger is refused", async () => {
    const r = await call(stranger, { trip_id: tripId, traveler_id: withEmail });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("not_owner");
  });

  it("a Viewer on the trip is refused", async () => {
    const r = await call(viewer, { trip_id: tripId, traveler_id: withEmail });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("not_owner");
  });
});

describe("checks before anything is sent", () => {
  it("someone who has already joined gets no invite", async () => {
    const r = await call(owner, { trip_id: tripId, traveler_id: joined });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("already_joined");
  });

  it("someone with no email can't be emailed", async () => {
    const r = await call(owner, { trip_id: tripId, traveler_id: noEmail });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("no_email");
  });

  it("a person from another trip isn't found", async () => {
    const { data: other } = await stranger.rpc("create_trip", {
      p_name: "RLS test: someone else's trip",
      p_stops: [{ name: "Paris", start_date: "2027-03-01", end_date: "2027-03-02" }],
      p_my_name: "Stan",
    });
    const { data: theirs } = await stranger.from("travelers").insert({ trip_id: other, name: "Pat", email: "pat@example.com", role: "viewer" }).select("id").single();
    const r = await call(owner, { trip_id: tripId, traveler_id: theirs!.id });
    expect(r.status).toBe(404);
    expect(r.body.code).toBe("not_on_trip");
    await stranger.from("trips").delete().eq("id", other as string);
  });

  it("with the group link off, nothing is sent", async () => {
    await owner.from("trip_links").update({ enabled: false }).eq("trip_id", tripId);
    const r = await call(owner, { trip_id: tripId, traveler_id: withEmail });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("link_off");
    await owner.from("trip_links").update({ enabled: true }).eq("trip_id", tripId);
  });

  it("bad input is refused", async () => {
    expect((await call(owner, { trip_id: "nope", traveler_id: withEmail })).status).toBe(400);
  });
});

describe("the invite log", () => {
  it("can't be written from the app, by anyone", async () => {
    for (const c of [owner, viewer, stranger]) {
      const { error } = await c.from("invite_emails").insert({ trip_id: tripId, traveler_id: withEmail, sent_by: "00000000-0000-0000-0000-000000000000", result: "sent" });
      expect(error).not.toBeNull();
    }
  });

  it("is readable by an Owner of the trip only, and refused calls leave no row", async () => {
    expect((await owner.from("invite_emails").select("id").eq("trip_id", tripId)).data).toEqual([]);
    expect((await viewer.from("invite_emails").select("id").eq("trip_id", tripId)).data).toEqual([]);
    expect((await stranger.from("invite_emails").select("id").eq("trip_id", tripId)).data).toEqual([]);
  });
});
