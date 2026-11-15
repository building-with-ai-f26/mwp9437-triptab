import { describe, expect, it } from "vitest";
import { goingList, isGoing, myNumbers, myShareOf, settle } from "./ledger";
import type { ExpenseRow, ItemPerson } from "./api";
import type { Traveler } from "./model";

const t = (id: string): Traveler => ({
  id,
  trip_id: "trip",
  name: id,
  email: null,
  phone: null,
  role: "owner",
  user_id: null,
  claimed_at: null,
  created_at: "",
});
const people = [t("mike"), t("vic"), t("priya")];

const expense = (id: string, paid_by: string, total: number, shares: [string, number][], item_id: string | null = null): ExpenseRow => ({
  id,
  trip_id: "trip",
  item_id,
  description: id,
  day: null,
  total_cents: total,
  paid_by,
  split_mode: "even",
  created_at: "",
  expense_shares: shares.map(([traveler_id, amount_cents]) => ({ traveler_id, amount_cents, weight: null })),
});

describe("who's going", () => {
  const dinner = { id: "dinner", kind: "meal" as const };
  const flight = { id: "flight", kind: "flight" as const };
  const rows: ItemPerson[] = [
    { item_id: "dinner", traveler_id: "vic", going: false },
    { item_id: "flight", traveler_id: "mike", going: true },
  ];

  it("everyone's in a plan unless they opted out", () => {
    expect(isGoing(dinner, "mike", rows)).toBe(true);
    expect(isGoing(dinner, "vic", rows)).toBe(false);
    expect(goingList(dinner, people, rows).map((p) => p.id)).toEqual(["mike", "priya"]);
  });

  it("flights are per person: you're only on the ones you're on", () => {
    expect(goingList(flight, people, rows).map((p) => p.id)).toEqual(["mike"]);
  });
});

describe("the tab", () => {
  // Fondue $120: Mike paid, three ways. Groceries $84: Vic paid, Mike counts double.
  const expenses = [
    expense("fondue", "mike", 12000, [["mike", 4000], ["vic", 4000], ["priya", 4000]], "dinner"),
    expense("groceries", "vic", 8400, [["mike", 4200], ["vic", 2100], ["priya", 2100]]),
  ];

  it("balances net to zero and settle in the fewest payments", () => {
    const { balances, transfers } = settle(expenses, people);
    // Mike paid $120 and owes $82; Vic paid $84 and owes $61; Priya paid nothing and owes $61.
    expect(balances).toEqual({ mike: 3800, vic: 2300, priya: -6100 });
    expect(Object.values(balances).reduce((a, b) => a + b, 0)).toBe(0);
    expect(transfers).toEqual([
      { from: "priya", to: "mike", amountCents: 3800 },
      { from: "priya", to: "vic", amountCents: 2300 },
    ]);
  });

  it("your own numbers: what you paid, your share, and what you're owed", () => {
    expect(myNumbers(expenses, "mike")).toEqual({ tripTotal: 20400, paid: 12000, share: 8200, balance: 3800 });
    expect(myNumbers(expenses, "priya").balance).toBe(-6100);
    expect(myShareOf(expenses[1], "vic")).toBe(2100);
    expect(myShareOf(expenses[0], "nobody")).toBeNull();
  });
});
