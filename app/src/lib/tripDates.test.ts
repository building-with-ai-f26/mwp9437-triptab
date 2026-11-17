/** Extending a trip in one tap, and the plans that block a date change (Mike's call, 11/16). */
import { describe, expect, it } from "vitest";
import { canExtendTo, plansOutside, widenTrip } from "./model";
import { toDraft, type Proposal } from "./importPlans";

const trip = { start_date: "2027-02-05", end_date: "2027-02-16" };

describe("extending a trip", () => {
  it("offers days up to a week either side, not inside the trip and not further out", () => {
    expect(canExtendTo(trip, "2027-02-04")).toBe(true);
    expect(canExtendTo(trip, "2027-01-29")).toBe(true);
    expect(canExtendTo(trip, "2027-01-28")).toBe(false);
    expect(canExtendTo(trip, "2027-02-23")).toBe(true);
    expect(canExtendTo(trip, "2027-02-24")).toBe(false);
    expect(canExtendTo(trip, "2027-02-10")).toBe(false);
    expect(canExtendTo(trip, null)).toBe(false);
  });

  it("never offers to go past 60 days", () => {
    const long = { start_date: "2027-03-01", end_date: "2027-04-28" };
    expect(canExtendTo(long, "2027-04-30")).toBe(true);
    expect(canExtendTo(long, "2027-05-01")).toBe(false);
  });

  it("widens only the end the day falls past", () => {
    expect(widenTrip(trip, "2027-02-03")).toEqual({ start_date: "2027-02-03", end_date: "2027-02-16" });
    expect(widenTrip(trip, "2027-02-18")).toEqual({ start_date: "2027-02-05", end_date: "2027-02-18" });
    expect(widenTrip(trip, "2027-02-10")).toEqual(trip);
    expect(widenTrip(trip, null)).toEqual(trip);
  });
});

describe("plans that block new dates", () => {
  const plan = (kind: "activity" | "meal" | "stay" | "flight" | "transport", day: string, end_day: string | null = null) => ({ kind, day, end_day, title: `${kind} ${day}` });
  it("follows the database: days inside, arrivals and check-outs up to a day after", () => {
    const items = [
      plan("activity", "2027-02-06"),
      plan("activity", "2027-02-04"),
      plan("activity", "2027-02-10", "2027-02-13"),
      plan("stay", "2027-02-10", "2027-02-13"),
      plan("stay", "2027-02-10", "2027-02-14"),
      plan("flight", "2027-02-12", "2027-02-13"),
      plan("transport", "2027-02-12", "2027-02-14"),
    ];
    expect(plansOutside(items, "2027-02-05", "2027-02-12").map((i) => i.title)).toEqual([
      "activity 2027-02-04",
      "activity 2027-02-10",
      "stay 2027-02-10",
      "transport 2027-02-12",
    ]);
  });
});

describe("the import review offers to extend", () => {
  const p = (over: Partial<Proposal>): Proposal => ({
    kind: "flight", title: "UA 57", day: null, part: "evening", end_day: null, depart_time: "17:05", arrive_time: null, times_from: "input",
    source_url: null, location: null, confirmation_code: null, cost_cents: null, currency: null, cost_is_per_person: false,
    who_pays: "own", paid: false, unsure: [], ...over,
  });
  it("a day just before the trip: unticked, with the day ready to add", () => {
    const d = toDraft(p({ day: "2027-02-04" }), trip, []);
    expect(d.keep).toBe(false);
    expect(d.day).toBe("");
    expect(d.extendTo).toBe("2027-02-04");
    expect(d.warnings[0]).toContain("is before the trip");
  });
  it("once the trip includes it, the same proposal fits as it is", () => {
    const d = toDraft(p({ day: "2027-02-04" }), widenTrip(trip, "2027-02-04"), []);
    expect(d.day).toBe("2027-02-04");
    expect(d.extendTo).toBeNull();
    expect(d.warnings.join(" ")).not.toContain("trip");
  });
  it("a day far from the trip (likely a wrong date) is not offered", () => {
    const d = toDraft(p({ day: "2026-02-04" }), trip, []);
    expect(d.extendTo).toBeNull();
    expect(d.warnings[0]).toContain("outside the trip's dates");
  });
});
