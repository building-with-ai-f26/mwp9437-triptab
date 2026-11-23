import { describe, expect, it } from "vitest";
import { bookedLabel, goingList, peopleMatchingBills, groupExpenses, isGoing, myNumbers, myShareOf, ownLineOf, ownProgress, settle, venmoLink } from "./ledger";
import type { ExpenseRow, ItemPerson, Payment } from "./api";
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
  own: false,
  with_points: false,
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
    expect(myNumbers(expenses, "mike")).toEqual({ tripTotal: 20400, paid: 12000, share: 8200, balance: 3800, own: 0, settled: 0 });
    expect(myNumbers(expenses, "priya").balance).toBe(-6100);
    expect(myShareOf(expenses[1], "vic")).toBe(2100);
    expect(myShareOf(expenses[0], "nobody")).toBeNull();
  });
});

describe("recorded payments", () => {
  const expenses = [
    expense("fondue", "mike", 12000, [["mike", 4000], ["vic", 4000], ["priya", 4000]], "dinner"),
    expense("groceries", "vic", 8400, [["mike", 4200], ["vic", 2100], ["priya", 2100]]),
  ];
  const payment = (from_traveler: string, to_traveler: string, amount_cents: number): Payment => ({
    id: `${from_traveler}-${to_traveler}`,
    trip_id: "trip",
    from_traveler,
    to_traveler,
    amount_cents,
    paid_on: "2027-02-06",
    method: "venmo",
    note: null,
    created_by: null,
    created_at: "",
  });

  it("a payment moves both balances at once, and the rest still settles", () => {
    // Priya owed $61: she Venmos Mike his $38.
    const { balances, transfers } = settle(expenses, people, [payment("priya", "mike", 3800)]);
    expect(balances).toEqual({ mike: 0, vic: 2300, priya: -2300 });
    expect(transfers).toEqual([{ from: "priya", to: "vic", amountCents: 2300 }]);
  });

  it("once everyone's paid, everyone's even", () => {
    const { balances, transfers } = settle(expenses, people, [payment("priya", "mike", 3800), payment("priya", "vic", 2300)]);
    expect(Object.values(balances).every((b) => b === 0)).toBe(true);
    expect(transfers).toEqual([]);
  });

  it("your numbers: payments change your balance, not what the trip cost or your share", () => {
    const paid = [payment("priya", "mike", 3800)];
    expect(myNumbers(expenses, "priya", paid)).toMatchObject({ tripTotal: 20400, share: 6100, balance: -2300, settled: 3800 });
    expect(myNumbers(expenses, "mike", paid)).toMatchObject({ balance: 0, settled: -3800 });
  });

  it("an advance before anything is spent shows as owed back", () => {
    // Mike collects $200 from Vic toward the Airbnb before it's booked.
    const { balances } = settle([], people, [payment("vic", "mike", 20000)]);
    expect(balances).toEqual({ mike: -20000, vic: 20000, priya: 0 });
  });

  it("Pay with Venmo fills in the person, the amount and a note", () => {
    const url = new URL(venmoLink("mike-p", 3850, "TripTab: Euro ski trip"));
    expect(url.origin).toBe("https://venmo.com");
    expect(Object.fromEntries(url.searchParams)).toEqual({ txn: "pay", audience: "private", recipients: "mike-p", amount: "38.50", note: "TripTab: Euro ski trip" });
    // Venmo shows a "+" as it is, so spaces must go as %20 (Mike's 11/19 review).
    expect(url.search).not.toContain("+");
    expect(url.search).toContain("TripTab%3A%20Euro%20ski%20trip");
  });
});

/** An own line: one person's own price on a plan, where the payer is the only share. */
const ownLine = (item_id: string, who: string, cents: number, with_points = false): ExpenseRow => ({
  ...expense(`${item_id}-${who}`, who, cents, [[who, cents]], item_id),
  own: true,
  with_points,
});

describe("everyone pays their own", () => {
  const dinner = expense("dinner", "mike", 12000, [["mike", 4000], ["vic", 4000], ["priya", 4000]], "dinner");
  const groceries = expense("groceries", "vic", 6001, [["mike", 2001], ["vic", 2000], ["priya", 2000]]);
  const shared = [dinner, groceries];
  const lines = [ownLine("flight", "mike", 42000), ownLine("flight", "vic", 61550), ownLine("flight", "priya", 0, true)];

  it("own lines never move a balance", () => {
    const before = settle(shared, people);
    const after = settle([...shared, ...lines], people);
    expect(after.balances).toEqual(before.balances);
  });

  it("own lines never appear in settle up", () => {
    expect(settle([...shared, ...lines], people).transfers).toEqual(settle(shared, people).transfers);
    expect(settle(lines, people).transfers).toEqual([]);
    expect(settle(lines, people).balances).toEqual({ mike: 0, vic: 0, priya: 0 });
  });

  it("holds for any mix of amounts, including zero and a points line", () => {
    for (const amounts of [[1, 2, 3], [99999, 0, 1], [33333, 33333, 33334], [0, 0, 0]]) {
      const mixed = [...shared, ...amounts.map((c, i) => ownLine(`plan${i}`, people[i].id, c, c === 0))];
      expect(settle(mixed, people)).toEqual(settle(shared, people));
    }
  });

  it("an own line counts in that person's own spend and trip total, and nobody else's", () => {
    // Mike's view: the database returns only his own line (and any he entered).
    const mine = myNumbers([...shared, lines[0]], "mike");
    expect(mine.own).toBe(42000);
    expect(mine.tripTotal).toBe(12000 + 6001 + 42000);
    expect(mine.paid).toBe(12000 + 42000);
    expect(mine.share).toBe(4000 + 2001 + 42000);
    expect(mine.balance).toBe(myNumbers(shared, "mike").balance);
  });

  it("a line you entered for someone else isn't your spend", () => {
    // Mike, an owner, logged Vic's flight: he can read it, but it's Vic's number.
    const withVics = myNumbers([...shared, lines[0], lines[1]], "mike");
    expect(withVics).toEqual(myNumbers([...shared, lines[0]], "mike"));
  });

  it("the group's tab leaves own lines out", () => {
    expect(groupExpenses([...shared, ...lines])).toEqual(shared);
  });

  it("finds a person's own line on a plan", () => {
    expect(ownLineOf(lines, "flight", "vic")?.total_cents).toBe(61550);
    expect(ownLineOf(lines, "flight", "nobody")).toBeUndefined();
    expect(ownLineOf(shared, "dinner", "mike")).toBeUndefined(); // a shared bill is not an own line
  });

  it("counts who has booked among the people going", () => {
    const lift = { id: "lift", kind: "activity" as const };
    const marks = [{ item_id: "lift", traveler_id: "mike" }, { item_id: "lift", traveler_id: "vic" }, { item_id: "other", traveler_id: "priya" }];
    const p = ownProgress(lift, people, [], marks);
    expect(bookedLabel(p)).toBe("Each pays their own · 2 of 3 booked");
    expect(bookedLabel(ownProgress(lift, people, [], []))).toBe("Each pays their own · nobody's booked yet");
    expect(p.complete).toBe(false);
  });

  it("opting out removes that person from the count", () => {
    const lift = { id: "lift", kind: "activity" as const };
    const marks = [{ item_id: "lift", traveler_id: "mike" }, { item_id: "lift", traveler_id: "vic" }];
    const p = ownProgress(lift, people, [{ item_id: "lift", traveler_id: "priya", going: false }], marks);
    expect(bookedLabel(p)).toBe("Each pays their own · 2 of 2 booked");
    expect(p.complete).toBe(true);
  });

  it("someone who booked and then opted out isn't counted as booked", () => {
    const lift = { id: "lift", kind: "activity" as const };
    const marks = [{ item_id: "lift", traveler_id: "vic" }];
    const p = ownProgress(lift, people, [{ item_id: "lift", traveler_id: "vic", going: false }], marks);
    expect(bookedLabel(p)).toBe("Each pays their own · nobody's booked yet");
  });

  it("a flight counts only the people on it, and nobody going is never complete", () => {
    const flight = { id: "f", kind: "flight" as const };
    expect(ownProgress(flight, people, [], []).complete).toBe(false);
    const p = ownProgress(flight, people, [{ item_id: "f", traveler_id: "mike", going: true }], [{ item_id: "f", traveler_id: "mike" }]);
    expect(bookedLabel(p)).toBe("Each pays their own · 1 of 1 booked");
    expect(p.complete).toBe(true);
  });
});

describe("who's in matches the bill (C47)", () => {
  const four = [{ id: "mike" }, { id: "julia" }, { id: "vic" }, { id: "sam" }];
  const bill = (itemId: string | null, ids: string[], own = false) =>
    ({ id: `e-${itemId}`, item_id: itemId, own, expense_shares: ids.map((id) => ({ traveler_id: id, amount_cents: 100, weight: null })) }) as unknown as Parameters<typeof peopleMatchingBills>[1][number];
  const dinner = { id: "dinner", kind: "meal" as const };

  it("a dinner split 3 ways with Sam left out shows Sam as out, though no row said so", () => {
    const rows = peopleMatchingBills([], [bill("dinner", ["mike", "julia", "vic"])], four);
    expect(goingList(dinner, four as never, rows).map((p) => p.id)).toEqual(["mike", "julia", "vic"]);
    expect(isGoing(dinner, "sam", rows)).toBe(false);
  });

  it("the bill wins over an older in or out row, both ways", () => {
    const before = [
      { item_id: "dinner", traveler_id: "sam", going: true },
      { item_id: "dinner", traveler_id: "vic", going: false },
    ];
    const rows = peopleMatchingBills(before, [bill("dinner", ["mike", "vic"])], four);
    expect(goingList(dinner, four as never, rows).map((p) => p.id)).toEqual(["mike", "vic"]);
  });

  it("leaves plans with no bill, own lines and general expenses alone", () => {
    const before = [{ item_id: "hike", traveler_id: "sam", going: false }];
    const rows = peopleMatchingBills(before, [bill(null, ["mike"]), bill("flight", ["mike"], true)], four);
    expect(rows).toEqual(before);
  });
});
