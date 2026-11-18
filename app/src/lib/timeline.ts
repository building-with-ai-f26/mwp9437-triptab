import { addDays, clock, dayChip, longDay, PART_LABEL, PARTS, tripDays, type DayPart, type Item, type Stop, type Trip } from "./model";

/** A stay as it shows on one day of the timeline. */
export interface StayOnDay {
  item: Item;
  /** "Check in" on the first night, "Night 2 of 3" after, "Check out" on the morning it ends. */
  label: string;
  checkout: boolean;
}

/** One slot a plan covers: a part of a day. */
export interface Slot {
  day: string;
  part: DayPart;
}

/** How a plan shows in one of the slots it covers. */
export interface Placement {
  /** The slot it starts in, where its price and status show: one plan, one cost. */
  first: boolean;
  /** "Day 2 of 6", "continues", "Departs 5:05 PM, lands Fri 7:10 AM", "In the air", "Lands 7:10 AM". */
  label: string | null;
}

const MAX_SLOTS = 400;

/**
 * Every slot a plan covers (stays are laid out apart, by night).
 * - A flight or a transfer runs straight through, from the part it leaves in to the part it
 *   arrives in, across midnight: Thu evening, Thu night, Fri morning.
 * - An activity or a meal over several days covers the same parts each day: skiing every day of a
 *   stop, morning to day, is one plan shown in each of those slots.
 */
export function itemSlots(item: Pick<Item, "kind" | "day" | "part" | "end_day" | "end_part">): Slot[] {
  if (item.kind === "stay") return [];
  const lastDay = item.end_day && item.end_day > item.day ? item.end_day : item.day;
  const from = PARTS.indexOf(item.part);
  const slots: Slot[] = [];
  if (item.kind === "flight" || item.kind === "transport") {
    const to = item.end_part ? PARTS.indexOf(item.end_part) : lastDay > item.day ? 0 : from;
    for (let day = item.day; day <= lastDay && slots.length < MAX_SLOTS; day = addDays(day, 1)) {
      const a = day === item.day ? from : 0;
      const b = day === lastDay ? Math.max(to, day === item.day ? from : 0) : PARTS.length - 1;
      for (let i = a; i <= b; i++) slots.push({ day, part: PARTS[i] });
    }
    return slots;
  }
  const to = item.end_part ? Math.max(PARTS.indexOf(item.end_part), from) : from;
  for (let day = item.day; day <= lastDay && slots.length < MAX_SLOTS; day = addDays(day, 1)) {
    for (let i = from; i <= to; i++) slots.push({ day, part: PARTS[i] });
  }
  return slots;
}

/** Whether a plan covers more than the one slot it starts in. */
export const spansTime = (item: Pick<Item, "kind" | "day" | "part" | "end_day" | "end_part">): boolean => itemSlots(item).length > 1;

/** How a plan reads in one of its slots. */
export function placement(item: Item, slot: Slot): Placement {
  const slots = itemSlots(item);
  const index = slots.findIndex((x) => x.day === slot.day && x.part === slot.part);
  const first = index <= 0;
  const last = index === slots.length - 1;
  if (item.kind === "flight" || item.kind === "transport") {
    const flight = item.kind === "flight";
    const lands = item.end_time ? `${flight ? "lands" : "arrives"} ${item.end_day && item.end_day > item.day ? `${dayChip(item.end_day).weekday} ` : ""}${clock(item.end_time)}` : null;
    if (first) {
      const leaves = item.start_time ? `${flight ? "Departs" : "Leaves"} ${clock(item.start_time)}` : null;
      const both = [leaves, lands].filter(Boolean).join(", ");
      return { first, label: both ? both.charAt(0).toUpperCase() + both.slice(1) : null };
    }
    if (last) return { first, label: item.end_time ? `${flight ? "Lands" : "Arrives"} ${clock(item.end_time)}` : flight ? "Lands" : "Arrives" };
    return { first, label: flight ? "In the air" : "On the way" };
  }
  const days = item.end_day && item.end_day > item.day ? tripDays(item.day, item.end_day) : [item.day];
  const dayNo = days.indexOf(slot.day) + 1;
  const firstOfDay = slot.part === item.part;
  const times = hours(item);
  if (days.length > 1 && firstOfDay) return { first, label: [`Day ${dayNo} of ${days.length}`, times].filter(Boolean).join(" · ") };
  if (!first) return { first, label: "continues" };
  return { first, label: times };
}

/** An activity's or a meal's hours, the same each day it runs: "9:00 AM to 4:00 PM", "From 7:30 PM". */
export function hours(item: Pick<Item, "start_time" | "end_time">): string | null {
  if (item.start_time && item.end_time) return `${clock(item.start_time)} to ${clock(item.end_time)}`;
  if (item.start_time) return `From ${clock(item.start_time)}`;
  if (item.end_time) return `Until ${clock(item.end_time)}`;
  return null;
}

/** When a plan is, in one line: "Sat, Feb 6 to Thu, Feb 11, morning to day" or "Thu, Feb 4, evening. Departs 5:05 PM, lands Fri 7:10 AM". */
export function whenText(item: Item): string {
  if (item.kind === "stay") return `${longDay(item.day)} to ${longDay(item.end_day ?? item.day)}`;
  const part = PART_LABEL[item.part].toLowerCase();
  const lastDay = item.end_day && item.end_day > item.day ? item.end_day : null;
  if (item.kind === "flight" || item.kind === "transport") {
    const label = placement(item, { day: item.day, part: item.part }).label;
    const arrives = lastDay && !item.end_time ? ` ${item.kind === "flight" ? "Lands" : "Arrives"} ${longDay(lastDay)}${item.end_part ? `, ${PART_LABEL[item.end_part].toLowerCase()}` : ""}.` : "";
    return `${longDay(item.day)}, ${part}.${label ? ` ${label}.` : ""}${arrives}`.replace(/\.$/, "");
  }
  const parts = hours(item) ?? (item.end_part && item.end_part !== item.part ? `${part} to ${PART_LABEL[item.end_part].toLowerCase()}` : part);
  return lastDay ? `${longDay(item.day)} to ${longDay(lastDay)}, ${parts} each day` : `${longDay(item.day)}, ${parts}`;
}

export interface TimelineDay {
  date: string;
  chip: { weekday: string; date: string };
  /** Where the group is: "Chamonix", or "Chamonix to Barcelona" on a travel day. */
  title: string;
  parts: Record<DayPart, Item[]>;
  /** For each part, how each plan there shows, by plan id: where it starts, or a continuation. */
  placed: Record<DayPart, Record<string, Placement>>;
  stays: StayOnDay[];
  /** Flights and transfers in the air or on the road across tonight: a red-eye needs no bed (11/17). */
  overnight: Item[];
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
    const placed = Object.fromEntries(PARTS.map((p) => [p, {} as Record<string, Placement>])) as Record<DayPart, Record<string, Placement>>;
    const stays: StayOnDay[] = [];
    const overnight: Item[] = [];

    for (const item of byCreated) {
      if ((item.kind === "flight" || item.kind === "transport") && item.day <= date && item.end_day && item.end_day > date) {
        overnight.push(item);
      }
      if (item.kind !== "stay") {
        // A plan shows in every slot it covers: its own, and any it runs on into.
        for (const slot of itemSlots(item)) {
          if (slot.day !== date) continue;
          parts[slot.part].push(item);
          placed[slot.part][item.id] = placement(item, slot);
        }
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

    return { date, chip: dayChip(date), title: here.join(" to "), parts, placed, stays, overnight };
  });
}

/** Splits the trip into weeks of seven days from its first day, for the week view. */
export function weeks<T>(days: T[], size = 7): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < days.length; i += size) out.push(days.slice(i, i + size));
  return out;
}
