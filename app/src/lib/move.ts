/**
 * Drag and drop on the itinerary (Build 3 polish, the 11/17 pod notes): moving a plan to another
 * part of the day or another day. The rules that don't need the screen, so they're unit-tested
 * (move.test.ts).
 *
 * A move keeps the plan's shape: a plan that runs over several days or parts moves as a whole,
 * by the same number of days and parts. Its clock times stay when only the day changes; when the
 * part changes they're cleared, since a 7 PM dinner can't sit in the morning (the dialog sets the
 * part from the time the same way). Stays aren't moved by dragging: their nights tie to the stay
 * row, and the dialog changes check-in and check-out.
 */
import { addDays, nightsBetween, PARTS, validateItem, type DayPart, type Item, type Trip } from "./model";

export type MovePatch = Pick<Item, "day" | "part" | "end_day" | "end_part" | "start_time" | "end_time">;

export interface Move {
  patch: MovePatch;
  /** What was there before, for Undo. */
  before: MovePatch;
  /** The plan had a time and the part changed, so the time was cleared. */
  clearedTime: string | null;
}

const travel = (kind: Item["kind"]) => kind === "flight" || kind === "transport";
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Whether a plan can be picked up and dragged. */
export const canDrag = (item: Pick<Item, "kind">): boolean => item.kind !== "stay";

/**
 * The change that moves a plan to a day and part. Null when nothing would change, or when the plan
 * can't be dragged. Errors (a move that would push its last day out of the trip) come back as
 * `{ error }`, in the dialog's words.
 */
export function movePlan(
  item: Item,
  toDay: string,
  toPart: DayPart,
  trip: Pick<Trip, "start_date" | "end_date">,
): Move | { error: string } | null {
  if (!canDrag(item)) return null;
  if (item.day === toDay && item.part === toPart) return null;
  const before: MovePatch = {
    day: item.day,
    part: item.part,
    end_day: item.end_day,
    end_part: item.end_part,
    start_time: item.start_time,
    end_time: item.end_time,
  };
  const days = nightsBetween(item.day, toDay);
  const end_day = item.end_day ? addDays(item.end_day, days) : null;
  const partShift = PARTS.indexOf(toPart) - PARTS.indexOf(item.part);
  const multiDay = end_day != null && end_day !== toDay;

  let end_part = item.end_part;
  if (partShift !== 0 && item.end_part) {
    if (multiDay && travel(item.kind)) {
      // An overnight flight lands in its own part of a later day, whatever part it leaves in.
      end_part = item.end_part;
    } else {
      // A run of parts keeps its length, cut short at night.
      end_part = PARTS[clamp(PARTS.indexOf(item.end_part) + partShift, PARTS.indexOf(toPart), PARTS.length - 1)];
    }
  }
  if (end_part === toPart && !multiDay) end_part = null;

  const partChanged = partShift !== 0;
  const clearedTime = partChanged && item.start_time ? item.start_time.slice(0, 5) : null;
  const patch: MovePatch = {
    day: toDay,
    part: toPart,
    end_day,
    end_part,
    start_time: partChanged ? null : item.start_time,
    end_time: partChanged ? null : item.end_time,
  };

  const errors = validateItem(
    { kind: item.kind, title: item.title, status: item.status, est_cents: item.est_cents, ...patch },
    trip,
  );
  if (errors.length) return { error: errors[0] };
  return { patch, before, clearedTime };
}

/** Where a slot sits, as a drop target's id: "2027-02-06|evening". */
export const slotId = (day: string, part: DayPart) => `${day}|${part}`;
export function parseSlot(id: string): { day: string; part: DayPart } | null {
  const [day, part] = id.split("|");
  return /^\d{4}-\d{2}-\d{2}$/.test(day ?? "") && PARTS.includes(part as DayPart) ? { day, part: part as DayPart } : null;
}

/** A day chip as a drop target: the plan moves to that day and keeps its part. */
export const chipId = (day: string) => `chip:${day}`;

let quietUntil = 0;
/** True for a moment after a drop, so letting go doesn't also open the plan. */
export const justDropped = Object.assign(() => Date.now() < quietUntil, {
  mark: () => {
    quietUntil = Date.now() + 350;
  },
});

/**
 * While a finger is down on a plan, nothing on the page selects text or opens iOS's own long-press
 * menu (Mike's 11/19 review: holding a plan still brought that menu up). The card itself already
 * can't be selected; this covers the rest of the page under and around the finger, and ends as
 * soon as the finger lifts.
 */
const swallow = (e: Event) => e.preventDefault();
export function quietPress(): void {
  const html = document.documentElement;
  if (html.classList.contains("press-quiet")) return;
  html.classList.add("press-quiet");
  document.addEventListener("selectstart", swallow);
  document.addEventListener("contextmenu", swallow);
  const done = () => {
    html.classList.remove("press-quiet");
    document.removeEventListener("selectstart", swallow);
    document.removeEventListener("contextmenu", swallow);
    window.removeEventListener("touchend", done);
    window.removeEventListener("touchcancel", done);
  };
  window.addEventListener("touchend", done);
  window.addEventListener("touchcancel", done);
}
