import { addDays, dayChip, PARTS, tripDays, type DayPart, type Item, type Stop, type Trip } from "./model";

/** A stay as it shows on one day of the timeline. */
export interface StayOnDay {
  item: Item;
  /** "Check in" on the first night, "Night 2 of 3" after, "Check out" on the morning it ends. */
  label: string;
  checkout: boolean;
}

export interface TimelineDay {
  date: string;
  chip: { weekday: string; date: string };
  /** Where the group is: "Chamonix", or "Chamonix to Barcelona" on a travel day. */
  title: string;
  parts: Record<DayPart, Item[]>;
  stays: StayOnDay[];
}

/**
 * Lays a trip out day by day: each day's items sorted into morning, day, evening and night,
 * and where everyone is staying that night (vision, "The itinerary as a timeline").
 */
export function buildTimeline(trip: Pick<Trip, "start_date" | "end_date">, stops: Stop[], items: Item[]): TimelineDay[] {
  const ordered = [...stops].sort((a, b) => a.position - b.position || a.start_date.localeCompare(b.start_date));
  const byCreated = [...items].sort((a, b) => a.created_at.localeCompare(b.created_at));

  return tripDays(trip.start_date, trip.end_date).map((date) => {
    const here = ordered.filter((s) => s.start_date <= date && date <= s.end_date).map((s) => s.name);
    const parts = Object.fromEntries(PARTS.map((p) => [p, [] as Item[]])) as Record<DayPart, Item[]>;
    const stays: StayOnDay[] = [];

    for (const item of byCreated) {
      if (item.kind !== "stay") {
        if (item.day === date) parts[item.part].push(item);
        continue;
      }
      const end = item.end_day ?? addDays(item.day, 1);
      if (date === end) {
        stays.push({ item, label: "Check out", checkout: true });
      } else if (item.day <= date && date < end) {
        const nights = tripDays(item.day, addDays(end, -1)).length;
        const night = tripDays(item.day, date).length;
        stays.push({ item, label: night === 1 ? "Check in" : `Night ${night} of ${nights}`, checkout: false });
      }
    }
    // Check-outs first: the morning's departure reads before the night's stay.
    stays.sort((a, b) => Number(b.checkout) - Number(a.checkout));

    return { date, chip: dayChip(date), title: here.join(" to "), parts, stays };
  });
}
