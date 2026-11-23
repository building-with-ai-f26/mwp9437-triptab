/**
 * The trip's tab: who's going to what, everyone's balance, the fewest payments to settle, and
 * your own numbers. Pure functions over what api.ts loads, so they're tested offline.
 */
import { calculateSettlements } from "./money";
import type { Item, Traveler } from "./model";
import type { ExpenseRow, ItemPerson, OwnMark, Payment } from "./api";
import type { Expense, Transfer } from "../types";

/** In or out: an explicit choice wins; otherwise in, except flights, which are per person. */
export function isGoing(item: Pick<Item, "id" | "kind">, travelerId: string, people: ItemPerson[]): boolean {
  const row = people.find((p) => p.item_id === item.id && p.traveler_id === travelerId);
  return row ? row.going : item.kind !== "flight";
}

export function goingList(item: Pick<Item, "id" | "kind">, travelers: Traveler[], people: ItemPerson[]): Traveler[] {
  return travelers.filter((t) => isGoing(item, t.id, people));
}

/**
 * Who's in on a plan and who's on its bill always match (C47, Mike's call 11/23). Once a plan has
 * its one split bill, the bill says who's in: a dinner split 3 ways with Sam left out shows Sam as
 * out everywhere, whatever the in or out rows said before. Plans with no bill, and plans where
 * everyone pays their own, keep their rows as they are.
 */
export function peopleMatchingBills(people: ItemPerson[], expenses: ExpenseRow[], travelers: Pick<Traveler, "id">[]): ItemPerson[] {
  const bills = new Map(expenses.filter((e) => e.item_id && !e.own).map((e) => [e.item_id as string, e]));
  if (bills.size === 0) return people;
  const rest = people.filter((p) => !bills.has(p.item_id));
  const fromBills = [...bills].flatMap(([itemId, bill]) => {
    const on = new Set(bill.expense_shares.map((s) => s.traveler_id));
    return travelers.map((t) => ({ item_id: itemId, traveler_id: t.id, going: on.has(t.id) }));
  });
  return [...rest, ...fromBills];
}

function toSettleExpense(e: ExpenseRow): Expense {
  return {
    id: e.id,
    planId: e.item_id ?? "",
    description: e.description,
    totalCents: e.total_cents,
    paidBy: e.paid_by,
    shares: Object.fromEntries(e.expense_shares.map((s) => [s.traveler_id, s.amount_cents])),
    createdAt: e.created_at,
  };
}

/**
 * Everyone's balance (positive = owed money) and the fewest payments that square it. Own lines
 * need no special case: each is a cost whose payer is its only share, so it adds and subtracts the
 * same amount for the same person and never creates a debt.
 */
/**
 * Everyone's balance and the fewest payments to square up. A recorded payment counts at once: the
 * one who paid is owed it back, as if they'd paid an expense that was all the other person's.
 */
export function settle(
  expenses: ExpenseRow[],
  travelers: Traveler[],
  payments: Payment[] = [],
): { balances: Record<string, number>; transfers: Transfer[] } {
  const paid = payments.map((p) => ({
    id: p.id,
    planId: "",
    description: "Payment",
    totalCents: p.amount_cents,
    paidBy: p.from_traveler,
    shares: { [p.to_traveler]: p.amount_cents },
    createdAt: p.created_at,
  }));
  return calculateSettlements([...expenses.map(toSettleExpense), ...paid], travelers);
}

/**
 * "Pay with Venmo": opens Venmo (the app on a phone) with the person, amount and note filled in.
 * TripTab never sees or moves the money; recording the payment is a separate tap.
 */
/** The note on a Venmo payment: "TripTab · Pod test". No dates: the trip's read as the payment's
 *  (Mike's 11/19 review). */
export function venmoNote(tripName: string): string {
  return ["TripTab", tripName.trim()].filter(Boolean).join(" · ");
}

/** Spaces go as %20, never "+": Venmo shows a "+" as it is (Mike's 11/19 review). */
export function venmoLink(handle: string, cents: number, note: string): string {
  const q = { txn: "pay", audience: "private", recipients: handle, amount: (cents / 100).toFixed(2), note };
  return `https://venmo.com/?${Object.entries(q).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&")}`;
}

export interface MyNumbers {
  /** The group's spending plus what you paid on your own. Other people's own prices aren't yours to see or count. */
  tripTotal: number;
  /** What you paid: for the group, and on your own lines. */
  paid: number;
  /** Your share of everything, your own lines included. */
  share: number;
  /** paid - share: positive means you're owed. Own lines cancel out of it. */
  balance: number;
  /** The part of your share that is your own lines (flights and the like), never split. */
  own: number;
  /** Payments you've made minus payments you've got: already in balance. */
  settled: number;
}

export function myNumbers(expenses: ExpenseRow[], meId: string | null, payments: Payment[] = []): MyNumbers {
  let tripTotal = 0;
  let paid = 0;
  let share = 0;
  let own = 0;
  for (const e of expenses) {
    // An own line you entered for someone else is their spend, not yours or the group's.
    if (e.own && e.paid_by !== meId) continue;
    tripTotal += e.total_cents;
    if (e.paid_by === meId) paid += e.total_cents;
    share += e.expense_shares.find((s) => s.traveler_id === meId)?.amount_cents ?? 0;
    if (e.own) own += e.total_cents;
  }
  const settled = payments.reduce((n, p) => n + (p.from_traveler === meId ? p.amount_cents : 0) - (p.to_traveler === meId ? p.amount_cents : 0), 0);
  return { tripTotal, paid, share, balance: paid - share + settled, own, settled };
}

/** The group's tab: everything except own lines. */
export const groupExpenses = (expenses: ExpenseRow[]): ExpenseRow[] => expenses.filter((e) => !e.own);

/** One person's own line on a plan, if you're allowed to read it (yours, or one you entered). */
export function ownLineOf(expenses: ExpenseRow[], itemId: string, travelerId: string | null): ExpenseRow | undefined {
  return expenses.find((e) => e.own && e.item_id === itemId && e.paid_by === travelerId);
}

export interface OwnProgress {
  /** Everyone going, in trip order. */
  going: Traveler[];
  /** Ids of the people going who have logged their own line. */
  booked: Set<string>;
  /** Everyone going has booked (and someone is going). */
  complete: boolean;
}

/** Where an "everyone pays their own" plan stands: who's going and who has booked. Opting out leaves the count. */
export function ownProgress(item: Pick<Item, "id" | "kind">, travelers: Traveler[], people: ItemPerson[], marks: OwnMark[]): OwnProgress {
  const going = goingList(item, travelers, people);
  const marked = new Set(marks.filter((m) => m.item_id === item.id).map((m) => m.traveler_id));
  const booked = new Set(going.filter((t) => marked.has(t.id)).map((t) => t.id));
  return { going, booked, complete: going.length > 0 && booked.size === going.length };
}

/** "2 of 5 booked" */
/** "Each pays their own · 2 of 3 booked". Names the mode, since a bare "0 of 2 booked" on a plan
 *  with no cost yet read as a mistake (Mike's 11/19 review). */
export const bookedLabel = (p: OwnProgress): string =>
  // "0 of 1 booked" read as confusing (Mike's 11/19 review): with nobody booked, say it plainly.
  p.booked.size === 0
    ? `Each pays their own · ${p.going.length > 1 ? "nobody's booked yet" : "not booked yet"}`
    : `Each pays their own · ${p.booked.size} of ${p.going.length} booked`;

/** Your part of one expense, or null if you're not in it. */
export function myShareOf(expense: ExpenseRow | undefined, meId: string | null): number | null {
  const s = expense?.expense_shares.find((x) => x.traveler_id === meId);
  return s ? s.amount_cents : null;
}
