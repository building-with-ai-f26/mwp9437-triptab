/** Plans that span time: one plan, shown in every slot it covers, with one cost. */
import { describe, expect, it } from "vitest";
import { buildTimeline, itemSlots, placement, spansTime, whenText } from "./timeline";
import { clock, partOfTime, validateItem, type Item } from "./model";

const trip = { start_date: "2027-02-04", end_date: "2027-02-16" };

let n = 0;
const item = (over: Partial<Item>): Item => ({
  id: `i${++n}`,
  trip_id: "t",
  kind: "activity",
  title: "Skiing",
  day: "2027-02-06",
  part: "morning",
  end_day: null,
  end_part: null,
  start_time: null,
  end_time: null,
  location: null,
  notes: null,
  status: "planned",
  est_cents: null,
  cost_type: "total",
  pay_mode: "split",
  created_by: null,
  created_at: String(n).padStart(4, "0"),
  ...over,
});
const slots = (i: Item) => itemSlots(i).map((s) => `${s.day.slice(8)} ${s.part}`);

describe("the slots a plan covers", () => {
  it("an ordinary plan covers the one slot it's in", () => {
    const ski = item({});
    expect(slots(ski)).toEqual(["06 morning"]);
    expect(spansTime(ski)).toBe(false);
  });

  it("an activity can cover several parts of a day", () => {
    expect(slots(item({ end_part: "evening" }))).toEqual(["06 morning", "06 day", "06 evening"]);
  });

  it("skiing every day of a stop is one plan: the same parts on each day", () => {
    const ski = item({ end_day: "2027-02-11", end_part: "day" });
    expect(slots(ski)).toHaveLength(12);
    expect(slots(ski).slice(0, 4)).toEqual(["06 morning", "06 day", "07 morning", "07 day"]);
    expect(slots(ski)[11]).toBe("11 day");
    expect(spansTime(ski)).toBe(true);
  });

  it("a red-eye runs straight through the night into the next morning", () => {
    const flight = item({ kind: "flight", title: "UA 57", day: "2027-02-04", part: "evening", end_day: "2027-02-05", end_part: "morning", start_time: "17:05", end_time: "07:10" });
    expect(slots(flight)).toEqual(["04 evening", "04 night", "05 morning"]);
  });

  it("a flight that lands the next day with no part given is shown through to that morning", () => {
    expect(slots(item({ kind: "flight", day: "2027-02-04", part: "night", end_day: "2027-02-05" }))).toEqual(["04 night", "05 morning"]);
  });

  it("a same-day transfer covers the parts between leaving and arriving", () => {
    expect(slots(item({ kind: "transport", part: "morning", end_part: "day" }))).toEqual(["06 morning", "06 day"]);
  });

  it("a stay is laid out by night, not by slot", () => {
    expect(itemSlots(item({ kind: "stay", part: "night", end_day: "2027-02-12" }))).toEqual([]);
  });
});

describe("how a plan reads in each slot", () => {
  const ski = item({ end_day: "2027-02-08", end_part: "day" });
  it("the price belongs to the slot it starts in, once", () => {
    const firsts = itemSlots(ski).map((s) => placement(ski, s).first);
    expect(firsts).toEqual([true, false, false, false, false, false]);
  });
  it("each day says which day it is; later parts say it continues", () => {
    expect(itemSlots(ski).map((s) => placement(ski, s).label)).toEqual(["Day 1 of 3", "continues", "Day 2 of 3", "continues", "Day 3 of 3", "continues"]);
  });
  it("skiing 9 to 4 every day shows its hours on each day's first slot", () => {
    const timed = item({ end_day: "2027-02-07", end_part: "day", start_time: "09:00:00", end_time: "16:00:00" });
    expect(itemSlots(timed).map((s) => placement(timed, s).label)).toEqual(["Day 1 of 2 · 9:00 AM to 4:00 PM", "continues", "Day 2 of 2 · 9:00 AM to 4:00 PM", "continues"]);
    expect(whenText(timed)).toBe("Sat, Feb 6 to Sun, Feb 7, 9:00 AM to 4:00 PM each day");
  });
  it("a dinner at 7:30 shows its time where it starts", () => {
    const dinner = item({ kind: "meal", part: "evening", start_time: "19:30:00" });
    expect(placement(dinner, { day: dinner.day, part: "evening" }).label).toBe("From 7:30 PM");
  });
  it("a single-day plan over two parts has no label where it starts", () => {
    const lunch = item({ kind: "meal", part: "day", end_part: "evening" });
    expect(itemSlots(lunch).map((s) => placement(lunch, s).label)).toEqual([null, "continues"]);
  });
  it("a red-eye departs, is in the air, then lands", () => {
    const flight = item({ kind: "flight", day: "2027-02-04", part: "evening", end_day: "2027-02-05", end_part: "morning", start_time: "17:05:00", end_time: "07:10:00" });
    expect(itemSlots(flight).map((s) => placement(flight, s).label)).toEqual(["Departs 5:05 PM, lands Fri 7:10 AM", "In the air", "Lands 7:10 AM"]);
  });
  it("without times it still says where it lands", () => {
    const flight = item({ kind: "flight", day: "2027-02-04", part: "night", end_day: "2027-02-05", end_part: "morning" });
    expect(itemSlots(flight).map((s) => placement(flight, s).label)).toEqual([null, "Lands"]);
  });
});

describe("the timeline", () => {
  it("shows a spanning plan in every slot it covers, and still one plan", () => {
    const ski = item({ end_day: "2027-02-07", end_part: "day" });
    const flight = item({ kind: "flight", title: "UA 57", day: "2027-02-04", part: "evening", end_day: "2027-02-05", end_part: "morning" });
    const days = buildTimeline(trip, [], [ski, flight]);
    const day = (d: string) => days.find((x) => x.date === d)!;
    expect(day("2027-02-06").parts.morning.map((i) => i.id)).toEqual([ski.id]);
    expect(day("2027-02-06").parts.day.map((i) => i.id)).toEqual([ski.id]);
    expect(day("2027-02-07").parts.day.map((i) => i.id)).toEqual([ski.id]);
    expect(day("2027-02-08").parts.morning).toEqual([]);
    expect(day("2027-02-06").placed.morning[ski.id]).toEqual({ first: true, label: "Day 1 of 2" });
    expect(day("2027-02-07").placed.morning[ski.id]).toEqual({ first: false, label: "Day 2 of 2" });
    expect(day("2027-02-04").parts.night.map((i) => i.title)).toEqual(["UA 57"]);
    expect(day("2027-02-05").parts.morning.map((i) => i.title)).toEqual(["UA 57"]);
    expect(day("2027-02-05").placed.morning[flight.id].first).toBe(false);
    // One plan each, however many slots it shows in.
    const firsts = days.flatMap((d) => (["morning", "day", "evening", "night"] as const).flatMap((p) => Object.values(d.placed[p]).filter((x) => x.first)));
    expect(firsts).toHaveLength(2);
  });
});

describe("checking a spanning plan", () => {
  const draft = { kind: "activity" as const, title: "Skiing", day: "2027-02-06", part: "morning" as const, end_day: null, status: "planned" as const, est_cents: null };
  it("accepts several parts and several days inside the trip", () => {
    expect(validateItem({ ...draft, end_day: "2027-02-11", end_part: "day" }, trip)).toEqual([]);
  });
  it("refuses a last day before the first, or after the trip", () => {
    expect(validateItem({ ...draft, end_day: "2027-02-05" }, trip)).toContain("The last day can't be before the first.");
    expect(validateItem({ ...draft, end_day: "2027-02-17" }, trip)).toContain("Pick a last day inside the trip.");
  });
  it("refuses ending in an earlier part of the day than it starts", () => {
    expect(validateItem({ ...draft, part: "evening", end_part: "morning" }, trip)).toContain("It can't end in an earlier part of the day than it starts.");
  });
  it("a flight may land the next morning, and the day after the trip ends, but no later", () => {
    const flight = { ...draft, kind: "flight" as const, day: "2027-02-16", part: "evening" as const };
    expect(validateItem({ ...flight, end_day: "2027-02-17", end_part: "morning" }, trip)).toEqual([]);
    expect(validateItem({ ...flight, end_day: "2027-02-18" }, trip)).toContain("It can't arrive more than a day after the trip ends.");
    expect(validateItem({ ...flight, end_part: "morning" }, trip)).toContain("On the same day it can't arrive earlier than it leaves.");
  });
});

describe("clock times", () => {
  it("read as 12-hour times and fall in a part of the day", () => {
    expect(clock("17:05")).toBe("5:05 PM");
    expect(clock("07:10:00")).toBe("7:10 AM");
    expect(clock("00:30")).toBe("12:30 AM");
    expect(clock("12:00")).toBe("12:00 PM");
    expect(["06:40", "12:00", "17:05", "22:15"].map(partOfTime)).toEqual(["morning", "day", "evening", "night"]);
  });
});
