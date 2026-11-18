/**
 * The rules of invite emails, run against the same file the Edge Function uses
 * (supabase/functions/send-invite/rules.ts): the rate limits, which site a link may point at, and
 * the email itself.
 */
import { describe, expect, it } from "vitest";
import { buildInvite, DEFAULT_APP_URL, inviteDecision, LIMITS, pickAppUrl, type SentRow } from "../../../supabase/functions/send-invite/rules.ts";
import { CONFIRM_LIMITS } from "../../../supabase/functions/_shared/account.ts";

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

  it("leaves room in Resend's free 100 a day for confirmation and reset emails", () => {
    expect(LIMITS.total + CONFIRM_LIMITS.total).toBeLessThanOrEqual(85);
  });
});

describe("where an invite link points", () => {
  it("on production, always triptab.org, even when asked from a local run", () => {
    for (const o of ["https://triptab.org", "http://localhost:5173", "https://pr-21-triptab.mikep.workers.dev", null]) {
      expect(pickAppUrl(o, false)).toBe("https://triptab.org");
    }
    expect(pickAppUrl("http://localhost:5173")).toBe("https://triptab.org");
  });

  it("on TripTab dev, back to a local run or a Preview", () => {
    expect(pickAppUrl("http://localhost:5173", true)).toBe("http://localhost:5173");
    expect(pickAppUrl("https://pr-21-triptab.mikep.workers.dev", true)).toBe("https://pr-21-triptab.mikep.workers.dev");
  });

  it("never points at anyone else's site", () => {
    for (const o of ["https://evil.example", "https://triptab.org.evil.example", "https://evil-triptab.org", "http://triptab.org", "https://x-triptab.evil.example.dev", null, undefined, ""]) {
      expect(pickAppUrl(o, true)).toBe(DEFAULT_APP_URL);
      expect(pickAppUrl(o, false)).toBe(DEFAULT_APP_URL);
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

  it("looks like TripTab: the landing photo, the label, the trip as the heading", () => {
    expect(email.html).toContain('src="https://triptab.org/email/header.jpg"');
    expect(email.html).toContain("You&#39;re invited");
    expect(email.html).toContain(">Euro ski trip</h1>");
    expect(email.html).toContain("Feb 5 to 16, 2027 · Chamonix, Andorra");
    expect(email.html).toContain("Playfair Display");
  });

  it("escapes names, so a name can't add HTML or a link of its own", () => {
    const sneaky = buildInvite({ inviter: "<b>Mike</b>", person: '"><a href="https://evil.example">x</a>', tripName: "Trip & co", dates: "", stops: [], url: "https://triptab.org/join/a" });
    expect(sneaky.html).not.toContain("evil.example\"");
    expect(sneaky.html).not.toContain("<b>Mike</b>");
    expect(sneaky.html).toContain("&lt;b&gt;Mike&lt;/b&gt;");
    expect(sneaky.html).toContain("Trip &amp; co");
  });
});
