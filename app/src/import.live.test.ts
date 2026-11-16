/**
 * AI import (Build 4), checked against the deployed Edge Function: only an Owner on the trip can
 * call it, and oversized or empty input is refused before anything is sent to the model. None of
 * these calls reaches the Claude API, so they cost nothing. Run: npm run test:rls.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { key, signedIn, url } from "./test/live";

let owner: SupabaseClient;
let viewer: SupabaseClient;
let stranger: SupabaseClient;
let tripId: string;

const call = async (c: SupabaseClient | null, body: unknown) => {
  const token = c ? (await c.auth.getSession()).data.session?.access_token : key;
  const res = await fetch(`${url}/functions/v1/import-bookings`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
};

beforeAll(async () => {
  [owner, viewer, stranger] = await Promise.all([signedIn("i-owner", "Mike"), signedIn("i-viewer", "Vic"), signedIn("i-stranger", "Stan")]);
  const { data } = await owner.rpc("create_trip", {
    p_name: "RLS test: AI import",
    p_stops: [{ name: "Chamonix", start_date: "2027-02-05", end_date: "2027-02-08" }],
    p_my_name: "Mike",
  });
  tripId = data as string;
  const { data: vic } = await owner.from("travelers").insert({ trip_id: tripId, name: "Vic", role: "viewer" }).select("id").single();
  const { data: link } = await owner.from("trip_links").select("token").eq("trip_id", tripId).single();
  await viewer.rpc("join_trip", { p_token: link!.token, p_traveler_id: vic!.id });
});

afterAll(async () => {
  await owner.from("trips").delete().eq("id", tripId);
});

describe("who can call AI import", () => {
  const text = "We fly UA 57 on Feb 4.";

  it("someone who isn't signed in is refused", async () => {
    const r = await call(null, { trip_id: tripId, text });
    expect(r.status).toBe(401);
  });

  it("a stranger is refused", async () => {
    const r = await call(stranger, { trip_id: tripId, text });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("not_owner");
  });

  it("a Viewer on the trip is refused", async () => {
    const r = await call(viewer, { trip_id: tripId, text });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("not_owner");
  });

  it("refused calls leave no row in the cost log", async () => {
    const { data } = await owner.from("ai_calls").select("id").eq("trip_id", tripId);
    expect(data).toEqual([]);
  });
});

describe("limits, checked before anything is sent to the model", () => {
  it("empty input is refused", async () => {
    const r = await call(owner, { trip_id: tripId, text: "   " });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("empty");
  });

  it("pasted text over 20,000 characters is refused", async () => {
    const r = await call(owner, { trip_id: tripId, text: "a".repeat(20_001) });
    expect(r.status).toBe(413);
    expect(r.body.code).toBe("too_large");
  });

  it("a file that isn't a PDF or an image is refused", async () => {
    const r = await call(owner, { trip_id: tripId, file: { media_type: "application/zip", data: "AAAA" } });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("bad_file");
  });

  it("a file over 3 MB is refused", async () => {
    const r = await call(owner, { trip_id: tripId, file: { media_type: "application/pdf", data: "A".repeat(4_100_000) } });
    expect(r.status).toBe(413);
  });
});

describe("the cost log", () => {
  it("can't be written from the app, by anyone", async () => {
    for (const c of [owner, viewer]) {
      const { error } = await c.from("ai_calls").insert({ trip_id: tripId, model: "x", result: "ok", cost_usd: 0 });
      expect(error).not.toBeNull();
    }
  });

  it("is readable by an Owner of the trip only", async () => {
    expect((await owner.from("ai_calls").select("id").eq("trip_id", tripId)).error).toBeNull();
    expect((await viewer.from("ai_calls").select("id").eq("trip_id", tripId)).data).toEqual([]);
    expect((await stranger.from("ai_calls").select("id").eq("trip_id", tripId)).data).toEqual([]);
  });

  it("the setup check says whether the key is set, and nothing about it", async () => {
    const r = await call(owner, { probe: true });
    expect(r.status).toBe(200);
    expect(Object.keys(r.body).sort()).toEqual(["ai_key_set", "daily_cap_usd"]);
    expect(typeof r.body.ai_key_set).toBe("boolean");
    console.log("AI key set:", r.body.ai_key_set, "daily cap:", r.body.daily_cap_usd);
  });
});
