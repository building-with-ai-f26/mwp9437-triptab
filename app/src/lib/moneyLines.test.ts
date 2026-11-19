import { describe, expect, it } from "vitest";
import type { ExpenseRow, Payment } from "./api";
import { filterLines, moneyLines, yourPart, type MoneyKind } from "./moneyLines";

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

describe("what each line means for you", () => {
  const lines = moneyLines(
    [
      expense("Dinner", { day: "2027-02-06" }),
      expense("Lift tickets", { day: "2027-02-07", paid_by: "vic" }),
      expense("Taxi", { day: "2027-02-08", paid_by: "vic", expense_shares: [{ traveler_id: "vic", amount_cents: 1000, weight: null }] }),
      expense("My flight", { item_id: "f1", day: "2027-02-05", own: true, total_cents: 30000, expense_shares: [{ traveler_id: "mike", amount_cents: 30000, weight: null }] }),
      expense("Vic's flight", { item_id: "f1", day: "2027-02-05", own: true, paid_by: "vic", total_cents: 28000, expense_shares: [{ traveler_id: "vic", amount_cents: 28000, weight: null }] }),
    ],
    [payment("p1", "2027-02-09")],
    "mike",
  );
  const part = (title: string) => yourPart(lines.find((l) => l.title === title)!, "mike");

  it("you lent the others their part of what you paid, and borrowed yours of what they paid", () => {
    expect(part("Dinner")).toEqual({ text: "you lent $5", tone: "lent" });
    expect(part("Lift tickets")).toEqual({ text: "you borrowed $5", tone: "borrowed" });
    expect(part("Taxi")).toEqual({ text: "you're not in it", tone: "none" });
  });

  it("shows your own costs as yours, and leaves out someone else's own line, as the balance does", () => {
    expect(part("My flight").text).toBe("your own cost, not split");
    expect(lines.some((l) => l.title === "Vic's flight")).toBe(false);
  });

  it("says which way a payment went", () => {
    expect(part("Payment").text).toBe("you got $20");
    expect(yourPart(lines.find((l) => l.kind === "payments")!, "vic").text).toBe("you paid $20");
  });
});
