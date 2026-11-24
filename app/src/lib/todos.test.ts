import { describe, expect, it } from "vitest";
import { filterTodos, sortTodos } from "./todos";

// Five made-up to-dos across three people (Mike is "me") and nobody.
const names: Record<string, string> = { mike: "Mike", julia: "Julia", sam: "Sam" };
const nameOf = (id: string | null) => (id ? names[id] : null);
const todo = (title: string, assignee: string | null, due_day: string | null, created_at: string) => ({ title, assignee, due_day, created_at });
const list = [
  todo("Book fondue", "julia", "2027-01-20", "2026-11-20T10:00:00Z"),
  todo("Buy lift passes", "mike", "2027-01-10", "2026-11-21T10:00:00Z"),
  todo("Rent skis", "sam", null, "2026-11-22T10:00:00Z"),
  todo("Pick a restaurant", null, "2027-01-20", "2026-11-23T10:00:00Z"),
  todo("Travel insurance", "mike", null, "2026-11-24T10:00:00Z"),
];
const titles = (xs: { title: string }[]) => xs.map((x) => x.title);

describe("to-do sort (T4)", () => {
  it("due date: soonest first, missing dates last; equal dates by owner (nobody's last)", () => {
    expect(titles(sortTodos(list, "due", nameOf))).toEqual(["Buy lift passes", "Book fondue", "Pick a restaurant", "Travel insurance", "Rent skis"]);
  });

  it("owner: by name, nobody's last; one person's broken by date, no date last", () => {
    expect(titles(sortTodos(list, "owner", nameOf))).toEqual(["Book fondue", "Buy lift passes", "Travel insurance", "Rent skis", "Pick a restaurant"]);
  });

  it("equal dates and owners fall back to oldest first", () => {
    const twins = [todo("Second", "mike", "2027-01-10", "2026-11-22T00:00:00Z"), todo("First", "mike", "2027-01-10", "2026-11-21T00:00:00Z")];
    expect(titles(sortTodos(twins, "due", nameOf))).toEqual(["First", "Second"]);
    expect(titles(sortTodos(twins, "owner", nameOf))).toEqual(["First", "Second"]);
  });

  it("newest: the latest added first", () => {
    expect(titles(sortTodos(list, "newest", nameOf))).toEqual(["Travel insurance", "Pick a restaurant", "Rent skis", "Buy lift passes", "Book fondue"]);
  });
});

describe("to-do filter (T4)", () => {
  it("everyone, mine, nobody yet, or one person", () => {
    expect(filterTodos(list, "everyone", "mike")).toHaveLength(5);
    expect(titles(filterTodos(list, "mine", "mike"))).toEqual(["Buy lift passes", "Travel insurance"]);
    expect(filterTodos(list, "mine", null)).toEqual([]);
    expect(titles(filterTodos(list, "nobody", "mike"))).toEqual(["Pick a restaurant"]);
    expect(titles(filterTodos(list, "person:sam", "mike"))).toEqual(["Rent skis"]);
  });
});
