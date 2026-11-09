export type CostType = "total" | "per_person";
export type PlanStatus = "suggested" | "confirmed";

export interface Traveler {
  id: string;
  name: string;
}

/** Something the group might do: a dinner, a boat day, museum tickets. */
export interface Plan {
  id: string;
  title: string;
  when?: string;
  /** Rough cost while the plan is still a suggestion, in dollars. */
  estimate?: number;
  costType: CostType;
  status: PlanStatus;
  /** Set once the plan is confirmed and logged as an expense. */
  expenseId?: string;
}

/** Money that changed hands. All amounts are whole cents to avoid rounding drift. */
export interface Expense {
  id: string;
  planId: string;
  description: string;
  totalCents: number;
  paidBy: string;
  /** Traveler id -> cents that traveler owes for this expense. */
  shares: Record<string, number>;
  createdAt: string;
}

export interface Trip {
  name: string;
  travelers: Traveler[];
  plans: Plan[];
  expenses: Expense[];
}

export interface Transfer {
  from: string;
  to: string;
  amountCents: number;
}
