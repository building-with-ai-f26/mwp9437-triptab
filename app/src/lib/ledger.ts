/**
 * The trip's tab: who's going to what, everyone's balance, the fewest payments to settle, and
 * your own numbers. Pure functions over what api.ts loads, so they're tested offline.
 */
import { calculateSettlements } from "./money";
import type { Item, Traveler } from "./model";
import type { ExpenseRow, ItemPerson, OwnMark } from "./api";
import type { Expense, Transfer } from "../types";

/** In or out: an explicit choice wins; otherwise in, except flights, which are per person. */
export function isGoing(item: Pick<Item, "id" | "kind">, travelerId: string, people: ItemPerson[]): boolean {
  const row = people.find((p) => p.item_id === item.id && p.traveler_id === travelerId);
  return row ? row.going : item.kind !== "flight";
}

export function goingList(item: Pick<Item, "id" | "kind">, travelers: Traveler[], people: ItemPerson[]): Traveler[] {
  return travelers.filter((t) => isGoing(item, t.id, people));
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
export function settle(expenses: ExpenseRow[], travelers: Traveler[]): { balances: Record<string, number>; transfers: Transfer[] } {
  return calculateSettlements(expenses.map(toSettleExpense), travelers);
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
}

export function myNumbers(expenses: ExpenseRow[], meId: string | null): MyNumbers {
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
  return { tripTotal, paid, share, balance: paid - share, own };
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
export const bookedLabel = (p: OwnProgress): string => `${p.booked.size} of ${p.going.length} booked`;

/** Your part of one expense, or null if you're not in it. */
export function myShareOf(expense: ExpenseRow | undefined, meId: string | null): number | null {
  const s = expense?.expense_shares.find((x) => x.traveler_id === meId);
  return s ? s.amount_cents : null;
}
