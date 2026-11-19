import { describe, expect, it } from "vitest";
import type { ExpenseRow, Payment } from "./api";
import { filterLines, moneyLines, type MoneyKind } from "./moneyLines";

const expense = (id: string, over: Partial<ExpenseRow>): ExpenseRow =>
  ({
    id,
    trip_id: "t",
    item_id: null,
    description: id,
    day: null,
    total_cents: 1000,
    paid_by: "mike",
    split_mode: "even",
    own: false,
    with_points: false,
    expense_shares: [
      { traveler_id: "mike", amount_cents: 500, weight: null },
      { traveler_id: "vic", amount_cents: 500, weight: null },
    ],
    ...over,
  }) as ExpenseRow;
const payment = (id: string, day: string): Payment =>
  ({ id, trip_id: "t", from_traveler: "vic", to_traveler: "mike", amount_cents: 2000, method: "venmo", paid_on: day, note: null, created_by: null, created_at: day }) as unknown as Payment;

describe("every cost and payment in one list (Mike's 11/19 review)", () => {
  const lines = moneyLines(
    [
      expense("Groceries", { day: null }),
      expense("Dinner", { item_id: "i1", day: "2027-02-06" }),
      expense("Car rental", { item_id: "i2", day: "2027-02-05", total_cents: 4500, expense_shares: [{ traveler_id: "vic", amount_cents: 4500, weight: null }] }),
    ],
    [payment("p1", "2027-02-07")],
    "mike",
  );

  it("puts plans' costs, other expenses and payments in the trip's order, no-day lines last", () => {
    expect(lines.map((l) => l.title)).toEqual(["Car rental", "Dinner", "Payment", "Groceries"]);
    expect(lines.map((l) => l.kind)).toEqual(["plans", "plans", "payments", "expenses"]);
  });

  it("says what your part is, or that you're not in it", () => {
    const dinner = lines.find((l) => l.title === "Dinner")!;
    const car = lines.find((l) => l.title === "Car rental")!;
    expect(dinner.kind !== "payments" && dinner.myPart).toBe(500);
    expect(car.kind !== "payments" && car.myPart).toBeNull();
  });

  it("filters by any mix of kinds, and none picked shows none", () => {
    const only = (...k: MoneyKind[]) => filterLines(lines, new Set(k)).map((l) => l.title);
    expect(only("plans")).toEqual(["Car rental", "Dinner"]);
    expect(only("expenses", "payments")).toEqual(["Payment", "Groceries"]);
    expect(only()).toEqual([]);
  });
});
