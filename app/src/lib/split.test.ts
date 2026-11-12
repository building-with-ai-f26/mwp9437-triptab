import { describe, expect, it } from "vitest";
import { computeSplit, splitByWeight } from "./split";

const sum = (r: Record<string, number>) => Object.values(r).reduce((s, x) => s + x, 0);

describe("splitByWeight", () => {
  it("2 shares to 1 to 1 of $100 is $50, $25, $25", () => {
    expect(splitByWeight(10000, { a: 2, b: 1, c: 1 })).toEqual({ a: 5000, b: 2500, c: 2500 });
  });

  it("always adds back to the total, giving leftover cents to the biggest remainders", () => {
    const parts = splitByWeight(10000, { a: 1, b: 1, c: 1 });
    expect(sum(parts)).toBe(10000);
    expect(parts).toEqual({ a: 3334, b: 3333, c: 3333 });
    expect(sum(splitByWeight(99999, { a: 3, b: 5, c: 7, d: 11 }))).toBe(99999);
  });
});

describe("computeSplit", () => {
  const people = ["mike", "vic", "priya"];

  it("evenly: the default, same as Build 1's split", () => {
    expect(computeSplit({ mode: "even", total: 10000, people })).toEqual({
      shares: { mike: 3334, vic: 3333, priya: 3333 },
      error: null,
    });
  });

  it("by shares: a couple counts as two", () => {
    const r = computeSplit({ mode: "shares", total: 24000, people, values: { mike: 2, vic: 1, priya: 1 } });
    expect(r.shares).toEqual({ mike: 12000, vic: 6000, priya: 6000 });
  });

  it("by percent: has to add up to 100", () => {
    const ok = computeSplit({ mode: "percent", total: 9999, people, values: { mike: 50, vic: 30, priya: 20 } });
    expect(ok.error).toBeNull();
    expect(sum(ok.shares)).toBe(9999);
    const bad = computeSplit({ mode: "percent", total: 9999, people, values: { mike: 50, vic: 30, priya: 10 } });
    expect(bad.error).toBe("Percentages add up to 90%, not 100%.");
  });

  it("exact amounts: have to add up to the cost", () => {
    const ok = computeSplit({ mode: "exact", total: 6000, people, values: { mike: 1000, vic: 2000, priya: 3000 } });
    expect(ok.shares).toEqual({ mike: 1000, vic: 2000, priya: 3000 });
    const short = computeSplit({ mode: "exact", total: 6000, people, values: { mike: 1000, vic: 2000, priya: 2500 } });
    expect(short.error).toBe("Amounts add up to $55.00; $5.00 left to assign.");
  });

  it("a free plan confirms at $0", () => {
    expect(computeSplit({ mode: "even", total: 0, people })).toEqual({ shares: { mike: 0, vic: 0, priya: 0 }, error: null });
  });

  it("needs someone in it", () => {
    expect(computeSplit({ mode: "even", total: 500, people: [] }).error).toBe("Pick at least one person.");
    expect(computeSplit({ mode: "shares", total: 500, people, values: {} }).error).toBe("Give someone at least one share.");
  });
});
