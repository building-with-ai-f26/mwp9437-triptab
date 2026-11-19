import { describe, expect, it } from "vitest";
import { scoreCase, type DescribeCase, type DescribedResult } from "./describeEval";
import type { Proposal } from "./importPlans";

const p = (over: Partial<Proposal>): Proposal =>
  ({ kind: "activity", title: "Skiing", day: "2026-11-27", part: "day", end_day: null, depart_time: null, arrive_time: null, times_from: null, source_url: null, location: null, confirmation_code: null, cost_cents: null, currency: null, cost_is_per_person: false, who_pays: "split", paid: false, unsure: [], ...over }) as Proposal;

const CASE: DescribeCase = {
  id: "t",
  group: "messy",
  what: "",
  text: "",
  today: "2026-11-18",
  expect: {
    trip: { stops: [{ names: ["Hartford"], start: ["2026-11-24", "2026-11-25"], end: ["2026-11-29", "2026-11-30"] }] },
    plans: [{ kind: ["activity"], day: ["2026-11-27"], location: ["Mount Snow"] }],
    questions: [],
    forbidden_words: [],
    forbidden_cents: [],
    not_asked: ["lift"],
    note_about: ["date"],
    titles_not: ["depart"],
  },
};
const good: DescribedResult = {
  trip: { name: "Thanksgiving", stops: [{ name: "Hartford", start_date: "2026-11-24", end_date: "2026-11-29" }] },
  plans: [p({ location: "Mount Snow" }), p({ kind: "transport", title: "Drive to Hartford", day: "2026-11-24" })],
  questions: ["What's the rental car's pickup time?"],
  note: "November 25 is a Wednesday, so I used Tuesday the 24th; check the dates.",
};

describe("the describe eval's 11/19 rules", () => {
  it("passes an answer that does all of them, with either reading of a muddled date", () => {
    expect(scoreCase(CASE, good).pass).toEqual({ trip: true, plans: true, grounded: true, questions: true });
    expect(scoreCase(CASE, { ...good, trip: { ...good.trip, stops: [{ name: "Hartford", start_date: "2026-11-25", end_date: "2026-11-30" }] } }).pass.trip).toBe(true);
  });

  it("fails each one when it's missed", () => {
    expect(scoreCase(CASE, { ...good, note: null }).pass.trip).toBe(false);
    expect(scoreCase(CASE, { ...good, plans: [p({ title: "Skiing at Mount Snow" })] }).pass.plans).toBe(false);
    expect(scoreCase(CASE, { ...good, plans: [p({ location: "Mount Snow" }), p({ kind: "transport", title: "Depart for Hartford" })] }).pass.plans).toBe(false);
    expect(scoreCase(CASE, { ...good, questions: ["Do you have lift tickets?"] }).pass.questions).toBe(false);
  });
});
