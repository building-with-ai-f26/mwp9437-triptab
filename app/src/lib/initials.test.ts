import { describe, expect, it } from "vitest";
import { goingBadge, initials } from "./initials";

describe("initials (Mike's 11/19 review)", () => {
  it("takes the first and last word's first letters", () => {
    expect(initials("Mike Pezza")).toBe("MP");
    expect(initials("julia b.")).toBe("JB");
    expect(initials("Vic")).toBe("V");
    expect(initials("  Ana Maria Lopez ")).toBe("AL");
    expect(initials("")).toBe("?");
  });
});

describe("who's going on a plan's card", () => {
  const p = (id: string, name: string) => ({ id, name });
  const group = [p("m", "Mike Pezza"), p("j", "Julia Bell"), p("v", "Vic"), p("a", "Ana Lopez"), p("o", "Olivia Park"), p("s", "Sam")];

  it("says Everyone when the whole group is in", () => {
    const b = goingBadge(group, 6, "m")!;
    expect(b.everyone).toBe(true);
    expect(b.label).toBe("Everyone's in");
  });

  it("shows a few faces, you first, and +N for the rest", () => {
    const b = goingBadge([group[1], group[0], group[2], group[3], group[4]], 6, "m")!;
    expect(b.everyone).toBe(false);
    expect(b.shown.map((s) => s.initials)).toEqual(["MP", "JB", "V"]);
    expect(b.more).toBe(2);
    expect(b.label).toBe("You, Julia Bell, Vic, Ana Lopez and Olivia Park are in");
  });

  it("shows up to four faces with no +N", () => {
    const b = goingBadge(group.slice(0, 4), 6, null)!;
    expect(b.shown).toHaveLength(4);
    expect(b.more).toBe(0);
  });

  it("says nothing on a trip of one, or when nobody's in", () => {
    expect(goingBadge([group[0]], 1, "m")).toBeNull();
    expect(goingBadge([], 6, "m")).toBeNull();
    expect(goingBadge([group[2]], 6, "m")!.label).toBe("Vic is in");
  });
});
