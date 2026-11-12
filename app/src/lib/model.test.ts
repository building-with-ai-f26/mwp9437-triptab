import { describe, expect, it } from "vitest";
import {
  addDays,
  canEdit,
  dateRange,
  dayChip,
  priceLabel,
  tripDays,
  tripSpan,
  validateItem,
  validateTrip,
  type Item,
  type ItemDraft,
  type Stop,
} from "./model";
import { buildTimeline } from "./timeline";

const trip = { start_date: "2026-02-05", end_date: "2026-02-16" };

const stop = (name: string, start_date: string, end_date: string, position: number): Stop => ({
  id: name,
  trip_id: "t",
  name,
  start_date,
  end_date,
  position,
});

let n = 0;
const item = (over: Partial<Item>): Item => ({
  id: `i${++n}`,
  trip_id: "t",
  kind: "activity",
  title: "Thing",
  day: "2026-02-05",
  part: "day",
  end_day: null,
  location: null,
  notes: null,
  status: "suggested",
  est_cents: null,
  cost_type: "total",
  created_by: null,
  created_at: `2026-11-12T00:00:${String(n).padStart(2, "0")}Z`,
  ...over,
});

const draft = (over: Partial<ItemDraft>): ItemDraft => ({
  kind: "activity",
  title: "Ski school",
  day: "2026-02-06",
  part: "morning",
  end_day: null,
  status: "suggested",
  est_cents: null,
  ...over,
});

// The vision's example: Chamonix 2/5 to 2/12, Barcelona 2/12 to 2/13, Andorra 2/13 to 2/16.
const skiStops = [
  stop("Chamonix", "2026-02-05", "2026-02-12", 0),
  stop("Barcelona", "2026-02-12", "2026-02-13", 1),
  stop("Andorra", "2026-02-13", "2026-02-16", 2),
];

describe("dates", () => {
  it("lists every day of the trip, ends included, across a month boundary", () => {
    expect(tripDays("2027-01-30", "2027-02-02")).toEqual(["2027-01-30", "2027-01-31", "2027-02-01", "2027-02-02"]);
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("day chips show the actual day, like Thu 2/5, not Day 1", () => {
    expect(dayChip("2026-02-05")).toEqual({ weekday: "Thu", date: "2/5" });
  });

  it("formats a trip's date range", () => {
    expect(dateRange("2027-02-05", "2027-02-16")).toBe("Feb 5 to 16, 2027");
    expect(dateRange("2027-01-30", "2027-02-02")).toBe("Jan 30 to Feb 2, 2027");
  });
});

describe("validateTrip", () => {
  it("accepts the ski trip and spans its stops", () => {
    expect(validateTrip("Euro ski trip", skiStops)).toEqual([]);
    expect(tripSpan(skiStops)).toEqual({ start: "2026-02-05", end: "2026-02-16" });
  });

  it("needs a name, a place per stop and dates in order", () => {
    const errors = validateTrip(" ", [{ name: "", start_date: "2026-02-10", end_date: "2026-02-09" }]);
    expect(errors).toContain("Give the trip a name.");
    expect(errors).toContain("Stop 1 needs a place.");
    expect(errors).toContain("Stop 1 ends before it starts.");
  });

  it("caps a trip at 60 days", () => {
    expect(validateTrip("Gap year", [{ name: "Asia", start_date: "2026-01-01", end_date: "2026-06-01" }])).toContain(
      "Trips can be up to 60 days long.",
    );
  });
});

describe("validateItem", () => {
  it("accepts a plan inside the trip", () => {
    expect(validateItem(draft({}), trip)).toEqual([]);
  });

  it("rejects a day outside the trip and a blank name", () => {
    expect(validateItem(draft({ title: "", day: "2026-03-01" }), trip)).toEqual([
      "Give it a name.",
      "Pick a day inside the trip.",
    ]);
  });

  it("a stay needs a check-out after check-in", () => {
    expect(validateItem(draft({ kind: "stay", end_day: null }), trip)).toContain("A stay needs a check-out day.");
    expect(validateItem(draft({ kind: "stay", end_day: "2026-02-06" }), trip)).toContain(
      "Check-out has to be after check-in.",
    );
    expect(validateItem(draft({ kind: "stay", day: "2026-02-05", end_day: "2026-02-12" }), trip)).toEqual([]);
  });

  it("rejects a negative or fractional-cent estimate", () => {
    expect(validateItem(draft({ est_cents: -100 }), trip)).toHaveLength(1);
    expect(validateItem(draft({ est_cents: 10.5 }), trip)).toHaveLength(1);
  });
});

describe("statuses and prices", () => {
  it("suggested and planned show an estimate; confirmed shows the exact price", () => {
    expect(priceLabel({ status: "suggested", est_cents: 2500, cost_type: "total", kind: "meal" })).toBe("~$25 est.");
    expect(priceLabel({ status: "planned", est_cents: 4000, cost_type: "per_person", kind: "activity" })).toBe(
      "~$40 pp est.",
    );
    expect(priceLabel({ status: "confirmed", est_cents: 2500, cost_type: "total", kind: "meal" }, 2730)).toBe("$27.30");
    expect(priceLabel({ status: "suggested", est_cents: null, cost_type: "total", kind: "meal" })).toBeNull();
  });

  it("only owners can change the trip", () => {
    expect(canEdit("owner")).toBe(true);
    expect(canEdit("viewer")).toBe(false);
    expect(canEdit(null)).toBe(false);
  });
});

describe("buildTimeline", () => {
  it("has one day per date, titled by where the group is, with travel days showing both stops", () => {
    const days = buildTimeline(trip, skiStops, []);
    expect(days).toHaveLength(12);
    expect(days[0].title).toBe("Chamonix");
    expect(days[7].title).toBe("Chamonix to Barcelona");
    expect(days[8].title).toBe("Barcelona to Andorra");
    expect(days[11].title).toBe("Andorra");
  });

  it("sorts each day's plans into morning, day, evening and night", () => {
    const ski = item({ title: "Ski school", day: "2026-02-06", part: "morning" });
    const dinner = item({ title: "Fondue", day: "2026-02-06", part: "evening" });
    const bar = item({ title: "Bar", day: "2026-02-06", part: "night" });
    const other = item({ title: "Spa", day: "2026-02-07", part: "day" });
    const [, feb6, feb7] = buildTimeline(trip, skiStops, [bar, dinner, ski, other]);
    expect(feb6.parts.morning.map((i) => i.title)).toEqual(["Ski school"]);
    expect(feb6.parts.evening.map((i) => i.title)).toEqual(["Fondue"]);
    expect(feb6.parts.night.map((i) => i.title)).toEqual(["Bar"]);
    expect(feb6.parts.day).toEqual([]);
    expect(feb7.parts.day.map((i) => i.title)).toEqual(["Spa"]);
  });

  it("shows a stay on every night it covers, and the check-out the morning after", () => {
    const airbnb = item({ kind: "stay", title: "Chamonix Airbnb", day: "2026-02-05", end_day: "2026-02-08" });
    const days = buildTimeline(trip, skiStops, [airbnb]);
    expect(days[0].stays.map((s) => s.label)).toEqual(["Check in"]);
    expect(days[1].stays.map((s) => s.label)).toEqual(["Night 2 of 3"]);
    expect(days[2].stays.map((s) => s.label)).toEqual(["Night 3 of 3"]);
    expect(days[3].stays.map((s) => s.label)).toEqual(["Check out"]);
    expect(days[4].stays).toEqual([]);
  });

  it("on a changeover day, the check-out reads before the next check-in", () => {
    const a = item({ kind: "stay", title: "Chamonix Airbnb", day: "2026-02-05", end_day: "2026-02-12" });
    const b = item({ kind: "stay", title: "Barcelona hotel", day: "2026-02-12", end_day: "2026-02-13" });
    const feb12 = buildTimeline(trip, skiStops, [b, a])[7];
    expect(feb12.stays.map((s) => `${s.label}: ${s.item.title}`)).toEqual([
      "Check out: Chamonix Airbnb",
      "Check in: Barcelona hotel",
    ]);
  });
});
