/**
 * Forwards from any address, held for an Owner (C36, Mike's call 11/21), checked against TripTab dev:
 * an email from an address nobody on the trip has isn't bounced or read; it waits as held, its
 * address shown to Owners; what it holds can't be read through the API; only an Owner can have it
 * read; dismissed, it's gone; at most 5 a trip a day; with no From address it still bounces. The
 * emails go through inbox-email's dev test path with check_sender (the real sender check), and none
 * is read here, so no AI call is made (e2e/held-flow.cjs reads one). Run: npm run test:rls.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { key, run, signedIn, url } from "./test/live";

let owner: SupabaseClient;
let member: SupabaseClient;
let stranger: SupabaseClient;
let tripId: string;
let inbox: string;
let heldId: string;
const someone = (n: number) => `held-${run}-${n}@example.com`;

const token = async (c: SupabaseClient) => (await c.auth.getSession()).data.session!.access_token;
async function call(who: SupabaseClient, body: Record<string, unknown>) {
  const res = await fetch(`${url}/functions/v1/inbox-email`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json", Authorization: `Bearer ${await token(who)}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}
const booking = (from: string | null) =>
  `${from ? `From: A friend <${from}>\r\n` : ""}Subject: Fwd: Dinner booking\r\nContent-Type: text/plain\r\n\r\nTable for 6 at Le Bistrot, Sat Feb 6 2027 at 7:30 PM.`;
const send = (from: string | null) => call(owner, { to: inbox, raw: booking(from), check_sender: true });

beforeAll(async () => {
  [owner, member, stranger] = await Promise.all([signedIn("held-owner", "Mike"), signedIn("held-member", "Vic"), signedIn("held-stranger", "Stan")]);
  const { data } = await owner.rpc("create_trip", {
    p_name: "RLS test: held forwards",
    p_stops: [{ name: "Chamonix", start_date: "2027-02-05", end_date: "2027-02-08" }],
    p_my_name: "Mike",
  });
  tripId = data as string;
  const { data: vic } = await owner.from("travelers").insert({ trip_id: tripId, name: "Vic", role: "viewer" }).select("id").single();
  const { data: link } = await owner.from("trip_links").select("token").eq("trip_id", tripId).single();
  await member.rpc("join_trip", { p_token: link!.token, p_traveler_id: vic!.id });
  inbox = `trip+${(await owner.rpc("inbox_address", { p_trip: tripId })).data}@triptab.org`;
});

afterAll(async () => {
  await owner.from("trips").delete().eq("id", tripId);
});

describe("an email from an address nobody on the trip has", () => {
  it("isn't bounced or read: it waits as held, its address and subject shown to Owners", async () => {
    const r = await send(someone(1));
    expect(r).toEqual({ status: 200, body: { code: "held" } });
    const { data } = await owner.from("inbox_items").select("id, status, from_address, from_traveler, subject, plans, call_id").eq("trip_id", tripId);
    expect(data).toHaveLength(1);
    expect(data![0]).toMatchObject({ status: "held", from_address: someone(1), from_traveler: null, subject: "Fwd: Dinner booking", plans: [], call_id: null });
    heldId = data![0].id;
  });

  it("keeps what it holds out of reach of the API, even for an Owner", async () => {
    const { data, error } = await owner.from("inbox_held").select("*");
    expect(data ?? []).toEqual([]);
    expect(error?.code).toBe("42501");
  });

  it("is shown only to the trip's Owners", async () => {
    expect((await member.from("inbox_items").select("id").eq("trip_id", tripId)).data).toEqual([]);
    expect((await stranger.from("inbox_items").select("id").eq("trip_id", tripId)).data).toEqual([]);
  });
});

describe("reading it", () => {
  it("is for the trip's Owners: someone on the trip who isn't, and a stranger, are refused", async () => {
    for (const c of [member, stranger]) {
      const r = await call(c, { action: "read_held", item_id: heldId, mine: true });
      expect(r).toEqual({ status: 403, body: { code: "not_owner" } });
    }
    const { data } = await owner.from("inbox_items").select("status").eq("id", heldId).single();
    expect(data!.status).toBe("held");
  });

  it("once dismissed, it's gone: there's nothing left to read", async () => {
    const { error } = await owner.from("inbox_items").update({ status: "dismissed" }).eq("id", heldId);
    expect(error).toBeNull();
    const r = await call(owner, { action: "read_held", item_id: heldId, mine: false });
    expect(r).toEqual({ status: 409, body: { code: "not_held" } });
  });

  it("an Owner can't mark one held by hand", async () => {
    const { data } = await owner.from("inbox_items").update({ status: "held" }).eq("id", heldId).select("id");
    expect(data ?? []).toEqual([]);
  });
});

describe("limits", () => {
  it("holds at most 5 a trip a day; the 6th bounces, naming its sender", async () => {
    for (let n = 2; n <= 5; n++) expect((await send(someone(n))).body.code).toBe("held");
    const sixth = await send(someone(6));
    expect(sixth).toEqual({ status: 429, body: { code: "held_capped", from: someone(6) } });
  });

  it("an email with no From address has nothing to hold it under, so it bounces", async () => {
    const r = await send(null);
    expect(r).toEqual({ status: 403, body: { code: "not_on_trip", from: null } });
  });
});
