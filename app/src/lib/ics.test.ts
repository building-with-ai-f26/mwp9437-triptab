import { describe, expect, it } from "vitest";
import { icsForItems, icsText } from "./ics";
import type { Item } from "./model";

const base: Item = {
  id: "i1",
  trip_id: "t",
  kind: "activity",
  title: "Ski school",
  day: "2027-02-06",
  part: "morning",
  end_day: null,
  location: "ESF Chamonix, Place de l'Eglise",
  notes: null,
  status: "planned",
  est_cents: null,
  cost_type: "total",
  pay_mode: "split",
  end_part: null,
  start_time: null,
  end_time: null,
  created_by: null,
  created_at: "",
};

const stamp = new Date("2026-11-15T12:00:00Z");

describe("add to calendar (.ics)", () => {
  it("puts a plan in its part of the day, in floating local time", () => {
    const ics = icsForItems({ name: "Euro ski trip" }, [base], stamp);
    expect(ics).toContain("DTSTART:20270206T090000\r\n");
    expect(ics).toContain("DTEND:20270206T120000\r\n");
    expect(ics).toContain("SUMMARY:Ski school\r\n");
    expect(ics).toContain("LOCATION:ESF Chamonix\\, Place de l'Eglise\r\n");
    expect(ics).toContain("STATUS:CONFIRMED");
    expect(ics).toContain("DTSTAMP:20261115T120000Z");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("a stay runs all day from check-in to check-out; a suggestion is tentative", () => {
    const stay: Item = { ...base, id: "s1", kind: "stay", title: "Chamonix Airbnb", day: "2027-02-05", end_day: "2027-02-12", status: "suggested" };
    const ics = icsForItems({ name: "Euro ski trip" }, [stay], stamp);
    expect(ics).toContain("DTSTART;VALUE=DATE:20270205");
    expect(ics).toContain("DTEND;VALUE=DATE:20270212");
    expect(ics).toContain("SUMMARY:Stay: Chamonix Airbnb");
    expect(ics).toContain("STATUS:TENTATIVE");
  });

  it("escapes commas, semicolons and newlines, and folds long lines at 75 bytes", () => {
    expect(icsText("a,b;c\nd")).toBe("a\\,b\\;c\\nd");
    // Security audit, 11/22: no other line break or control character can start a line of its own.
    expect(icsText("Dinner\rATTENDEE:mailto:x@example.com")).toBe("Dinner\\nATTENDEE:mailto:x@example.com");
    expect(icsText("a\u2028b\u2029c\u0085d\u0000e\u001bf")).toBe("a\\nb\\nc\\ndef");
    const ics = icsForItems({ name: "Trip" }, [{ ...base, notes: "x".repeat(200) }], stamp);
    expect(ics.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
  });
});
