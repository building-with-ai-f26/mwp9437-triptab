/**
 * Add to calendar (vision, "Help along the way"): an .ics file any calendar app opens. Plans sit
 * in their part of the day; stays run all day from check-in to check-out. Times are "floating"
 * (no time zone), so 9 AM in Chamonix shows as 9 AM wherever the phone is.
 */
import { KIND_LABEL, PART_LABEL, STATUS_LABEL, type DayPart, type Item, type Trip } from "./model";

const PART_TIMES: Record<DayPart, [string, string]> = {
  morning: ["090000", "120000"],
  day: ["120000", "170000"],
  evening: ["180000", "210000"],
  night: ["210000", "235900"],
};

const ymd = (iso: string) => iso.replace(/-/g, "");

/**
 * Escapes text for an .ics field: backslash, semicolon, comma and line breaks. Every kind of line
 * break counts (a lone carriage return, and Unicode's next-line and line and paragraph separators),
 * and other control characters are dropped (security audit, 11/22): some calendar apps start a new
 * line at any of them, and a plan's title could have added lines of its own to the calendar file.
 */
export function icsText(s: string): string {
  return s
    .replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,")
    .replace(/\r\n|[\r\n\u0085\u2028\u2029]/g, "\\n")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
}

/** Folds lines longer than 75 octets, as the format requires. */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (new TextEncoder().encode(rest).length > 75) {
    let cut = 75;
    while (new TextEncoder().encode(rest.slice(0, cut)).length > 75) cut--;
    out.push(rest.slice(0, cut));
    rest = " " + rest.slice(cut);
  }
  out.push(rest);
  return out.join("\r\n");
}

export function icsForItems(trip: Pick<Trip, "name">, items: Item[], stamp = new Date()): string {
  const dtstamp = stamp.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//TripTab//Itinerary//EN", "CALSCALE:GREGORIAN", `X-WR-CALNAME:${icsText(trip.name)}`];
  for (const item of items) {
    const desc = [
      `${KIND_LABEL[item.kind]} · ${STATUS_LABEL[item.status]}`,
      `Trip: ${trip.name}`,
      item.notes ?? "",
    ]
      .filter(Boolean)
      .join("\n");
    lines.push("BEGIN:VEVENT", `UID:${item.id}@triptab`, `DTSTAMP:${dtstamp}`);
    if (item.kind === "stay") {
      lines.push(`DTSTART;VALUE=DATE:${ymd(item.day)}`, `DTEND;VALUE=DATE:${ymd(item.end_day ?? item.day)}`);
    } else {
      const hms = (t: string) => t.replace(/:/g, "").padEnd(6, "0").slice(0, 6);
      const start = item.start_time ? hms(item.start_time) : PART_TIMES[item.part][0];
      const lastPart = item.end_part ?? item.part;
      const lastDay = item.end_day && item.end_day > item.day ? item.end_day : item.day;
      if (item.kind === "flight" || item.kind === "transport") {
        // One stretch, from leaving to arriving, across midnight if it's a red-eye.
        const end = item.end_time ? hms(item.end_time) : lastDay > item.day && !item.end_part ? PART_TIMES.morning[0] : PART_TIMES[lastPart][1];
        lines.push(`DTSTART:${ymd(item.day)}T${start}`, `DTEND:${ymd(lastDay)}T${end}`);
      } else {
        // The same hours each day it runs: one event, repeating daily to its last day.
        const end = item.end_time ? hms(item.end_time) : PART_TIMES[lastPart][1];
        lines.push(`DTSTART:${ymd(item.day)}T${start}`, `DTEND:${ymd(item.day)}T${end}`);
        if (lastDay > item.day) lines.push(`RRULE:FREQ=DAILY;UNTIL=${ymd(lastDay)}T235959`);
      }
    }
    lines.push(`SUMMARY:${icsText(item.kind === "stay" ? `Stay: ${item.title}` : item.title)}`);
    if (item.location) lines.push(`LOCATION:${icsText(item.location)}`);
    lines.push(`DESCRIPTION:${icsText(item.kind === "stay" ? desc : `${PART_LABEL[item.part]} · ${desc}`)}`);
    if (item.status === "suggested") lines.push("STATUS:TENTATIVE");
    else lines.push("STATUS:CONFIRMED");
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** Starts a download of an .ics file in the browser. */
export function downloadIcs(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.replace(/[^\w.-]+/g, "-");
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
