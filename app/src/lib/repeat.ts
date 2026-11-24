/**
 * T6 (Mike's 11/23 ski trip test, restated 11/24): add a plan to several days in one go, as
 * separate plans. Pick any set of days (Mon, Wed and Sat, or every day of a stop), and saving makes
 * one plan per day, each with all the details and each changed or deleted on its own. There is no
 * series and no "change all". A cost typed once goes on each day, or one total is split across them.
 * Pure functions, tested offline (repeat.test.ts).
 */
import type { ItemInput } from "./api";
import type { PaidNow } from "../components/trip/ItemDialog";
import { splitEqually } from "./money";
import { tripDays, type Item, type Stop } from "./model";

/** Each day gets the cost as typed, or the cost is one total shared out across the days. */
export type RepeatCost = "each" | "total";

/** Whether a kind can be repeated: activities and meals. Flights, transfers and stays are one booking each and still span. */
export const repeatable = (kind: Item["kind"]): boolean => kind === "activity" || kind === "meal";

/** n whole-cent parts of a total that add back up to it exactly; the first days take any leftover cent. */
function shares(total: number, n: number): number[] {
  const keys = Array.from({ length: n }, (_, i) => String(i));
  const out = splitEqually(total, keys);
  return keys.map((k) => out[k]);
}

/** The plans to save: one per day picked, in day order. */
export function repeatOnDays(input: ItemInput, paid: PaidNow | undefined, days: string[], cost: RepeatCost): { input: ItemInput; paid: PaidNow | undefined }[] {
  const picked = [...new Set(days)].sort();
  const n = picked.length;
  const total = cost === "total" && n > 1;
  const est = input.est_cents != null && total ? shares(input.est_cents, n) : null;
  const paidShares =
    paid && total
      ? paid.mode === "split"
        ? { usd: shares(paid.totalCents, n), foreign: paid.foreign ? shares(paid.foreign.cents, n) : null }
        : paid.mode === "own"
          ? { usd: shares(paid.cents, n), foreign: null }
          : null
      : null;
  return picked.map((day, i) => {
    const one: ItemInput = { ...input, day, end_day: null, est_cents: est ? est[i] : input.est_cents };
    let p: PaidNow | undefined = paid;
    if (paid?.mode === "later") {
      // Paid, the amount to come: every day is Confirmed, and one to-do to add it is enough.
      p = i === 0 ? paid : undefined;
    } else if (paid && paidShares) {
      p =
        paid.mode === "split"
          ? { ...paid, totalCents: paidShares.usd[i], foreign: paid.foreign && paidShares.foreign ? { ...paid.foreign, cents: paidShares.foreign[i] } : paid.foreign }
          : { ...paid, cents: paidShares.usd[i] };
    }
    return { input: one, paid: p };
  });
}

/** The trip's days a stop covers, for the "Every day of <stop>" shortcut. */
export function stopDays(stop: Pick<Stop, "start_date" | "end_date">, trip: { start_date: string; end_date: string }): string[] {
  return tripDays(stop.start_date, stop.end_date).filter((d) => d >= trip.start_date && d <= trip.end_date);
}

/**
 * An existing activity or meal over several days, split into one plan per day (the dialog's Split
 * into separate days). Each day keeps the plan's parts and times; the original goes.
 */
export function splitDays(item: Pick<Item, "kind" | "day" | "end_day">): string[] {
  if (!repeatable(item.kind) || !item.end_day || item.end_day <= item.day) return [];
  return tripDays(item.day, item.end_day);
}
