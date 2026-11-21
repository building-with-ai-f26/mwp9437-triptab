import { describe, expect, it } from "vitest";
import {
  atEstimate,
  costToCome,
  draftCents,
  draftProblems,
  mergePatch,
  noteTotalCents,
  notesFor,
  oneFare,
  possibleDuplicate,
  sharedFareLegs,
  toDraft,
  usdCost,
  type Proposal,
} from "./importPlans";
import type { Item } from "./model";

const trip = { start_date: "2027-02-05", end_date: "2027-02-16" };

const proposal = (over: Partial<Proposal>): Proposal => ({
  kind: "flight",
  title: "UA 57 Newark to Geneva",
  day: "2027-02-05",
  part: "evening",
  end_day: null,
  depart_time: null,
  arrive_time: null,
  times_from: null,
  source_url: null,
  location: null,
  confirmation_code: null,
  cost_cents: null,
  currency: null,
  cost_is_per_person: false,
  who_pays: "own",
  paid: false,
  unsure: [],
  ...over,
});

const item = (over: Partial<Item>): Item => ({
  id: "i1",
  trip_id: "t",
  kind: "flight",
  title: "UA57 EWR-GVA",
  day: "2027-02-05",
  part: "evening",
  end_day: null,
  location: null,
  notes: null,
  status: "planned",
  est_cents: null,
  cost_type: "total",
  pay_mode: "own",
  end_part: null,
  start_time: null,
  end_time: null,
  created_by: null,
  created_at: "",
  ...over,
});

describe("possible duplicates", () => {
  it("the same flight number on the same day, however it's written", () => {
    expect(possibleDuplicate(proposal({}), [item({})])?.id).toBe("i1");
    expect(possibleDuplicate(proposal({ title: "United ua 057" }), [item({})])?.id).toBe("i1");
  });
  it("not the same flight on another day, or another flight that day", () => {
    expect(possibleDuplicate(proposal({ day: "2027-02-06" }), [item({})])).toBeNull();
    expect(possibleDuplicate(proposal({ title: "UA 58 Geneva to Newark" }), [item({})])).toBeNull();
  });
  it("a stay with the same check-in and check-out", () => {
    const stay = item({ kind: "stay", title: "Chalet", day: "2027-02-05", end_day: "2027-02-12", part: "night" });
    expect(possibleDuplicate(proposal({ kind: "stay", title: "Chamonix Airbnb", end_day: "2027-02-12" }), [stay])?.title).toBe("Chalet");
    expect(possibleDuplicate(proposal({ kind: "stay", title: "Chamonix Airbnb", end_day: "2027-02-10" }), [stay])).toBeNull();
  });
  it("another kind of plan with the same name that day", () => {
    const dinner = item({ kind: "meal", title: "Fondue at La Caleche", day: "2027-02-06" });
    expect(possibleDuplicate(proposal({ kind: "meal", title: "fondue at la calèche", day: "2027-02-06" }), [dinner])).toBeNull(); // accents differ: not assumed the same
    expect(possibleDuplicate(proposal({ kind: "meal", title: "Fondue at La Caleche!", day: "2027-02-06" }), [dinner])?.id).toBe("i1");
  });
});

describe("a proposal becomes a draft to review", () => {
  it("a clean one is kept by default, with its cost and who pays", () => {
    const d = toDraft(proposal({ cost_cents: 61550, currency: "USD", paid: true, depart_time: "17:05", arrive_time: "07:10", times_from: "input", end_day: "2027-02-06", confirmation_code: "QK7RWD" }), trip, []);
    expect(d).toMatchObject({ keep: true, day: "2027-02-05", cost: "615.5", paid: true, payMode: "own", duplicateOf: null });
    expect(d.notes).toBe("Departs 17:05, arrives 07:10 on Sat, Feb 6\nConfirmation: QK7RWD");
    expect(d.warnings).toEqual([]);
  });
  it("a booking that matches a plan already on the trip starts ticked, to fill that plan in (C25)", () => {
    const d = toDraft(proposal({}), trip, [item({})]);
    expect(d.keep).toBe(true);
    expect(d.duplicateOf).toBe("UA57 EWR-GVA");
    expect(d.mergeInto?.id).toBe("i1");
  });
  it("a day outside the trip is left for the Owner to pick, and starts unticked", () => {
    const d = toDraft(proposal({ day: "2027-02-04" }), trip, []);
    expect(d.day).toBe("");
    expect(d.keep).toBe(false);
    // The day before the trip can be added to it in one tap (11/16); the review says so.
    expect(d.warnings[0]).toContain("Thu, Feb 4 is before the trip");
    expect(d.extendTo).toBe("2027-02-04");
    expect(draftProblems({ ...d, keep: true }, trip)).toContain("Pick a day inside the trip.");
  });
  it("a price in another currency is kept as found, for the review to convert at the day's rate (C28)", () => {
    const d = toDraft(proposal({ kind: "stay", title: "Chalet", end_day: "2027-02-12", cost_cents: 320000, currency: "EUR", paid: true, who_pays: "split" }), trip, []);
    expect(d.cost).toBe("");
    expect(d.paid).toBe(true);
    expect(d.foreign).toEqual({ currency: "EUR", cents: 320000 });
    expect(d.converted).toBeNull();
    expect(draftProblems(d, trip)).toEqual([]);
  });
  it("a price with no currency is kept but flagged, never assumed silently", () => {
    const d = toDraft(proposal({ cost_cents: 6400, currency: null, unsure: ["cost"] }), trip, []);
    expect(d.cost).toBe("64");
    expect(d.warnings.join(" ")).toContain("No currency was found for this price");
    expect(d.unsure).toContain("cost");
  });
  it("looked-up flight times are marked and carry their source", () => {
    const d = toDraft(proposal({ depart_time: "17:05", arrive_time: "07:10", times_from: "lookup", source_url: "https://example.com/ua57" }), trip, []);
    expect(d.notes).toContain("looked up, check against your booking: https://example.com/ua57");
    expect(d.warnings.join(" ")).toContain("Times were looked up");
  });
  it("a flight with no times says so instead of guessing", () => {
    expect(toDraft(proposal({}), trip, []).warnings).toContain("No times found. Add times in the notes once you have them.");
    expect(notesFor(proposal({}))).toBe("");
  });
  it("a stay with no check-out asks for one", () => {
    const d = toDraft(proposal({ kind: "stay", title: "Chalet", who_pays: "split" }), trip, []);
    expect(d.keep).toBe(false);
    expect(d.warnings).toContain("No check-out day found. Pick one.");
  });
  it("the part of the day comes from the departure time when the model gave none", () => {
    expect(toDraft(proposal({ part: null, depart_time: "06:40", times_from: "input" }), trip, []).part).toBe("morning");
    expect(toDraft(proposal({ part: null, depart_time: "22:15", times_from: "input" }), trip, []).part).toBe("night");
    expect(toDraft(proposal({ part: null }), trip, []).part).toBe("day");
  });
  it("fields the model wasn't sure of are carried through to be marked", () => {
    expect(toDraft(proposal({ unsure: ["day", "cost"] }), trip, []).unsure).toEqual(["day", "cost"]);
  });
});

describe("what stops a draft from being saved", () => {
  const ok = toDraft(proposal({ cost_cents: 42000, currency: "USD" }), trip, []);
  it("nothing, when it's complete", () => {
    expect(draftProblems(ok, trip)).toEqual([]);
    expect(draftCents(ok)).toBe(42000);
  });
  it("a missing name, or a cost that isn't a number", () => {
    expect(draftProblems({ ...ok, title: " " }, trip)).toContain("Give it a name.");
    expect(draftProblems({ ...ok, cost: "about 400" }, trip)).toContain("Type the cost as a number, like 420.");
    expect(draftCents({ cost: "$1,200.50" })).toBe(120050);
  });
  it("lets Paid with no amount through, the amount to come (C27)", () => {
    expect(draftProblems({ ...ok, cost: "", paid: true }, trip)).toEqual([]);
    expect(costToCome({ ...ok, cost: "", paid: true })).toBe(true);
    expect(costToCome({ ...ok, cost: "120", paid: true })).toBe(false);
    expect(costToCome({ ...ok, cost: "", paid: false })).toBe(false);
    // A leg whose fare is on another leg has nothing to come.
    expect(costToCome({ ...ok, cost: "", paid: true, fareOn: 0 })).toBe(false);
  });
});

describe("the cost of an import", () => {
  it("shows fractions of a cent, and cents from one cent up", () => {
    expect(usdCost(0.00069)).toBe("$0.0007");
    expect(usdCost(0.0316)).toBe("$0.03");
  });
});

describe("filling in a plan already on the trip (C25)", () => {
  const half = item({ start_time: null, end_time: null, location: null, notes: "Seat 12A", est_cents: null, status: "suggested" });
  it("adds only what the plan is missing, and keeps what's there", () => {
    const patch = mergePatch(half, {
      location: "Newark to Geneva",
      notes: "Seat 12A\nDeparts 17:05, arrives 07:10\nConfirmation: K7QX2P",
      start_time: "17:05",
      end_time: "07:10",
      end_day: "2027-02-06",
      end_part: "morning",
      est_cents: 99239,
      status: "planned",
    });
    expect(patch).toEqual({
      location: "Newark to Geneva",
      start_time: "17:05",
      end_time: "07:10",
      end_day: "2027-02-06",
      end_part: "morning",
      notes: "Seat 12A\nDeparts 17:05, arrives 07:10\nConfirmation: K7QX2P",
      est_cents: 99239,
      status: "planned",
    });
  });
  it("changes nothing that's already filled in, and never steps a status back", () => {
    const full = item({ start_time: "17:05", end_time: "07:10", location: "EWR", notes: "Departs 17:05", est_cents: 50000, status: "confirmed" });
    expect(mergePatch(full, { location: "Newark", notes: "Departs 17:05", start_time: "18:00", end_time: null, end_day: null, est_cents: 99239, status: "planned" })).toEqual({});
  });
});

describe("a round trip's one fare (C26: two plans and one expense)", () => {
  const leg = (title: string, day: string) => toDraft(proposal({ title, day, cost_cents: null, paid: true }), trip, []);
  it("finds legs with no cost of their own, in trip order", () => {
    const drafts = [leg("UA 58 Geneva to Newark", "2027-02-16"), leg("UA 57 Newark to Geneva", "2027-02-05")];
    expect(sharedFareLegs(drafts)).toEqual([1, 0]);
    expect(sharedFareLegs([drafts[0]])).toEqual([]);
  });
  it("puts the whole fare on the first leg; the other's fare is on it", () => {
    const drafts = [leg("UA 58 Geneva to Newark", "2027-02-16"), leg("UA 57 Newark to Geneva", "2027-02-05")];
    const out = oneFare(drafts, sharedFareLegs(drafts), 99239);
    expect(out[1].cost).toBe("992.39");
    expect(out[1].notes).toContain("One fare for the round trip, with UA 58 Geneva to Newark.");
    expect(out[0].cost).toBe("");
    expect(out[0].fareOn).toBe(1);
    expect(sharedFareLegs(out)).toEqual([]);
  });
  it("reads the one total an import's note names", () => {
    expect(noteTotalCents("Two United flights; the $992.39 total covers both flights, so I left cost blank on each.")).toBe(99239);
    expect(noteTotalCents("Total $1,984.78 for two travelers")).toBe(198478);
    expect(noteTotalCents("$120 deposit, $480 balance")).toBeNull();
    expect(noteTotalCents(null)).toBeNull();
  });
});

describe("a foreign price's estimate (C28)", () => {
  const d = { foreign: { currency: "EUR", cents: 694750 }, converted: { rate: 1.099, date: "2026-11-20" }, cost: "7635.30" };
  it("is pending while the cost is the converted estimate", () => {
    expect(atEstimate(d)).toBe(true);
  });
  it("isn't once the real charge is typed over it, or with no rate", () => {
    expect(atEstimate({ ...d, cost: "7702.18" })).toBe(false);
    expect(atEstimate({ ...d, converted: null })).toBe(false);
    expect(atEstimate({ ...d, foreign: null })).toBe(false);
  });
});
