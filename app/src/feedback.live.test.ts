/**
 * Feedback (Mike's call 11/23), against the live database (TripTab dev): a signed-in person sends
 * their own, at most 10 a day; nobody reads or writes the table from the app, the sender included;
 * a signed-out visitor can't send. Run: npm run test:rls.
 */
import { beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { client, signedIn } from "./test/live";

let vic: SupabaseClient;
let stan: SupabaseClient;

const send = (c: SupabaseClient, kind: string, message: string, page: string | null = "/trips/:id") =>
  c.rpc("send_feedback", { p_kind: kind, p_message: message, p_page: page });

beforeAll(async () => {
  [vic, stan] = await Promise.all([signedIn("fb-vic", "Vic"), signedIn("fb-stan", "Stan")]);
});

describe("sending feedback", () => {
  it("takes a bug, an idea or something else from a signed-in person", async () => {
    expect((await send(vic, "bug", "  The Money tab showed the wrong total.  ")).error).toBeNull();
    expect((await send(vic, "idea", "A packing list, please.", null)).error).toBeNull();
    expect((await send(vic, "other", "Nice app.")).error).toBeNull();
  });

  it("refuses an empty message, one over 2,000 characters, and a kind it doesn't know", async () => {
    expect((await send(vic, "bug", "   ")).error?.code).toBe("22023");
    expect((await send(vic, "bug", "x".repeat(2001))).error?.code).toBe("22023");
    expect((await send(vic, "praise", "Hello")).error?.code).toBe("22023");
  });

  it("can't be sent by someone who isn't signed in", async () => {
    expect((await send(client(), "bug", "Hello from nobody")).error).not.toBeNull();
  });

  it("can't be read from the app, by its sender or anyone else, or written past the function", async () => {
    for (const c of [vic, stan, client()]) {
      const { data, error } = await c.from("feedback").select("id");
      expect(error !== null || (data ?? []).length === 0).toBe(true);
    }
    expect((await vic.from("feedback").insert({ kind: "bug", message: "straight in" })).error).not.toBeNull();
    expect((await vic.from("feedback").delete().neq("kind", "none")).error).not.toBeNull();
  });

  it("stops at 10 a person a day, and says so; another person isn't affected", async () => {
    // Vic has sent 3 above.
    for (let i = 4; i <= 10; i++) expect((await send(vic, "other", `Number ${i}`)).error, `message ${i}`).toBeNull();
    const eleventh = await send(vic, "other", "Number 11");
    expect(eleventh.error?.code).toBe("54000");
    expect(eleventh.error?.message).toMatch(/10 today/);
    expect((await send(stan, "idea", "Stan's first")).error).toBeNull();
  });
});
