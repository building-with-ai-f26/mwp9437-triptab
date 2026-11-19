/**
 * Every cost and payment on a trip in one list (Mike's 11/19 review: "you're kind of blind to the
 * activities that cost money"; Splitwise shows every line with who paid and what you owe). The
 * rules that don't need the screen, so they're unit-tested (moneyLines.test.ts).
 *
 * Three kinds, filterable together: a plan's cost (an expense on a plan, or your own line on an
 * each-pays-their-own plan), another expense, and a payment between two people. Sorted by the
 * trip's calendar: lines with a day first, earliest first, then those with no particular day.
 */
import type { ExpenseRow, Payment, PaymentMethod } from "./api";
import { dollars, type Traveler } from "./model";

export const METHOD_LABEL: Record<PaymentMethod, string> = { venmo: "Venmo", cash: "Cash", zelle: "Zelle", other: "Other" };

/** A person's name, or "You". */
export const nameOf = (travelers: Traveler[], id: string, meId: string | null): string =>
  id === meId ? "You" : (travelers.find((t) => t.id === id)?.name ?? "?");

export type MoneyKind = "plans" | "expenses" | "payments";
export const MONEY_KINDS: MoneyKind[] = ["plans", "expenses", "payments"];
export const MONEY_KIND_LABEL: Record<MoneyKind, string> = { plans: "Plans", expenses: "Other expenses", payments: "Payments" };

export type MoneyLine =
  | { kind: "plans" | "expenses"; id: string; day: string | null; title: string; cents: number; paidBy: string; myPart: number | null; own: boolean; expense: ExpenseRow }
  | { kind: "payments"; id: string; day: string; title: string; cents: number; paidBy: string; to: string; payment: Payment };

/**
 * Every line, in the trip's order. `meId` is who "your part" is for. Someone else's own line (one
 * you entered for them) is their spend, not yours or the group's, so it's left out, as it is from
 * your balance (ledger.myNumbers).
 */
export function moneyLines(expenses: ExpenseRow[], payments: Payment[] | null, meId: string | null): MoneyLine[] {
  const lines: MoneyLine[] = [
    ...expenses
      .filter((e) => !e.own || e.paid_by === meId)
      .map((e): MoneyLine => ({
      kind: e.item_id ? "plans" : "expenses",
      id: `e:${e.id}`,
      day: e.day,
      title: e.description,
      cents: e.total_cents,
      paidBy: e.paid_by,
      myPart: e.expense_shares.find((s) => s.traveler_id === meId)?.amount_cents ?? null,
      own: e.own,
        expense: e,
      })),
    ...(payments ?? []).map((p): MoneyLine => ({
      kind: "payments",
      id: `p:${p.id}`,
      day: p.paid_on,
      title: "Payment",
      cents: p.amount_cents,
      paidBy: p.from_traveler,
      to: p.to_traveler,
      payment: p,
    })),
  ];
  return lines.sort((a, b) => {
    if (a.day && b.day && a.day !== b.day) return a.day < b.day ? -1 : 1;
    if (a.day && !b.day) return -1;
    if (!a.day && b.day) return 1;
    return a.title.localeCompare(b.title);
  });
}

/** The lines of the kinds picked; none picked shows none. */
export const filterLines = (lines: MoneyLine[], kinds: Set<MoneyKind>): MoneyLine[] => lines.filter((l) => kinds.has(l.kind));

/**
 * What one line means for you, the way Splitwise reads (Mike's 11/19 review): you lent the others
 * their part, you borrowed yours from whoever paid, or you're not in it. Each line is the line on
 * its own; the balance above nets them with the payments.
 */
export function yourPart(line: MoneyLine, meId: string | null): { text: string; tone: "lent" | "borrowed" | "none" } {
  if (line.kind === "payments") {
    if (line.paidBy === meId) return { text: `you paid ${dollars(line.cents)}`, tone: "none" };
    if (line.to === meId) return { text: `you got ${dollars(line.cents)}`, tone: "none" };
    return { text: "not you", tone: "none" };
  }
  if (line.own) return { text: "your own cost, not split", tone: "none" };
  const mine = line.myPart ?? 0;
  if (line.paidBy === meId) {
    const lent = line.cents - mine;
    return lent > 0 ? { text: `you lent ${dollars(lent)}`, tone: "lent" } : { text: "just you", tone: "none" };
  }
  return mine > 0 ? { text: `you borrowed ${dollars(mine)}`, tone: "borrowed" } : { text: "you're not in it", tone: "none" };
}
