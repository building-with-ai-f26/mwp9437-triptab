/**
 * T7 (Mike's 11/23 ski trip test, C63): a payment schedule on a plan, for deposits and installments.
 * Several payments, each with an amount, a due date, paid or not, and who pays. The plan's one bill
 * is the sum of the payments marked paid; unpaid ones are "coming up" and stay out of every balance.
 * Pure functions, tested offline (schedule.test.ts).
 */
import { longDay } from "./model";

export interface PlanPayment {
  id: string;
  trip_id: string;
  item_id: string;
  position: number;
  /** Dollars: as paid, or an estimate at the day's rate while a foreign payment is still to come. */
  amount_cents: number;
  currency: string | null;
  foreign_cents: number | null;
  due_day: string | null;
  paid: boolean;
  paid_on: string | null;
  paid_by: string;
  action_id: string | null;
  created_at?: string;
}

type Row = Pick<PlanPayment, "amount_cents" | "paid" | "due_day" | "position">;

export interface ScheduleSummary {
  count: number;
  paidCount: number;
  /** Paid so far, in cents: the plan's bill. */
  paidCents: number;
  /** Still to pay, in cents. */
  dueCents: number;
  totalCents: number;
  allPaid: boolean;
  /** The soonest unpaid due date, if any. */
  nextDue: string | null;
}

export function summarize(rows: Row[]): ScheduleSummary {
  const paid = rows.filter((r) => r.paid);
  const unpaid = rows.filter((r) => !r.paid);
  const paidCents = paid.reduce((n, r) => n + r.amount_cents, 0);
  const dueCents = unpaid.reduce((n, r) => n + r.amount_cents, 0);
  const dues = unpaid.map((r) => r.due_day).filter((d): d is string => Boolean(d)).sort();
  return {
    count: rows.length,
    paidCount: paid.length,
    paidCents,
    dueCents,
    totalCents: paidCents + dueCents,
    allPaid: rows.length > 0 && unpaid.length === 0,
    nextDue: dues[0] ?? null,
  };
}

/** "1 of 2 paid · next due Dec 11", or "All 2 paid". Null for a plan with no schedule. */
export function scheduleLabel(rows: Row[]): string | null {
  // No schedule, or one payment already made: the plan reads like any other paid plan.
  if (rows.length === 0 || (rows.length === 1 && rows[0].paid)) return null;
  const s = summarize(rows);
  if (s.allPaid) return `All ${s.count} paid`;
  const next = s.nextDue ? ` · next due ${shortDate(s.nextDue)}` : "";
  return `${s.paidCount} of ${s.count} paid${next}`;
}

/** "Dec 11" from "2026-12-11". */
export function shortDate(day: string): string {
  return longDay(day).replace(/^[A-Za-z]{3}, /, "");
}

/** The to-do for an unpaid payment: "Pay Chalet: payment 2". */
export const paymentTodoTitle = (planTitle: string, position: number): string => `Pay ${planTitle.trim()}: payment ${position + 1}`;

/**
 * Each person's share of a bill of `total` cents, split evenly among `ids` (whole cents, the first
 * people take any leftover cent), as the shares confirm_item takes.
 */
export function evenShares(total: number, ids: string[]): { traveler_id: string; amount_cents: number }[] {
  if (ids.length === 0) return [];
  const base = Math.floor(total / ids.length);
  let left = total - base * ids.length;
  return ids.map((id) => {
    const extra = left > 0 ? 1 : 0;
    left -= extra;
    return { traveler_id: id, amount_cents: base + extra };
  });
}

/** What a payment reads as in the schedule: "€1,000 paid Nov 18" or "€2,000 due Dec 11". */
export function paymentLine(p: Pick<PlanPayment, "amount_cents" | "currency" | "foreign_cents" | "paid" | "paid_on" | "due_day">, money: (cents: number) => string, foreign: (currency: string, cents: number) => string): string {
  const amount = p.currency && p.foreign_cents != null ? foreign(p.currency, p.foreign_cents) : money(p.amount_cents);
  if (p.paid) return `${amount} paid${p.paid_on ? ` ${shortDate(p.paid_on)}` : ""}`;
  return `${amount} ${p.due_day ? `due ${shortDate(p.due_day)}` : "to pay"}`;
}
