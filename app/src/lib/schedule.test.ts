import { describe, expect, it } from "vitest";
import { evenShares, paymentLine, paymentTodoTitle, scheduleLabel, summarize } from "./schedule";

// A made-up chalet: 3,000 EUR as 1,000 paid on 11/18 and 2,000 due 12/11, at 1.10 dollars a euro.
const deposit = { amount_cents: 110000, paid: true, due_day: "2026-11-18", position: 0 };
const balance = { amount_cents: 220000, paid: false, due_day: "2026-12-11", position: 1 };

describe("payment schedule (T7)", () => {
  it("adds up exactly: paid is the bill, unpaid is coming up", () => {
    expect(summarize([deposit, balance])).toEqual({ count: 2, paidCount: 1, paidCents: 110000, dueCents: 220000, totalCents: 330000, allPaid: false, nextDue: "2026-12-11" });
    expect(summarize([deposit, { ...balance, paid: true }]).allPaid).toBe(true);
  });

  it("reads 1 of 2 paid · next due Dec 11, then All 2 paid", () => {
    expect(scheduleLabel([deposit, balance])).toBe("1 of 2 paid · next due Dec 11");
    expect(scheduleLabel([deposit, { ...balance, paid: true }])).toBe("All 2 paid");
    expect(scheduleLabel([])).toBeNull();
    expect(scheduleLabel([deposit])).toBeNull();
    expect(scheduleLabel([balance])).toBe("0 of 1 paid · next due Dec 11");
  });

  it("the soonest unpaid due date is next, and one with no date is never next", () => {
    const rows = [
      { ...balance, due_day: null },
      { ...balance, due_day: "2027-01-05" },
      { ...balance, due_day: "2026-12-20" },
    ];
    expect(summarize(rows).nextDue).toBe("2026-12-20");
  });

  it("splits each paid total evenly to the cent", () => {
    const shares = evenShares(110001, ["a", "b", "c"]);
    expect(shares.map((s) => s.amount_cents)).toEqual([36667, 36667, 36667]);
    expect(shares.reduce((n, s) => n + s.amount_cents, 0)).toBe(110001);
  });

  it("each foreign payment shows as written, with its own date", () => {
    const eur = (c: string, cents: number) => c + " " + (cents / 100).toLocaleString("en-US");
    const usd = (cents: number) => "$" + cents / 100;
    expect(paymentLine({ ...deposit, currency: "EUR", foreign_cents: 100000, paid_on: "2026-11-18" }, usd, eur)).toBe("EUR 1,000 paid Nov 18");
    expect(paymentLine({ ...balance, currency: "EUR", foreign_cents: 200000, paid_on: null }, usd, eur)).toBe("EUR 2,000 due Dec 11");
    expect(paymentTodoTitle("Chalet ", 1)).toBe("Pay Chalet: payment 2");
  });
});
