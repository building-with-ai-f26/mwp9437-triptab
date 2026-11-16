/**
 * The rules of AI import, run against the same file the Edge Function uses
 * (supabase/functions/import-bookings/rules.ts): list-price cost, the caps that stop a runaway,
 * and the checks on what the model returns before the app sees it.
 */
import { describe, expect, it } from "vitest";
import {
  capDecision,
  checkProposals,
  costUsd,
  DEFAULT_DAILY_CAP_USD,
  nyDayStart,
  PROPOSE_TOOL,
  readCap,
  USER_DAILY_IMPORTS,
} from "../../../supabase/functions/import-bookings/rules.ts";

const usage = (over: Partial<Parameters<typeof costUsd>[0]>) => ({
  input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, searches: 0, ...over,
});

describe("what a call costs, at list price", () => {
  it("Claude Haiku 5.5: $0.10 in and $0.50 out per million tokens", () => {
    expect(costUsd(usage({ input_tokens: 50_000 }))).toBe(0.005); // 0.05 of a million at $0.10
    expect(costUsd(usage({ output_tokens: 1_000_000 }))).toBe(0.5);
    expect(costUsd(usage({ input_tokens: 2400, output_tokens: 900 }))).toBe(0.00069);
  });
  it("a web search is one cent", () => {
    expect(costUsd(usage({ searches: 3 }))).toBe(0.03);
    expect(costUsd(usage({ input_tokens: 12_000, output_tokens: 800, searches: 1 }))).toBe(0.0116);
  });
  it("a prompt over 100,000 tokens pays the higher rate", () => {
    expect(costUsd(usage({ input_tokens: 100_000 }))).toBe(0.01);
    expect(costUsd(usage({ input_tokens: 100_001 }))).toBeCloseTo(0.05, 4);
  });
});

describe("runaway protection", () => {
  it("reads the daily cap from the secret; 0 turns AI off; nonsense falls back to the default", () => {
    expect(readCap("7")).toBe(7);
    expect(readCap(" $2.50 ")).toBe(2.5);
    expect(readCap("0")).toBe(0);
    expect(readCap(undefined)).toBe(DEFAULT_DAILY_CAP_USD);
    expect(readCap("lots")).toBe(DEFAULT_DAILY_CAP_USD);
    expect(readCap("-1")).toBe(DEFAULT_DAILY_CAP_USD);
  });
  it("lets a call through under the cap", () => {
    expect(capDecision(7, 0, 0)).toBeNull();
    expect(capDecision(7, 6.9, 19)).toBeNull();
  });
  it("blocks once today's spend can't fit another call under the cap", () => {
    expect(capDecision(7, 6.96, 0)?.code).toBe("capped_daily");
    expect(capDecision(7, 7, 0)?.code).toBe("capped_daily");
    expect(capDecision(7, 12, 0)?.code).toBe("capped_daily");
  });
  it("a cap of 0 turns AI calls off", () => {
    expect(capDecision(0, 0, 0)?.code).toBe("off");
  });
  it("one person gets 20 imports a day", () => {
    expect(capDecision(7, 0, USER_DAILY_IMPORTS - 1)).toBeNull();
    expect(capDecision(7, 0, USER_DAILY_IMPORTS)?.code).toBe("capped_user");
  });
  it("a day starts at midnight in New York", () => {
    expect(nyDayStart(new Date("2026-11-16T21:30:00Z"))).toBe("2026-11-16T05:00:00.000Z"); // EST, UTC-5
    expect(nyDayStart(new Date("2026-07-04T03:59:59Z"))).toBe("2026-07-03T04:00:00.000Z"); // EDT, UTC-4
  });
});

const plan = (over: Record<string, unknown>) => ({
  kind: "flight", title: "UA 57 Newark to Geneva", day: "2027-02-04", part: "evening", end_day: "2027-02-05",
  depart_time: "17:05", arrive_time: "07:10", times_from: "input", source_url: null, location: null,
  confirmation_code: "QK7RWD", cost_cents: 61550, currency: "USD", cost_is_per_person: false, who_pays: "own", paid: true, unsure: [],
  ...over,
});

describe("checking what the model returned", () => {
  it("keeps a well-formed plan as it is", () => {
    const out = checkProposals({ plans: [plan({})], note: null }, []);
    expect(out?.plans).toHaveLength(1);
    expect(out?.plans[0]).toMatchObject({ kind: "flight", day: "2027-02-04", depart_time: "17:05", times_from: "input", cost_cents: 61550, who_pays: "own", paid: true });
  });
  it("keeps looked-up flight times only when the source is a page this call's search returned", () => {
    const looked = plan({ times_from: "lookup", source_url: "https://example.com/ua57" });
    const real = checkProposals({ plans: [looked], note: null }, ["https://example.com/ua57", "https://example.com/other"]);
    expect(real?.plans[0]).toMatchObject({ depart_time: "17:05", arrive_time: "07:10", times_from: "lookup", source_url: "https://example.com/ua57" });
    const fromMemory = checkProposals({ plans: [looked], note: null }, ["https://example.com/other"]);
    expect(fromMemory?.plans[0]).toMatchObject({ depart_time: null, arrive_time: null, times_from: null, source_url: null });
    const noSearch = checkProposals({ plans: [plan({ times_from: "lookup", source_url: null })], note: null }, []);
    expect(noSearch?.plans[0]).toMatchObject({ depart_time: null, arrive_time: null, times_from: null });
  });
  it("blanks anything that isn't a real date or a 24-hour time", () => {
    const out = checkProposals({ plans: [plan({ day: "2027-02-30", end_day: "Feb 5", depart_time: "5 PM", arrive_time: "25:00" })], note: null }, []);
    expect(out?.plans[0]).toMatchObject({ day: null, end_day: null, depart_time: null, arrive_time: null, times_from: null });
  });
  it("drops an end day before the start, and a plan with no kind or title", () => {
    const out = checkProposals({ plans: [plan({ end_day: "2027-02-01" }), plan({ kind: "cruise" }), plan({ title: "  " })], note: null }, []);
    expect(out?.plans).toHaveLength(1);
    expect(out?.plans[0].end_day).toBeNull();
  });
  it("never marks a plan paid without a cost, and flags a cost with no currency", () => {
    expect(checkProposals({ plans: [plan({ cost_cents: null, paid: true })], note: null }, [])?.plans[0]).toMatchObject({ paid: false, currency: null });
    expect(checkProposals({ plans: [plan({ currency: null })], note: null }, [])?.plans[0].unsure).toContain("cost");
    expect(checkProposals({ plans: [plan({ cost_cents: -5 })], note: null }, [])?.plans[0].cost_cents).toBeNull();
    expect(checkProposals({ plans: [plan({ cost_cents: 12.5 })], note: null }, [])?.plans[0].cost_cents).toBeNull();
  });
  it("keeps the currency as written, never converted", () => {
    expect(checkProposals({ plans: [plan({ cost_cents: 320000, currency: "eur" })], note: null }, [])?.plans[0]).toMatchObject({ cost_cents: 320000, currency: "EUR" });
  });
  it("refuses anything that isn't a list of plans, and caps the list at 20", () => {
    expect(checkProposals(null, [])).toBeNull();
    expect(checkProposals({ plans: "all of them" }, [])).toBeNull();
    expect(checkProposals({ plans: Array.from({ length: 50 }, () => plan({})), note: null }, [])?.plans).toHaveLength(20);
  });
  it("an empty list with a note is a valid answer (not a travel booking)", () => {
    expect(checkProposals({ plans: [], note: "This is a grocery receipt, not a trip booking." }, [])).toEqual({ plans: [], note: "This is a grocery receipt, not a trip booking." });
  });
  it("the tool's schema is strict: every field required, nothing extra allowed", () => {
    const item = PROPOSE_TOOL.input_schema.properties.plans.items;
    expect(PROPOSE_TOOL.strict).toBe(true);
    expect(item.additionalProperties).toBe(false);
    expect([...item.required].sort()).toEqual(Object.keys(item.properties).sort());
  });
});
