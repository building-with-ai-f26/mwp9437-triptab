/**
 * The rules behind sign-up and confirming your email (Build 3, Mike's 11/18 call C6), run against
 * the same file the Edge Functions use (supabase/functions/_shared/account.ts): sign-up rate
 * limits, confirmation-email limits, which addresses are never emailed, links, the token, and the
 * email itself.
 */
import { describe, expect, it } from "vitest";
import {
  buildConfirmEmail,
  CONFIRM_LIMITS,
  confirmSendDecision,
  DEFAULT_APP_URL,
  ipHashOf,
  isReservedEmail,
  newToken,
  pickAppUrl,
  SIGNUP_LIMITS,
  signUpDecision,
  tokenHash,
  type EventRow,
} from "../../../supabase/functions/_shared/account.ts";

const rows = (n: number, r: Partial<EventRow>): EventRow[] => Array.from({ length: n }, () => ({ kind: "sign_up", user_id: null, ip_hash: "x", ...r }));

describe("sign-up rate limits", () => {
  it("lets a group join from one Wi-Fi, then stops a flood from one address", () => {
    expect(signUpDecision(rows(SIGNUP_LIMITS.prod.perIp - 1, { ip_hash: "cafe" }), "cafe", false)).toBeNull();
    expect(signUpDecision(rows(SIGNUP_LIMITS.prod.perIp, { ip_hash: "cafe" }), "cafe", false)?.code).toBe("capped_ip");
    expect(signUpDecision(rows(SIGNUP_LIMITS.prod.perIp, { ip_hash: "cafe" }), "home", false)).toBeNull();
  });

  it("caps sign-ups in all, and counts only sign-ups", () => {
    expect(signUpDecision(rows(SIGNUP_LIMITS.prod.total, {}), "new", false)?.code).toBe("capped_total");
    expect(signUpDecision(rows(SIGNUP_LIMITS.prod.total, { kind: "confirm_sent" }), "new", false)).toBeNull();
  });

  it("is far roomier on TripTab dev, where the test suites sign up all day", () => {
    expect(signUpDecision(rows(SIGNUP_LIMITS.prod.perIp * 10, { ip_hash: "ci" }), "ci", true)).toBeNull();
  });
});

describe("confirmation emails", () => {
  it("sends a person at most 3 a day, and TripTab 20 in all", () => {
    const sent = (n: number, user_id: string | null) => rows(n, { kind: "confirm_sent", user_id });
    expect(confirmSendDecision(sent(CONFIRM_LIMITS.perUser - 1, "me"), "me")).toBeNull();
    expect(confirmSendDecision(sent(CONFIRM_LIMITS.perUser, "me"), "me")?.code).toBe("capped_user");
    expect(confirmSendDecision(sent(CONFIRM_LIMITS.total, "others"), "me")?.code).toBe("capped_total");
  });

  it("never emails a reserved address, which is what the test suites use", () => {
    for (const e of ["rls-abc-owner@example.com", "a@mail.example.org", "x@site.test", "y@nope.invalid"]) expect(isReservedEmail(e)).toBe(true);
    for (const e of ["mike@gmail.com", "jo@examples.com", "pat@example.com.au"]) expect(isReservedEmail(e)).toBe(false);
  });

  it("links only to TripTab itself, and on production only to triptab.org", () => {
    expect(pickAppUrl("https://triptab.org")).toBe("https://triptab.org");
    expect(pickAppUrl("http://localhost:5173")).toBe(DEFAULT_APP_URL);
    expect(pickAppUrl("http://localhost:5173", true)).toBe("http://localhost:5173");
    expect(pickAppUrl("https://evil.example", true)).toBe(DEFAULT_APP_URL);
    expect(pickAppUrl(null, true)).toBe(DEFAULT_APP_URL);
  });

  it("makes long random tokens and stores only a hash", async () => {
    const a = newToken(), b = newToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
    expect(await tokenHash(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(await tokenHash(a)).not.toBe(a);
    expect(await tokenHash(a)).toBe(await tokenHash(a));
  });

  it("hashes the caller's address, so no IP is stored", async () => {
    const h = await ipHashOf("203.0.113.7, 10.0.0.1");
    expect(h).toHaveLength(32);
    expect(h).not.toContain("203");
    expect(h).toBe(await ipHashOf("203.0.113.7"));
  });

  it("the email links to the confirm page and escapes the name", () => {
    const m = buildConfirmEmail({ name: "<b>Vic</b>", url: "https://triptab.org/confirm-email?t=abc" });
    expect(m.subject).toBe("Confirm your email for TripTab");
    expect(m.text).toContain("https://triptab.org/confirm-email?t=abc");
    expect(m.html).toContain('href="https://triptab.org/confirm-email?t=abc"');
    expect(m.html).not.toContain("<b>Vic</b>");
    expect(m.html).toContain('src="https://triptab.org/email/header.jpg"');
    expect(m.html).toContain(">Confirm my email</a>");
    expect(m.html).toContain("works for 7 days");
  });
});
