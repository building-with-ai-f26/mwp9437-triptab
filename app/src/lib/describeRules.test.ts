import { describe, expect, it } from "vitest";
import { aboutTripDates, checkDescribe, MAX_QUESTIONS } from "../../../supabase/functions/describe-trip/rules.ts";

const TEXT =
  "Euro ski trip! Chamonix Feb 5 to 12, then Barcelona for a night, then Andorra till the 16th. Skiing every day in Chamonix, dinner reservation Thursday, flights and the Airbnb are booked.";

const plan = (over: Record<string, unknown>) => ({
  kind: "activity", title: "Skiing", day: "2027-02-06", part: "day", end_day: "2027-02-11", depart_time: null, arrive_time: null,
  times_from: null, source_url: null, location: null, confirmation_code: null, cost_cents: null, currency: null,
  cost_is_per_person: false, who_pays: "split", paid: false, unsure: [], ...over,
});

const answer = (over: Record<string, unknown> = {}) => ({
  trip: {
    name: "Euro ski trip",
    stops: [
      { name: "Barcelona", start_date: "2027-02-12", end_date: "2027-02-13" },
      { name: "Chamonix", start_date: "2027-02-05", end_date: "2027-02-12" },
      { name: "Andorra", start_date: "2027-02-13", end_date: "2027-02-16" },
    ],
  },
  plans: [plan({}), plan({ kind: "meal", title: "Dinner reservation", day: "2027-02-11", part: "evening", end_day: null })],
  questions: ["What are your flight numbers", "What's the Airbnb's address or link?"],
  note: null,
  ...over,
});

describe("describe your trip: checking the answer", () => {
  it("puts stops in date order and keeps the plans and questions", () => {
    const r = checkDescribe(answer(), TEXT)!;
    expect(r.trip.name).toBe("Euro ski trip");
    expect(r.trip.stops.map((s) => s.name)).toEqual(["Chamonix", "Barcelona", "Andorra"]);
    expect(r.plans.map((p) => p.title)).toEqual(["Skiing", "Dinner reservation"]);
    expect(r.questions).toEqual(["What are your flight numbers?", "What's the Airbnb's address or link?"]);
  });

  it("drops a stop that shares no word with the description, and keeps a longer name for a written one", () => {
    const r = checkDescribe(
      answer({ trip: { name: "Ski", stops: [{ name: "Chamonix-Mont-Blanc", start_date: "2027-02-05", end_date: "2027-02-12" }, { name: "Geneva", start_date: "2027-02-04", end_date: "2027-02-05" }] } }),
      TEXT,
    )!;
    expect(r.trip.stops.map((s) => s.name)).toEqual(["Chamonix-Mont-Blanc"]);
  });

  it("gives nothing back when no stop is usable, or the dates run over 60 days", () => {
    expect(checkDescribe(answer({ trip: { name: "x", stops: [{ name: "Paris", start_date: "2027-03-01", end_date: "2027-03-03" }] } }), TEXT)).toBeNull();
    expect(checkDescribe(answer({ trip: { name: "x", stops: [{ name: "Chamonix", start_date: "2027-02-05", end_date: "2027-06-12" }] } }), TEXT)).toBeNull();
    expect(checkDescribe(answer({ trip: { name: "x", stops: [{ name: "Chamonix", start_date: "2027-02-31", end_date: "2027-03-02" }] } }), TEXT)).toBeNull();
    expect(checkDescribe(null, TEXT)).toBeNull();
  });

  it("leaves out a plan dated outside the trip, and names the trip after its first stop when unnamed", () => {
    const r = checkDescribe(answer({ trip: { ...answer().trip, name: " " }, plans: [plan({ day: "2027-03-20", end_day: null })] }), TEXT)!;
    expect(r.plans).toEqual([]);
    expect(r.trip.name).toBe("Chamonix");
  });

  it("keeps at most five short questions, once each", () => {
    const many = ["Flight numbers?", "Flight numbers?", "ok", ...Array.from({ length: 8 }, (_, i) => `What time is booking number ${i}?`)];
    const r = checkDescribe(answer({ questions: many }), TEXT)!;
    expect(r.questions.length).toBe(MAX_QUESTIONS);
    expect(new Set(r.questions).size).toBe(r.questions.length);
    expect(r.questions.every((q) => q.endsWith("?") && q.length >= 8)).toBe(true);
  });

  it("runs plans through import's checks: a made-up address is blanked", () => {
    const r = checkDescribe(answer({ plans: [plan({ location: "12 Rue du Lac, Annecy" })] }), TEXT)!;
    expect(r.plans[0].location).toBeNull();
  });

  it("fills a blank part of the day from a meal word in the title, marked unsure", () => {
    const r = checkDescribe(
      answer({
        plans: [
          plan({ kind: "meal", title: "Sunday brunch", day: "2027-02-07", part: null, end_day: null }),
          plan({ kind: "meal", title: "Lunch on the mountain", day: "2027-02-08", part: null, end_day: null }),
          plan({ kind: "meal", title: "Dinner reservation", day: "2027-02-11", part: "night", end_day: null }),
          plan({ kind: "activity", title: "Skiing", day: "2027-02-06", part: null }),
        ],
      }),
      TEXT,
    )!;
    expect(r.plans.map((p) => p.part)).toEqual(["morning", "day", "night", null]);
    expect(r.plans[0].unsure).toContain("part");
    expect(r.plans[2].unsure).not.toContain("part");
  });

  it("moves a trip that came back in the past to next year, unless the text names the year", () => {
    const text = "Japan in May: Tokyo for 5 nights starting May 20, then Kyoto for 3 nights. We fly in on JL 5 on the 20th.";
    const past = {
      trip: { name: "Japan in May", stops: [{ name: "Tokyo", start_date: "2026-05-20", end_date: "2026-05-25" }, { name: "Kyoto", start_date: "2026-05-25", end_date: "2026-05-28" }] },
      plans: [plan({ kind: "flight", title: "JL 5 to Tokyo", day: "2026-05-20", end_day: null, part: null, who_pays: "own" })],
      questions: [],
      note: null,
    };
    const fixed = checkDescribe(structuredClone(past), text, "2026-11-18")!;
    expect(fixed.trip.stops.map((s) => [s.start_date, s.end_date])).toEqual([["2027-05-20", "2027-05-25"], ["2027-05-25", "2027-05-28"]]);
    expect(fixed.plans[0].day).toBe("2027-05-20");
    // A year in the text is the traveler's own: left alone.
    expect(checkDescribe(structuredClone(past), `${text} (2026)`, "2026-11-18")!.trip.stops[0].start_date).toBe("2026-05-20");
    // A trip that's still ahead is left alone.
    expect(checkDescribe(answer(), TEXT, "2026-11-18")!.trip.stops[0].start_date).toBe("2027-02-05");
  });
});

describe("a question about the trip's dates goes to the review screen, not the To do list (Mike's 11/19 review)", () => {
  it("tells a question about the trip's dates from one about a plan's time", () => {
    expect(aboutTripDates("Your dates don't line up with the calendar: did you mean Wednesday, November 25?")).toBe(true);
    expect(aboutTripDates("November 31 doesn't exist; which date is right?")).toBe(true);
    expect(aboutTripDates("November 25 isn't a Tuesday. Which day do you leave?")).toBe(true);
    expect(aboutTripDates("Which is correct for the trip: leaving Tuesday November 24 or November 25, and returning Sunday November 29?")).toBe(true);
    expect(aboutTripDates("Did you mean Wednesday, Nov 25?")).toBe(true);
    expect(aboutTripDates("Since November has only 30 days, is the return on Sunday November 29th?")).toBe(true);
    expect(aboutTripDates("Do you leave on November 24 or November 25?")).toBe(true);
    expect(aboutTripDates("What time is Thanksgiving dinner on Thursday, November 26?")).toBe(false);
    expect(aboutTripDates("What time does the christening start?")).toBe(false);
    expect(aboutTripDates("What date is the dinner reservation?")).toBe(false);
    expect(aboutTripDates("Where are you staying in Newton?")).toBe(false);
  });

  it("drops it from the questions and makes it the note when the model gave none", () => {
    const r = checkDescribe(answer({ questions: ["Your dates don't line up with the calendar, did you mean Feb 6?", "What's the Airbnb's address or link?"] }), TEXT)!;
    expect(r.questions).toEqual(["What's the Airbnb's address or link?"]);
    expect(r.note).toBe("Check the dates: Your dates don't line up with the calendar, did you mean Feb 6?");
  });

  it("keeps the model's own note when it gave one", () => {
    const r = checkDescribe(answer({ note: "Feb 5 2027 is a Friday, so I used Friday.", questions: ["Do your dates match the calendar?"] }), TEXT)!;
    expect(r.note).toBe("Feb 5 2027 is a Friday, so I used Friday.");
    expect(r.questions).toEqual([]);
  });
});
