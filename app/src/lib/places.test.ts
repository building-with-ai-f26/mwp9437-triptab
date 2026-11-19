import { describe, expect, it } from "vitest";
import { PLACE_LIMIT, rankPlaces, toAddresses } from "./places";

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

describe("a plan's Where: addresses and places (Mike's 11/19 review)", () => {
  it("shows a named place with its street and town, and fills in the place and town", () => {
    const [ski] = toAddresses([{ properties: { name: "Loon Mountain Resort", city: "Lincoln", state: "New Hampshire", country: "United States" } }]);
    expect(ski).toEqual({ name: "Loon Mountain Resort", detail: "Lincoln, New Hampshire, United States", value: "Loon Mountain Resort, Lincoln" });
    const [hotel] = toAddresses([{ properties: { name: "La Villa du Lac", housenumber: "12", street: "Rue de la Tournette", city: "Veyrier-du-Lac", country: "France" } }]);
    expect(hotel.detail).toBe("12 Rue de la Tournette, Veyrier-du-Lac, France");
  });

  it("shows a street address as the address, with its town", () => {
    const [home] = toAddresses([{ properties: { housenumber: "12", street: "Rue du Lac", city: "Annecy", state: "Auvergne-Rhône-Alpes", country: "France" } }]);
    expect(home).toEqual({ name: "12 Rue du Lac", detail: "Annecy, Auvergne-Rhône-Alpes, France", value: "12 Rue du Lac, Annecy" });
  });

  it("drops repeats and rows with nothing to show, and keeps a short list", () => {
    const same = { properties: { name: "Loon Mountain", city: "Lincoln" } };
    expect(toAddresses([same, same, { properties: {} }])).toHaveLength(1);
    expect(toAddresses(Array.from({ length: 12 }, (_, i) => ({ properties: { name: `Cafe ${i}` } })))).toHaveLength(PLACE_LIMIT);
    expect(toAddresses(undefined)).toEqual([]);
  });
});
