/**
 * Confirming your email (Mike's 11/18 call, C6), against the deployed sign-up and confirm-email
 * functions on TripTab dev. The test accounts use example.com, which is never emailed, so no real
 * email goes out; the link itself is covered by the token tests in src/lib/accountRules.test.ts.
 * Run: npm run test:rls.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { key, signedIn, url } from "./test/live";

let me: SupabaseClient;
let tripId: string | null = null;

const call = async (body: unknown, token?: string) => {
  const res = await fetch(`${url}/functions/v1/confirm-email`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
};

beforeAll(async () => {
  me = await signedIn("c-new", "Cleo");
});

afterAll(async () => {
  if (tripId) await me.from("trips").delete().eq("id", tripId);
});

describe("a new email-and-password account", () => {
  it("can be used right away, and is waiting on its email", async () => {
    const { data } = await me.auth.getUser();
    expect(data.user!.app_metadata.email_check).toBe("pending");
    const { data: id, error } = await me.rpc("create_trip", {
      p_name: "RLS test: confirm email",
      p_stops: [{ name: "Lisbon", start_date: "2027-03-01", end_date: "2027-03-02" }],
      p_my_name: "Cleo",
    });
    expect(error).toBeNull();
    tripId = id as string;
  });

  it("can't mark itself confirmed from the browser", async () => {
    await me.auth.updateUser({ data: { email_check: "confirmed" } });
    const { data } = await me.auth.getUser();
    expect(data.user!.app_metadata.email_check).toBe("pending");
  });
});

describe("sending the link again", () => {
  it("needs you signed in", async () => {
    expect((await call({ action: "resend" })).status).toBe(401);
  });

  it("never emails a reserved address", async () => {
    const token = (await me.auth.getSession()).data.session!.access_token;
    const r = await call({ action: "resend" }, token);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, sent: false, code: "reserved" });
  });
});

describe("opening a link", () => {
  it("refuses one that isn't complete", async () => {
    const r = await call({ action: "confirm", token: "abc" });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("bad_link");
  });

  it("refuses one TripTab never sent, and confirms nothing", async () => {
    const r = await call({ action: "confirm", token: "a".repeat(64) });
    expect(r.status).toBe(410);
    expect(r.body.code).toBe("expired");
    const { data } = await me.auth.getUser();
    expect(data.user!.app_metadata.email_check).toBe("pending");
  });
});

describe("the records behind it", () => {
  it("can't be read or written from the app", async () => {
    for (const table of ["email_checks", "account_events"]) {
      const read = await me.from(table).select("*").limit(1);
      expect(read.error).not.toBeNull();
      const write = await me.from(table).insert({ kind: "sign_up" });
      expect(write.error).not.toBeNull();
    }
  });
});
