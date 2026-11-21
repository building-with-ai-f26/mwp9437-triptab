/**
 * Also forward from (C31, Mike's call 11/21), checked against TripTab dev: an account adds another
 * address to forward bookings from, confirmed by a code; only its owner reads or removes it, and
 * nobody writes it but the confirm-email function. A forwarded email from that address is refused
 * (naming the address) until the code is in, then taken. The email is sent through inbox-email's
 * dev-only test path with check_sender, which runs the real sender check, and has nothing to read,
 * so no AI call is made. Test addresses are @example.com, which dev hands the code back for.
 * Run: npm run test:rls (needs app/.env.local).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { key, run, signedIn, url } from "./test/live";

let owner: SupabaseClient;
let stranger: SupabaseClient;
let tripId: string;
let inbox: string;
let rowId: string;
let devCode: string;
const extra = `fwd-${run}-personal@example.com`;

const token = async (c: SupabaseClient) => (await c.auth.getSession()).data.session!.access_token;
async function call(fn: string, who: SupabaseClient, body: Record<string, unknown>) {
  const res = await fetch(`${url}/functions/v1/${fn}`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json", Authorization: `Bearer ${await token(who)}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}
const forwarded = (from: string) => `From: Mike <${from}>\r\nSubject: Fwd: (no subject)\r\nContent-Type: text/plain\r\n\r\n`;

beforeAll(async () => {
  [owner, stranger] = await Promise.all([signedIn("fwd-owner", "Mike"), signedIn("fwd-stranger", "Stan")]);
  const { data } = await owner.rpc("create_trip", {
    p_name: "RLS test: also forward from",
    p_stops: [{ name: "Chamonix", start_date: "2027-02-05", end_date: "2027-02-08" }],
    p_my_name: "Mike",
  });
  tripId = data as string;
  inbox = `trip+${(await owner.rpc("inbox_address", { p_trip: tripId })).data}@triptab.org`;
});

afterAll(async () => {
  await owner.from("trips").delete().eq("id", tripId);
});

describe("adding an address", () => {
  it("sends a code (handed back on dev for a test address) and shows the address as waiting", async () => {
    const r = await call("confirm-email", owner, { action: "forward_add", email: ` ${extra.toUpperCase()} ` });
    expect(r.status).toBe(200);
    expect(r.body.dev_code).toMatch(/^\d{6}$/);
    rowId = r.body.id as string;
    devCode = r.body.dev_code as string;
    const { data } = await owner.from("forward_addresses").select("id, email, confirmed_at");
    expect(data).toEqual([{ id: rowId, email: extra, confirmed_at: null }]);
  });

  it("isn't needed for the address you sign in with", async () => {
    const own = (await owner.auth.getUser()).data.user!.email!;
    const r = await call("confirm-email", owner, { action: "forward_add", email: own });
    expect(r.body.code).toBe("already_yours");
  });

  it("is refused when it isn't an address", async () => {
    expect((await call("confirm-email", owner, { action: "forward_add", email: "not an address" })).body.code).toBe("bad_email");
  });
});

describe("who can see and change it", () => {
  it("is invisible to anyone else, and they can't remove it", async () => {
    expect((await stranger.from("forward_addresses").select("id")).data).toEqual([]);
    const del = await stranger.from("forward_addresses").delete().eq("id", rowId).select("id");
    expect(del.data ?? []).toEqual([]);
    expect((await owner.from("forward_addresses").select("id")).data).toHaveLength(1);
  });

  it("can't be written straight to the table, even by its owner", async () => {
    const me = (await owner.auth.getUser()).data.user!.id;
    const ins = await owner.from("forward_addresses").insert({ user_id: me, email: `x-${run}@example.com`, confirmed_at: new Date().toISOString() });
    expect(ins.error?.code).toBe("42501");
    const upd = await owner.from("forward_addresses").update({ confirmed_at: new Date().toISOString() }).eq("id", rowId).select("id");
    expect(upd.error?.code).toBe("42501");
  });

  it("never shows the code's hash or tries, even to its owner", async () => {
    for (const col of ["code_hash", "tries", "code_sent_at"]) {
      const { error } = await owner.from("forward_addresses").select(col);
      expect(error?.code, col).toBe("42501");
    }
  });

  it("can't be confirmed by someone else, even with the right code", async () => {
    const r = await call("confirm-email", stranger, { action: "forward_confirm", id: rowId, code: devCode });
    expect(r.body.code).toBe("not_found");
  });
});

describe("a booking forwarded from it", () => {
  it("is refused while the address waits for its code, and the refusal names it", async () => {
    const r = await call("inbox-email", owner, { to: inbox, raw: forwarded(extra), check_sender: true });
    expect(r.status).toBe(403);
    expect(r.body).toEqual({ code: "not_on_trip", from: extra });
  });

  it("a wrong code doesn't confirm it; the right one does", async () => {
    const wrong = String((Number(devCode) + 1) % 1_000_000).padStart(6, "0");
    expect((await call("confirm-email", owner, { action: "forward_confirm", id: rowId, code: wrong })).body.code).toBe("wrong_code");
    const ok = await call("confirm-email", owner, { action: "forward_confirm", id: rowId, code: devCode });
    expect(ok.body).toEqual({ ok: true, confirmed: true });
    const { data } = await owner.from("forward_addresses").select("confirmed_at").eq("id", rowId).single();
    expect(data!.confirmed_at).not.toBeNull();
  });

  it("is taken once confirmed, as from its owner", async () => {
    const r = await call("inbox-email", owner, { to: inbox, raw: forwarded(extra), check_sender: true });
    expect(r.status).toBe(200);
    expect(r.body.code).toBe("empty");
    const { data } = await owner.from("inbox_items").select("from_traveler, status").eq("trip_id", tripId);
    const { data: me } = await owner.from("travelers").select("id").eq("trip_id", tripId).single();
    expect(data).toEqual([{ from_traveler: me!.id, status: "failed" }]);
  });

  it("is refused again once the address is removed", async () => {
    const del = await owner.from("forward_addresses").delete().eq("id", rowId).select("id");
    expect(del.data).toHaveLength(1);
    const r = await call("inbox-email", owner, { to: inbox, raw: forwarded(extra), check_sender: true });
    expect(r.body).toEqual({ code: "not_on_trip", from: extra });
  });
});
