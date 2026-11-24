import { describe, expect, it } from "vitest";
import { repeatOnDays, splitDays, stopDays } from "./repeat";
import type { ItemInput } from "./api";

// A made-up ski day, Morning to Day, with times and an estimate.
const ski: ItemInput = {
  kind: "activity",
  title: "Ski day",
  day: "2027-02-06",
  part: "morning",
  end_day: null,
  end_part: "day",
  start_time: "09:00",
  end_time: "16:00",
  location: "Chamonix",
  link: null,
  notes: "Meet at the lift",
  status: "planned",
  est_cents: 8400,
  cost_type: "per_person",
  pay_mode: "own",
};
const week = ["2027-02-06", "2027-02-07", "2027-02-08", "2027-02-09", "2027-02-10", "2027-02-11", "2027-02-12"];

describe("repeat on several days as separate plans (T6)", () => {
  it("seven days picked give seven plans with the same fields, one per day", () => {
    const out = repeatOnDays(ski, undefined, week, "each");
    expect(out.map((o) => o.input.day)).toEqual(week);
    for (const { input } of out) {
      expect(input).toEqual({ ...ski, day: input.day, end_day: null });
    }
  });

  it("three days not in a row give three plans on exactly those days, in order", () => {
    const out = repeatOnDays(ski, undefined, ["2027-02-11", "2027-02-06", "2027-02-08", "2027-02-06"], "each");
    expect(out.map((o) => o.input.day)).toEqual(["2027-02-06", "2027-02-08", "2027-02-11"]);
  });

  it("one total is shared out across the days, to the cent", () => {
    const out = repeatOnDays({ ...ski, est_cents: 10000 }, undefined, ["2027-02-06", "2027-02-07", "2027-02-08"], "total");
    expect(out.map((o) => o.input.est_cents)).toEqual([3334, 3333, 3333]);
    const paid = repeatOnDays(ski, { mode: "split", totalCents: 100, paidBy: "mike", foreign: { currency: "EUR", cents: 91 } }, ["2027-02-06", "2027-02-07", "2027-02-08"], "total");
    expect(paid.map((o) => (o.paid?.mode === "split" ? [o.paid.totalCents, o.paid.foreign?.cents] : null))).toEqual([[34, 31], [33, 30], [33, 30]]);
  });

  it("each day gets the cost as typed by default", () => {
    const out = repeatOnDays(ski, { mode: "own", cents: 8400, withPoints: false }, ["2027-02-06", "2027-02-07"], "each");
    expect(out.map((o) => (o.paid?.mode === "own" ? o.paid.cents : null))).toEqual([8400, 8400]);
  });

  it("paid with the amount to come: one to-do, on the first day", () => {
    const out = repeatOnDays(ski, { mode: "later" }, ["2027-02-06", "2027-02-07"], "each");
    expect(out.map((o) => o.paid?.mode ?? null)).toEqual(["later", null]);
  });

  it("splitting an existing seven-day activity gives its seven days; a flight or one day gives none", () => {
    expect(splitDays({ kind: "activity", day: "2027-02-06", end_day: "2027-02-12" })).toEqual(week);
    expect(splitDays({ kind: "flight", day: "2027-02-06", end_day: "2027-02-07" })).toEqual([]);
    expect(splitDays({ kind: "meal", day: "2027-02-06", end_day: null })).toEqual([]);
  });

  it("every day of a stop, inside the trip", () => {
    expect(stopDays({ start_date: "2027-02-04", end_date: "2027-02-07" }, { start_date: "2027-02-05", end_date: "2027-02-16" })).toEqual(["2027-02-05", "2027-02-06", "2027-02-07"]);
  });
});
