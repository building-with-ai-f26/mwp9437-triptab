import { describe, expect, it } from "vitest";
import { buildFeedbackEmail, FEEDBACK_TABLE_URL } from "../../../supabase/functions/_shared/feedback.ts";

describe("the feedback email to TripTab's builder (11/23)", () => {
  it("says what kind it is, who sent it and from which page", () => {
    const m = buildFeedbackEmail({ kind: "bug", message: "The Money tab is blank on my phone.", page: "/trips/:id", name: "Vic", email: "vic@mail.example.com" });
    expect(m.subject).toBe("Bug from Vic: The Money tab is blank on my phone.");
    expect(m.html).toContain("Something&#39;s broken");
    expect(m.html).toContain("From Vic (vic@mail.example.com) · on /trips/:id");
    expect(m.html).toContain(FEEDBACK_TABLE_URL);
    expect(m.text).toContain("The Money tab is blank on my phone.");
  });

  it("shortens a long first line in the subject and keeps paragraphs", () => {
    const long = "Could the itinerary show the weather for each day of the trip, so we know what to pack?\n\nAlso a packing list.";
    const m = buildFeedbackEmail({ kind: "idea", message: long, page: null, name: "", email: null });
    expect(m.subject.startsWith("Idea from Someone: Could the itinerary show the weather for each day")).toBe(true);
    expect(m.subject.endsWith("...")).toBe(true);
    expect(m.subject.length).toBeLessThan(100);
    expect(m.html.match(/<p style="margin:0 0 16px/g)?.length).toBe(2);
    expect(m.html).toContain("They have no email on their account.");
  });

  it("escapes what people write, so a note can't add markup", () => {
    const m = buildFeedbackEmail({ kind: "other", message: '<img src=x onerror="alert(1)"> hi', page: "/trips", name: "<b>Eve</b>", email: null });
    expect(m.html).not.toContain("<img src=x");
    expect(m.html).not.toContain("<b>Eve</b>");
    expect(m.html).toContain("&lt;img src=x");
  });
});
