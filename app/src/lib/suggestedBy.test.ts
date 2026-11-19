import { describe, expect, it } from "vitest";
import { suggestedBy } from "./model";

const people = [
  { user_id: "u-mike", name: "Mike" },
  { user_id: "u-jordan", name: "Jordan" },
];
const plan = (over: Partial<{ status: "suggested" | "planned" | "confirmed"; created_by: string | null; notes: string | null }>) => ({
  status: "suggested" as const,
  created_by: "u-jordan",
  notes: null,
  ...over,
});

describe("who suggested a plan", () => {
  it("names the person who added it, or you", () => {
    expect(suggestedBy(plan({}), people, "u-mike")).toBe("Suggested by Jordan");
    expect(suggestedBy(plan({ created_by: "u-mike" }), people, "u-mike")).toBe("Suggested by you");
  });

  it("marks an idea kept from Plan with AI", () => {
    const notes = "Savoyard classics with room for a group.\nFound on: https://example.com/fondue";
    expect(suggestedBy(plan({ notes }), people, "u-mike")).toBe("AI idea, kept by Jordan");
    expect(suggestedBy(plan({ notes, created_by: "u-gone" }), people, "u-mike")).toBe("AI idea");
  });

  it("says nothing once a plan is planned or confirmed, or when the person has left", () => {
    expect(suggestedBy(plan({ status: "planned" }), people, "u-mike")).toBeNull();
    expect(suggestedBy(plan({ status: "confirmed" }), people, "u-mike")).toBeNull();
    expect(suggestedBy(plan({ created_by: "u-gone" }), people, "u-mike")).toBeNull();
  });
});
