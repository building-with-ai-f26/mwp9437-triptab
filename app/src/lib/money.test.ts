import { describe, expect, it } from "vitest";
import { calculateSettlements, splitEqually, totalCents } from "./money";
import type { Expense, Traveler } from "../types";

const people: Traveler[] = [
  { id: "a", name: "A" },
  { id: "b", name: "B" },
  { id: "c", name: "C" },
];

const expense = (paidBy: string, total: number, ids: string[]): Expense => ({
  id: `${paidBy}-${total}`,
  planId: "p",
  description: "test",
  totalCents: total,
  paidBy,
  shares: splitEqually(total, ids),
  createdAt: "2026-11-08",
});

describe("splitEqually", () => {
  it("$100 / 3 = 33.34 + 33.33 + 33.33", () => {
    expect(splitEqually(10000, ["a", "b", "c"])).toEqual({ a: 3334, b: 3333, c: 3333 });
  });

  it("$1 / 7 gives the 2 leftover cents to the first two people", () => {
    const shares = Object.values(splitEqually(100, ["1", "2", "3", "4", "5", "6", "7"]));
    expect(shares).toEqual([15, 15, 14, 14, 14, 14, 14]);
  });

  it("shares always add back to the total", () => {
    const shares = splitEqually(98765, ["a", "b", "c"]);
    expect(Object.values(shares).reduce((s, x) => s + x, 0)).toBe(98765);
  });
});

describe("totalCents", () => {
  it("$100 per person x 5 people = $500", () => {
    expect(totalCents(100, "per_person", 5)).toBe(50000);
  });

  it("a total price ignores the head count", () => {
    expect(totalCents(240, "total", 4)).toBe(24000);
  });
});

describe("calculateSettlements", () => {
  it("$300 split 3 ways, paid by A: B and C each pay A $100", () => {
    const { transfers } = calculateSettlements([expense("a", 30000, ["a", "b", "c"])], people);
    expect(transfers).toEqual([
      { from: "b", to: "a", amountCents: 10000 },
      { from: "c", to: "a", amountCents: 10000 },
    ]);
  });

  it("A pays $100 dinner, B pays $60 taxi, both shared: one transfer of $20", () => {
    const { transfers } = calculateSettlements(
      [expense("a", 10000, ["a", "b"]), expense("b", 6000, ["a", "b"])],
      people,
    );
    expect(transfers).toEqual([{ from: "b", to: "a", amountCents: 2000 }]);
  });

  it("balances always net to zero", () => {
    const { balances } = calculateSettlements(
      [expense("a", 10001, ["a", "b", "c"]), expense("c", 4507, ["b", "c"])],
      people,
    );
    expect(Object.values(balances).reduce((s, x) => s + x, 0)).toBe(0);
  });
});
