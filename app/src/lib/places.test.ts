import { describe, expect, it } from "vitest";
import { PLACE_LIMIT, rankPlaces } from "./places";

describe("place suggestions", () => {
  it("puts the bigger place first", () => {
    const out = rankPlaces([
      { name: "Chamon", admin1: "Centre-Val de Loire", country: "France" },
      { name: "Chamonix", admin1: "Auvergne-Rhône-Alpes", country: "France", population: 10614 },
    ]);
    expect(out[0]).toEqual({ name: "Chamonix", detail: "Auvergne-Rhône-Alpes, France" });
  });

  it("drops repeats and keeps a short list", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ name: `Lisbon ${i}`, country: "US", population: 100 - i }));
    const out = rankPlaces([{ name: "Lisbon", country: "Portugal", population: 517802 }, { name: "Lisbon", country: "Portugal" }, ...many]);
    expect(out).toHaveLength(PLACE_LIMIT);
    expect(out.filter((p) => p.name === "Lisbon")).toHaveLength(1);
  });

  it("copes with no results and missing regions", () => {
    expect(rankPlaces(undefined)).toEqual([]);
    expect(rankPlaces([{ name: "Tulum" }])).toEqual([{ name: "Tulum", detail: "" }]);
  });
});
