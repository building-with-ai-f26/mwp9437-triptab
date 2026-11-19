import { describe, expect, it } from "vitest";
import type { Item } from "./model";
import { canDrag, movePlan, parseSlot, slotId, type Move } from "./move";

const trip = { start_date: "2027-02-05", end_date: "2027-02-12" };
const item = (over: Partial<Item>): Item => ({
  id: "i1", trip_id: "t1", kind: "activity", title: "Ski school", day: "2027-02-06", part: "morning", end_day: null, end_part: null,
  start_time: null, end_time: null, location: null, notes: null, status: "planned", est_cents: null, cost_type: "total",
  pay_mode: "split", created_by: null, created_at: "2027-01-01T00:00:00Z", ...over,
});
const moved = (r: ReturnType<typeof movePlan>): Move => {
  if (!r || "error" in r) throw new Error(`expected a move, got ${JSON.stringify(r)}`);
  return r;
};

describe("drag and drop: moving a plan", () => {
  it("moves to another day and part, and keeps what was there for Undo", () => {
    const m = moved(movePlan(item({}), "2027-02-08", "evening", trip));
    expect(m.patch).toEqual({ day: "2027-02-08", part: "evening", end_day: null, end_part: null, start_time: null, end_time: null });
    expect(m.before).toMatchObject({ day: "2027-02-06", part: "morning" });
  });

  it("does nothing on its own slot, and never drags a stay", () => {
    expect(movePlan(item({}), "2027-02-06", "morning", trip)).toBeNull();
    expect(canDrag(item({ kind: "stay" }))).toBe(false);
    expect(movePlan(item({ kind: "stay", end_day: "2027-02-08", part: "night" }), "2027-02-07", "night", trip)).toBeNull();
  });

  it("keeps a plan's times when only the day changes, and clears them when the part does", () => {
    const dinner = item({ kind: "meal", title: "Fondue", part: "evening", start_time: "19:00:00", end_time: "21:00:00" });
    const sameTime = moved(movePlan(dinner, "2027-02-09", "evening", trip));
    expect(sameTime.patch).toMatchObject({ start_time: "19:00:00", end_time: "21:00:00" });
    expect(sameTime.clearedTime).toBeNull();
    const morning = moved(movePlan(dinner, "2027-02-09", "morning", trip));
    expect(morning.patch).toMatchObject({ start_time: null, end_time: null });
    expect(morning.clearedTime).toBe("19:00");
  });

  it("moves a run of parts as a whole, cut short at night", () => {
    const allDay = item({ part: "morning", end_part: "evening" });
    expect(moved(movePlan(allDay, "2027-02-06", "day", trip)).patch).toMatchObject({ part: "day", end_part: "night" });
    expect(moved(movePlan(allDay, "2027-02-06", "evening", trip)).patch).toMatchObject({ part: "evening", end_part: "night" });
    expect(moved(movePlan(item({ part: "morning", end_part: "day" }), "2027-02-07", "night", trip)).patch).toMatchObject({ part: "night", end_part: null });
  });

  it("moves a plan over several days by the same number of days, and refuses one pushed out of the trip", () => {
    const skiing = item({ title: "Skiing", day: "2027-02-06", end_day: "2027-02-09" });
    expect(moved(movePlan(skiing, "2027-02-07", "morning", trip)).patch).toMatchObject({ day: "2027-02-07", end_day: "2027-02-10" });
    expect(movePlan(skiing, "2027-02-11", "morning", trip)).toEqual({ error: "Pick a last day inside the trip." });
  });

  it("keeps an overnight flight's landing part, and lets travel land the day after the trip", () => {
    const redEye = item({ kind: "flight", title: "UA 57", day: "2027-02-05", part: "evening", end_day: "2027-02-06", end_part: "morning", start_time: "18:40", end_time: "08:05" });
    const m = moved(movePlan(redEye, "2027-02-12", "night", trip));
    expect(m.patch).toMatchObject({ day: "2027-02-12", part: "night", end_day: "2027-02-13", end_part: "morning", start_time: null });
  });

  it("reads and writes a slot's id", () => {
    expect(parseSlot(slotId("2027-02-06", "evening"))).toEqual({ day: "2027-02-06", part: "evening" });
    expect(parseSlot("2027-02-06|lunch")).toBeNull();
    expect(parseSlot("nope")).toBeNull();
  });
});
