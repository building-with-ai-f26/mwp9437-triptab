import { describe, expect, it } from "vitest";
import { mapsLink } from "./maps";

describe("Google Maps links for AI ideas (T12)", () => {
  it("keeps accents, apostrophes and commas, encoded", () => {
    const link = mapsLink("Le Café Chaleureux", "12 Rue de l'Église, Chamonix");
    expect(link).toBe("https://www.google.com/maps/search/?api=1&query=Le%20Caf%C3%A9%20Chaleureux%2C%2012%20Rue%20de%20l'%C3%89glise%2C%20Chamonix");
    expect(decodeURIComponent(new URL(link).searchParams.get("query") ?? "")).toBe("Le Café Chaleureux, 12 Rue de l'Église, Chamonix");
  });

  it("uses the name alone when there's no address", () => {
    expect(mapsLink("La Calèche", null)).toBe("https://www.google.com/maps/search/?api=1&query=La%20Cal%C3%A8che");
    expect(mapsLink("  La Calèche ", "  ")).toBe(mapsLink("La Calèche"));
  });
});
