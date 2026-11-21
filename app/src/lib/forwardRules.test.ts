/**
 * Also forward from (C31, Mike's call 11/21), the rules in supabase/functions/_shared/account.ts that
 * the confirm-email Edge Function runs: which addresses are taken, how many codes go out, when a
 * typed code confirms an address, and the code's email. Made-up addresses only.
 */
import { describe, expect, it } from "vitest";
import {
  buildForwardCodeEmail,
  codeHash,
  CONFIRM_LIMITS,
  confirmSendDecision,
  FORWARD_LIMITS,
  forwardCodeDecision,
  forwardSendDecision,
  newCode,
  normalAddress,
  type EventRow,
} from "../../../supabase/functions/_shared/account.ts";

const ev = (kind: string, user: string, n: number): EventRow[] => Array.from({ length: n }, () => ({ kind, user_id: user, ip_hash: null }));

describe("an address to forward from", () => {
  it("is trimmed and lower case, or refused when it isn't an address", () => {
    expect(normalAddress("  Mike.Personal@Gmail.com ")).toBe("mike.personal@gmail.com");
    for (const bad of ["", "mike", "mike@gmail", "a b@x.com", "@x.com", null, `${"a".repeat(250)}@x.com`]) expect(normalAddress(bad)).toBeNull();
  });
});

describe("sending a code", () => {
  it("allows three more addresses on an account", () => {
    expect(forwardSendDecision([], "me", FORWARD_LIMITS.addresses - 1)).toBeNull();
    expect(forwardSendDecision([], "me", FORWARD_LIMITS.addresses)?.code).toBe("too_many");
  });
  it("sends a person three codes a day", () => {
    expect(forwardSendDecision(ev("forward_code_sent", "me", 2), "me", 0)).toBeNull();
    expect(forwardSendDecision(ev("forward_code_sent", "me", 3), "me", 0)?.code).toBe("capped_user");
    expect(forwardSendDecision(ev("forward_code_sent", "you", 3), "me", 0)).toBeNull();
  });
  it("shares the day's total with confirm-your-email links, both ways", () => {
    const half = [...ev("confirm_sent", "a", CONFIRM_LIMITS.total / 2), ...ev("forward_code_sent", "b", CONFIRM_LIMITS.total / 2)];
    expect(forwardSendDecision(half, "me", 0)?.code).toBe("capped_total");
    expect(confirmSendDecision(half, "me")?.code).toBe("capped_total");
    expect(confirmSendDecision(ev("forward_code_sent", "b", CONFIRM_LIMITS.total - 1), "me")).toBeNull();
  });
});

describe("a typed code", () => {
  const now = Date.parse("2026-11-21T18:00:00Z");
  const row = async (over = {}) => ({ code_hash: await codeHash("row-1", "482913"), code_sent_at: "2026-11-21T17:45:00Z", tries: 0, confirmed_at: null, ...over });
  it("confirms the address when it matches, within 30 minutes", async () => {
    expect(forwardCodeDecision(await row(), await codeHash("row-1", "482913"), now)).toBeNull();
  });
  it("is tied to its address: the same digits for another address don't match", async () => {
    expect(forwardCodeDecision(await row(), await codeHash("row-2", "482913"), now)?.code).toBe("wrong_code");
  });
  it("runs out after 30 minutes, and after five wrong tries", async () => {
    expect(forwardCodeDecision(await row({ code_sent_at: "2026-11-21T17:29:00Z" }), await codeHash("row-1", "482913"), now)?.code).toBe("expired");
    expect(forwardCodeDecision(await row({ tries: FORWARD_LIMITS.tries }), await codeHash("row-1", "482913"), now)?.code).toBe("too_many_tries");
    expect(forwardCodeDecision(await row({ code_hash: null }), await codeHash("row-1", "482913"), now)?.code).toBe("expired");
  });
  it("is six digits, random", () => {
    const codes = new Set(Array.from({ length: 50 }, newCode));
    for (const c of codes) expect(c).toMatch(/^\d{6}$/);
    expect(codes.size).toBeGreaterThan(45);
  });
});

describe("the code's email", () => {
  it("carries the code and the address, escaped, and says what to do if you didn't ask", () => {
    const m = buildForwardCodeEmail({ name: "Mike <b>", code: "482913", address: "mike.personal@example.com", url: "https://triptab.org/trips" });
    expect(m.subject).toBe("482913 is your TripTab code");
    expect(m.text).toContain("forward bookings from mike.personal@example.com");
    expect(m.text).toContain("Didn't ask for it? Ignore this email");
    expect(m.html).toContain("Your code: 482913");
    expect(m.html).toContain("Mike &lt;b&gt;");
    expect(m.html).not.toContain("Mike <b>");
  });
});
