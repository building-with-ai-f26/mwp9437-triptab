/**
 * C32 (Mike's call, 11/21): Where gets the street address, not a listing's headline (that goes in
 * Notes), and the booking's or listing's page goes in the plan's Link. The import function's checks
 * (supabase/functions/import-bookings/rules.ts), email-in's link list (inbox-email/rules.ts), and the
 * review's drafts (importPlans.ts). Made-up listings only.
 */
import { describe, expect, it } from "vitest";
import { BASE_PLANS_SCHEMA, checkProposals, cleanBookingLink, PROPOSE_TOOL } from "../../../supabase/functions/import-bookings/rules.ts";
import { DESCRIBE_TOOL } from "../../../supabase/functions/describe-trip/rules.ts";
import { emailLinks, importInput, MAX_EMAIL_LINKS } from "../../../supabase/functions/inbox-email/rules.ts";
import { mergePatch, notesFor, toDraft, type Proposal } from "./importPlans";
import type { Item } from "./model";

const LISTING = "https://www.airbnb.com/rooms/48213377";
const PASTED = `Chalet Le Lognan 5*, ski-in, sauna, mountain views\nAddress: 48 Chemin du Lavancher, 74400 Chamonix-Mont-Blanc\nView the listing: ${LISTING}\nCheck-in Feb 5, 2027`;

const raw = (over: Record<string, unknown>) => ({
  plans: [
    {
      kind: "stay", title: "Chalet Le Lognan", day: "2027-02-05", part: null, end_day: "2027-02-12", depart_time: null, arrive_time: null,
      times_from: null, source_url: null, location: "48 Chemin du Lavancher, 74400 Chamonix-Mont-Blanc", confirmation_code: null,
      cost_cents: null, currency: null, cost_is_per_person: false, who_pays: "split", paid: false, unsure: [], link: LISTING,
      details: "5*, ski-in, sauna, mountain views", ...over,
    },
  ],
  note: null,
});

describe("the booking's link, as the function checks it", () => {
  it("keeps a web address written in the pasted text, exactly", () => {
    expect(cleanBookingLink(LISTING, PASTED)).toBe(LISTING);
    expect(cleanBookingLink(`${LISTING}.`, PASTED)).toBe(LISTING);
  });
  it("drops a link that isn't in the pasted text: a made-up one never gets through", () => {
    expect(cleanBookingLink("https://www.airbnb.com/rooms/99999999", PASTED)).toBeNull();
  });
  it("drops anything that isn't an http(s) page", () => {
    for (const v of ["javascript:alert(1)", "mailto:host@example.com", "ftp://x.com/a", "airbnb.com/rooms/1", "https://localhost", "", null, 42]) {
      expect(cleanBookingLink(v, "")).toBeNull();
    }
    expect(cleanBookingLink(`https://x.com/${"a".repeat(600)}`, "")).toBeNull();
  });
  it("from a PDF or photo (no text to check), takes any web address", () => {
    expect(cleanBookingLink(LISTING, "")).toBe(LISTING);
  });
  it("passes the link and the headline through, each checked against the input", () => {
    const out = checkProposals(raw({}), [], PASTED)!;
    expect(out.plans[0].link).toBe(LISTING);
    expect(out.plans[0].details).toBe("5*, ski-in, sauna, mountain views");
    const made = checkProposals(raw({ link: "https://evil.example.com/x", details: "free upgrade to a penthouse" }), [], PASTED)!;
    expect(made.plans[0].link).toBeNull();
    expect(made.plans[0].details).toBeNull();
  });
});

describe("the tools the model is given", () => {
  it("import asks for a link and details; Describe your trip's tool is as it was", () => {
    const importPlans = (PROPOSE_TOOL.input_schema.properties.plans as typeof BASE_PLANS_SCHEMA).items;
    expect(importPlans.required).toEqual(expect.arrayContaining(["link", "details"]));
    const describePlans = (DESCRIBE_TOOL.input_schema.properties as unknown as { plans: typeof BASE_PLANS_SCHEMA }).plans;
    expect(describePlans).toBe(BASE_PLANS_SCHEMA);
    expect(describePlans.items.required).not.toContain("link");
    expect(Object.keys(describePlans.items.properties)).not.toContain("details");
  });
});

describe("links in a forwarded HTML email", () => {
  const html = `<p>Your stay is booked.</p>
    <a href="${LISTING}?check_in=2027-02-05&amp;guests=8">Chalet Le Lognan</a>
    <a href="https://www.airbnb.com/reservation/itinerary?code=HMQ7">View your trip</a>
    <a href="${LISTING}?check_in=2027-02-05&amp;guests=8">again</a>
    <a href="https://www.airbnb.com/account/unsubscribe?x=1">Unsubscribe</a>
    <a href="https://www.facebook.com/airbnb">Facebook</a>
    <a href="mailto:help@example.com">Email us</a>
    <a href="https://a0.muscache.com/pictures/1.jpg"><img src="x"></a>`;
  it("lists each page once with its text, and leaves out unsubscribe, social, mail and picture links", () => {
    expect(emailLinks(html)).toEqual([
      { label: "Chalet Le Lognan", href: `${LISTING}?check_in=2027-02-05&guests=8` },
      { label: "View your trip", href: "https://www.airbnb.com/reservation/itinerary?code=HMQ7" },
    ]);
  });
  it("hands at most a dozen", () => {
    const many = Array.from({ length: 30 }, (_, i) => `<a href="https://example.org/p/${i}">p${i}</a>`).join("");
    expect(emailLinks(many)).toHaveLength(MAX_EMAIL_LINKS);
  });
  it("puts the links import can't see in the text first, and none the text already shows", () => {
    const input = importInput({ subject: "Booked", html })!;
    expect(input.text).toMatch(/^Subject: Booked\n\nLinks in the email:\nChalet Le Lognan: https:\/\/www\.airbnb\.com\/rooms\/48213377/);
    const shown = importInput({ subject: "Booked", text: `See ${LISTING}?check_in=2027-02-05&guests=8`, html })!;
    expect(shown.text).not.toContain("Chalet Le Lognan: ");
    expect(importInput({ subject: "Plain", text: "No links here." })!.text).not.toContain("Links in the email");
  });
});

describe("the review's draft", () => {
  const trip = { id: "t", name: "Ski", start_date: "2027-02-05", end_date: "2027-02-16" } as never;
  const proposal = checkProposals(raw({}), [], PASTED)!.plans[0] as Proposal;
  it("puts the address in Where, the headline in Notes and the page in Link", () => {
    const d = toDraft(proposal, trip, []);
    expect(d.location).toBe("48 Chemin du Lavancher, 74400 Chamonix-Mont-Blanc");
    expect(d.link).toBe(LISTING);
    expect(notesFor(proposal).split("\n")[0]).toBe("5*, ski-in, sauna, mountain views");
  });
  it("a merge fills Link only when the plan has none", () => {
    const base = { id: "i", trip_id: "t", kind: "stay", title: "Airbnb", day: "2027-02-05", part: "night", end_day: "2027-02-12", location: null, notes: null, est_cents: null, status: "planned" } as unknown as Item;
    const incoming = { location: null, notes: null, end_day: null, est_cents: null, status: "planned" as const, link: LISTING };
    expect(mergePatch({ ...base, link: null }, incoming).link).toBe(LISTING);
    expect(mergePatch({ ...base, link: "https://vrbo.com/1" }, incoming).link).toBeUndefined();
  });
});
