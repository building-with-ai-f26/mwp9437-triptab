/**
 * The rules of invite emails, run against the same file the Edge Function uses
 * (supabase/functions/send-invite/rules.ts): the rate limits, which site a link may point at, and
 * the email itself.
 */
import { describe, expect, it } from "vitest";
import { buildInvite, DEFAULT_APP_URL, inviteDecision, LIMITS, pickAppUrl, type SentRow } from "../../../supabase/functions/send-invite/rules.ts";

const T = "trip-1", P = "person-1", ME = "me";
const rows = (n: number, r: Partial<SentRow>): SentRow[] => Array.from({ length: n }, () => ({ trip_id: "t", traveler_id: "p", sent_by: "s", ...r }));

describe("invite rate limits", () => {
  it("lets the first invite through", () => {
    expect(inviteDecision([], T, P, ME)).toBeNull();
  });

  it("stops a fourth email to the same person in a day", () => {
    expect(inviteDecision(rows(LIMITS.perPerson - 1, { traveler_id: P }), T, P, ME)).toBeNull();
    expect(inviteDecision(rows(LIMITS.perPerson, { traveler_id: P }), T, P, ME)?.code).toBe("capped_person");
  });

  it("caps a trip, a sender, and TripTab as a whole", () => {
    expect(inviteDecision(rows(LIMITS.perTrip, { trip_id: T }), T, P, ME)?.code).toBe("capped_trip");
    expect(inviteDecision(rows(LIMITS.perSender, { sent_by: ME }), T, P, ME)?.code).toBe("capped_sender");
    expect(inviteDecision(rows(LIMITS.total, {}), T, P, ME)?.code).toBe("capped_total");
    expect(inviteDecision(rows(LIMITS.total - 1, {}), T, P, ME)).toBeNull();
  });

  it("leaves room in Resend's free 100 a day for sign-in emails", () => {
    expect(LIMITS.total).toBeLessThanOrEqual(80);
  });
});

describe("where an invite link points", () => {
  it("uses TripTab's own addresses as given", () => {
    expect(pickAppUrl("https://triptab.org")).toBe("https://triptab.org");
    expect(pickAppUrl("http://localhost:5173")).toBe("http://localhost:5173");
    expect(pickAppUrl("https://pr-21-triptab.mikep.workers.dev")).toBe("https://pr-21-triptab.mikep.workers.dev");
  });

  it("never points at anyone else's site", () => {
    for (const o of ["https://evil.example", "https://triptab.org.evil.example", "https://evil-triptab.org", "http://triptab.org", "https://x-triptab.evil.example.dev", null, undefined, ""]) {
      expect(pickAppUrl(o)).toBe(DEFAULT_APP_URL);
    }
  });
});

describe("the invite email", () => {
  const email = buildInvite({
    inviter: "Mike",
    person: "Vic",
    tripName: "Euro ski trip",
    dates: "Feb 5 to 16, 2027",
    stops: ["Chamonix", "Andorra"],
    url: "https://triptab.org/join/abc?as=123",
  });

  it("says who added you, to what, and links to your spot", () => {
    expect(email.subject).toBe("Mike added you to Euro ski trip on TripTab");
    expect(email.text).toContain("https://triptab.org/join/abc?as=123");
    expect(email.text).toContain("Feb 5 to 16, 2027 · Chamonix, Andorra");
    expect(email.html).toContain('href="https://triptab.org/join/abc?as=123"');
  });

  it("escapes names, so a name can't add HTML or a link of its own", () => {
    const sneaky = buildInvite({ inviter: "<b>Mike</b>", person: '"><a href="https://evil.example">x</a>', tripName: "Trip & co", dates: "", stops: [], url: "https://triptab.org/join/a" });
    expect(sneaky.html).not.toContain("evil.example\"");
    expect(sneaky.html).not.toContain("<b>Mike</b>");
    expect(sneaky.html).toContain("&lt;b&gt;Mike&lt;/b&gt;");
    expect(sneaky.html).toContain("Trip &amp; co");
  });
});
