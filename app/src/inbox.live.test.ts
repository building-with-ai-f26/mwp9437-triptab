/**
 * Email-in and plan links (Mike's calls, 11/20), checked against TripTab dev: a trip's own address
 * is for its Owners only, a fresh one retires the old, an email that comes in is read only by the
 * trip's Owners, who can mark it saved or dismissed and nothing else; and a plan's link is a web
 * address or nothing. The inbox-email function is reached through its dev-only test path with emails
 * that have nothing to read, so no AI call is made. Run: npm run test:rls (needs app/.env.local).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { key, signedIn, url } from "./test/live";

let owner: SupabaseClient;
let member: SupabaseClient;
let stranger: SupabaseClient;
let tripId: string;
let otherTripId: string;
let code: string;

const token = async (c: SupabaseClient) => (await c.auth.getSession()).data.session!.access_token;
/** Posts a made-up email to the trip's address through the dev test path, as `who`. */
async function mail(who: SupabaseClient | null, to: string, raw: string) {
  const res = await fetch(`${url}/functions/v1/inbox-email`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json", ...(who ? { Authorization: `Bearer ${await token(who)}` } : {}) },
    body: JSON.stringify({ to, raw }),
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}
const empty = (subject: string) => `From: Mike <mike@example.com>\r\nSubject: ${subject}\r\nContent-Type: text/plain\r\n\r\n`;

beforeAll(async () => {
  [owner, member, stranger] = await Promise.all([signedIn("in-owner", "Mike"), signedIn("in-member", "Vic"), signedIn("in-stranger", "Stan")]);
  const { data } = await owner.rpc("create_trip", {
    p_name: "RLS test: email-in",
    p_stops: [{ name: "Chamonix", start_date: "2027-02-05", end_date: "2027-02-08" }],
    p_my_name: "Mike",
  });
  tripId = data as string;
  const other = await stranger.rpc("create_trip", {
    p_name: "RLS test: someone else's trip",
    p_stops: [{ name: "Lisbon", start_date: "2027-03-01", end_date: "2027-03-02" }],
    p_my_name: "Stan",
  });
  otherTripId = other.data as string;
  const { data: vic } = await owner.from("travelers").insert({ trip_id: tripId, name: "Vic", role: "viewer" }).select("id").single();
  const { data: link } = await owner.from("trip_links").select("token").eq("trip_id", tripId).single();
  await member.rpc("join_trip", { p_token: link!.token, p_traveler_id: vic!.id });
});

afterAll(async () => {
  await owner.from("trips").delete().eq("id", tripId);
  await stranger.from("trips").delete().eq("id", otherTripId);
});

describe("a trip's own address", () => {
  it("is made for an Owner the first time, and stays the same after", async () => {
    const first = await owner.rpc("inbox_address", { p_trip: tripId });
    expect(first.error).toBeNull();
    expect(first.data).toMatch(/^[0-9a-f]{16}$/);
    const again = await owner.rpc("inbox_address", { p_trip: tripId });
    expect(again.data).toBe(first.data);
    code = first.data as string;
  });

  it("isn't given to someone on the trip who isn't an Owner, or to a stranger", async () => {
    for (const c of [member, stranger]) {
      const { data, error } = await c.rpc("inbox_address", { p_trip: tripId });
      expect(data).toBeNull();
      expect(error?.code).toBe("42501");
    }
    const reset = await member.rpc("reset_inbox", { p_trip: tripId });
    expect(reset.error?.code).toBe("42501");
  });

  it("can't be read from the table, even by an Owner", async () => {
    const { data, error } = await owner.from("trip_inboxes").select("*");
    expect(data ?? []).toEqual([]);
    expect(error?.code).toBe("42501");
  });
});

describe("an email that comes in", () => {
  it("lands on the trip for its Owners, saying why it couldn't be read", async () => {
    const r = await mail(owner, `trip+${code}@triptab.org`, empty("Your rental car"));
    expect(r).toEqual({ status: 200, body: { code: "empty" } });
    const { data } = await owner.from("inbox_items").select("subject, status, note, plans").eq("trip_id", tripId);
    expect(data).toEqual([{ subject: "Your rental car", status: "failed", note: "That email had nothing to read.", plans: [] }]);
  });

  it("isn't seen by someone on the trip who isn't an Owner, or by a stranger", async () => {
    for (const c of [member, stranger]) {
      const { data } = await c.from("inbox_items").select("id").eq("trip_id", tripId);
      expect(data).toEqual([]);
    }
  });

  it("is turned away at an address that isn't a trip's, or from someone who isn't an Owner on the dev test path", async () => {
    expect((await mail(owner, "trip+0000000000000000@triptab.org", empty("Nope"))).status).toBe(404);
    expect((await mail(owner, "hello@triptab.org", empty("Nope"))).status).toBe(404);
    expect((await mail(member, `trip+${code}@triptab.org`, empty("Nope"))).body).toEqual({ code: "not_owner" });
    expect((await mail(stranger, `trip+${code}@triptab.org`, empty("Nope"))).body).toEqual({ code: "not_owner" });
    expect((await mail(null, `trip+${code}@triptab.org`, empty("Nope"))).status).toBe(401);
  });

  it("stops coming in at the old address once an Owner makes a new one", async () => {
    const { data: fresh } = await owner.rpc("reset_inbox", { p_trip: tripId });
    expect(fresh).toMatch(/^[0-9a-f]{16}$/);
    expect(fresh).not.toBe(code);
    expect((await mail(owner, `trip+${code}@triptab.org`, empty("Old address"))).status).toBe(404);
    expect((await mail(owner, `trip+${fresh}@triptab.org`, empty("New address"))).status).toBe(200);
    code = fresh as string;
  });

  it("can be marked saved or dismissed by an Owner, and nothing else", async () => {
    const { data: rows } = await owner.from("inbox_items").select("id").eq("trip_id", tripId);
    const id = rows![0].id as string;
    const byMember = await member.from("inbox_items").update({ status: "dismissed" }).eq("id", id).select("id");
    expect(byMember.data).toEqual([]);
    const backToNew = await owner.from("inbox_items").update({ status: "new" }).eq("id", id).select("id");
    expect(backToNew.error).not.toBeNull();
    const plans = await owner.from("inbox_items").update({ plans: [{ title: "Sneaky" }] }).eq("id", id).select("id");
    expect(plans.error?.code).toBe("42501");
    const dismissed = await owner.from("inbox_items").update({ status: "dismissed" }).eq("id", id).select("status");
    expect(dismissed.data).toEqual([{ status: "dismissed" }]);
  });

  it("can't be written by anyone but the function", async () => {
    const { error } = await owner.from("inbox_items").insert({ trip_id: tripId, subject: "Forged", status: "new" });
    expect(error?.code).toBe("42501");
  });

  it("says whether email-in is ready (always, on dev)", async () => {
    const res = await fetch(`${url}/functions/v1/inbox-email`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${await token(member)}`, "Content-Type": "application/json" },
      body: JSON.stringify({ probe: true }),
    });
    expect(await res.json()).toEqual({ ready: true });
  });
});

describe("a plan's link (C22)", () => {
  it("is a web address or nothing", async () => {
    const ok = await owner.from("items").insert({ trip_id: tripId, title: "Chamonix Airbnb", day: "2027-02-05", part: "night", kind: "stay", end_day: "2027-02-08", status: "planned", link: "https://www.airbnb.com/rooms/48213" }).select("id, link").single();
    expect(ok.error).toBeNull();
    expect(ok.data!.link).toBe("https://www.airbnb.com/rooms/48213");
    for (const bad of ["javascript:alert(1)", "airbnb.com/rooms/1", "https://a b.com", `https://a.co/${"x".repeat(500)}`]) {
      const { error } = await owner.from("items").update({ link: bad }).eq("id", ok.data!.id).select("id");
      expect(error?.code).toBe("23514");
    }
    const cleared = await owner.from("items").update({ link: null }).eq("id", ok.data!.id).select("link").single();
    expect(cleared.data!.link).toBeNull();
  });

  it("is set only by an Owner, and everyone on the trip sees it", async () => {
    const { data: stay } = await owner.from("items").update({ link: "https://www.airbnb.com/rooms/48213" }).eq("trip_id", tripId).eq("title", "Chamonix Airbnb").select("id").single();
    const byMember = await member.from("items").update({ link: "https://evil.example.com" }).eq("id", stay!.id).select("id");
    expect(byMember.data ?? []).toEqual([]);
    const seen = await member.from("items").select("link").eq("id", stay!.id).single();
    expect(seen.data!.link).toBe("https://www.airbnb.com/rooms/48213");
  });
});
