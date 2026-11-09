import type { CostType, Expense, Transfer, Traveler } from "../types";

export const toCents = (dollars: number): number => Math.round(dollars * 100);

export const formatCents = (cents: number): string => {
  const sign = cents < 0 ? "-" : "";
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
};

/** Total cost of a confirmed plan: a per-person price is multiplied by everyone who joined. */
export function totalCents(amount: number, costType: CostType, participantCount: number): number {
  return costType === "per_person" ? toCents(amount) * participantCount : toCents(amount);
}

/**
 * Splits a total equally. Leftover cents go to the first people in the list,
 * so $100 / 3 = 33.34 + 33.33 + 33.33 and the shares always add back to the total.
 */
export function splitEqually(total: number, travelerIds: string[]): Record<string, number> {
  const shares: Record<string, number> = {};
  if (travelerIds.length === 0) return shares;
  const base = Math.floor(total / travelerIds.length);
  let remainder = total - base * travelerIds.length;
  for (const id of travelerIds) {
    shares[id] = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
  }
  return shares;
}

/**
 * Net balance per traveler (positive = they are owed money), then the fewest
 * payments that square everyone up. Greedy: the biggest debtor pays the biggest creditor.
 * Adapted from the spring 2026 TripTab prototype, rewritten in whole cents.
 */
export function calculateSettlements(
  expenses: Expense[],
  travelers: Traveler[],
): { balances: Record<string, number>; transfers: Transfer[] } {
  const balances: Record<string, number> = {};
  for (const t of travelers) balances[t.id] = 0;

  for (const e of expenses) {
    balances[e.paidBy] = (balances[e.paidBy] ?? 0) + e.totalCents;
    for (const [id, share] of Object.entries(e.shares)) {
      balances[id] = (balances[id] ?? 0) - share;
    }
  }

  const debtors = Object.entries(balances)
    .filter(([, b]) => b < 0)
    .map(([id, b]) => ({ id, amount: -b }))
    .sort((a, b) => b.amount - a.amount);
  const creditors = Object.entries(balances)
    .filter(([, b]) => b > 0)
    .map(([id, b]) => ({ id, amount: b }))
    .sort((a, b) => b.amount - a.amount);

  const transfers: Transfer[] = [];
  let d = 0;
  let c = 0;
  while (d < debtors.length && c < creditors.length) {
    const amount = Math.min(debtors[d].amount, creditors[c].amount);
    if (amount > 0) transfers.push({ from: debtors[d].id, to: creditors[c].id, amountCents: amount });
    debtors[d].amount -= amount;
    creditors[c].amount -= amount;
    if (debtors[d].amount === 0) d += 1;
    if (creditors[c].amount === 0) c += 1;
  }

  return { balances, transfers };
}
