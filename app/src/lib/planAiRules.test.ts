/** Plan with AI's rules (supabase/functions/plan-with-ai/rules.ts): which slots are empty, and the
 *  checks on the model's ideas before the app sees them. */
import { describe, expect, it } from "vitest";
import { capDecision, checkSuggestions, coveredSlots, emptySlots, WORST_CASE_CALL_USD, type PlanRow } from "../../../supabase/functions/plan-with-ai/rules.ts";
import { itemSlots } from "./timeline";
import type { Item } from "./model";

const trip = { start_date: "2027-02-05", end_date: "2027-02-07" };
const row = (over: Partial<PlanRow>): PlanRow => ({ kind: "activity", day: "2027-02-05", part: "morning", end_day: null, end_part: null, ...over });

describe("the slots a plan covers", () => {
  const cases: PlanRow[] = [
    row({}),
    row({ end_part: "evening" }),
    row({ end_day: "2027-02-07", end_part: "day" }),
    row({ kind: "flight", part: "evening", end_day: "2027-02-06", end_part: "morning" }),
    row({ kind: "flight", part: "night", end_day: "2027-02-06" }),
    row({ kind: "transport", part: "morning", end_part: "day" }),
    row({ kind: "stay", part: "night", end_day: "2027-02-07" }),
  ];
  it("match how the itinerary draws them", () => {
    for (const c of cases) {
      const timeline = itemSlots({ ...c, id: "x", trip_id: "t", title: "x", status: "planned" } as unknown as Item).map((s) => `${s.day} ${s.part}`);
      expect(coveredSlots(c)).toEqual(timeline);
    }
  });
});

describe("empty slots", () => {
  it("are the trip's slots no plan covers; stays take none", () => {
    const plans = [row({ end_part: "day" }), row({ kind: "stay", part: "night", end_day: "2027-02-07" }), row({ day: "2027-02-06", part: "evening" })];
    const empty = emptySlots(trip, plans);
    expect(empty).toHaveLength(12 - 3);
    expect(empty).not.toContain("2027-02-05 morning");
    expect(empty).not.toContain("2027-02-06 evening");
    expect(empty).toContain("2027-02-05 night");
  });
});

describe("checking the ideas", () => {
  const empty = ["2027-02-05 evening", "2027-02-06 day"];
  const urls = ["https://example.com/caleche", "https://example.com/museum"];
  const idea = (over: Record<string, unknown>) => ({ kind: "meal", title: "Fondue at La Caleche", day: "2027-02-05", part: "evening", location: "Chamonix", est_cents: null, why: "A classic first night.", source_url: urls[0], ...over });

  it("keeps an idea for an empty slot with a source from this call's search", () => {
    const r = checkSuggestions({ suggestions: [idea({})], note: null }, empty, urls)!;
    expect(r.suggestions).toHaveLength(1);
    expect(r.dropped).toBe(0);
  });
  it("drops ideas for a taken slot, outside the trip, or two in one slot", () => {
    const r = checkSuggestions({ suggestions: [idea({ part: "morning" }), idea({ day: "2027-03-01" }), idea({}), idea({ title: "Another dinner" })], note: null }, empty, urls)!;
    expect(r.suggestions.map((s) => s.title)).toEqual(["Fondue at La Caleche"]);
    expect(r.dropped).toBe(3);
  });
  it("drops a place whose source the search never returned (named from memory)", () => {
    const r = checkSuggestions({ suggestions: [idea({ source_url: "https://made-up.example/" }), idea({ source_url: "" })], note: null }, empty, urls)!;
    expect(r.suggestions).toHaveLength(0);
    expect(r.dropped).toBe(2);
  });
  it("never passes on a flight, a stay or a bad price", () => {
    const r = checkSuggestions({ suggestions: [idea({ kind: "flight" }), idea({ day: "2027-02-06", part: "day", kind: "activity", est_cents: -5, source_url: urls[1] })], note: null }, empty, urls)!;
    expect(r.suggestions).toHaveLength(1);
    expect(r.suggestions[0].est_cents).toBeNull();
  });
  it("refuses a reply that isn't a list", () => {
    expect(checkSuggestions({ ideas: [] }, empty, urls)).toBeNull();
  });
});

describe("caps", () => {
  it("stop before a call could cross the daily cap", () => {
    expect(capDecision(7, 7 - WORST_CASE_CALL_USD + 0.001, 0)?.code).toBe("capped_daily");
    expect(capDecision(7, 1, 20)?.code).toBe("capped_user");
    expect(capDecision(0, 0, 0)?.code).toBe("off");
    expect(capDecision(7, 1, 3)).toBeNull();
  });
});
