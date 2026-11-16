/**
 * Who pays (11/16), checked against the real database: on an "everyone pays their own" plan each
 * person logs their own line. Everyone on the trip sees who has booked; a price is readable only
 * by that person and by whoever entered it; the plan's status follows the lines; and own lines
 * never move a balance. Run: npm run test:rls (needs app/.env.local).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signedIn } from "./test/live";
import { settle } from "./lib/ledger";
import type { ExpenseRow } from "./lib/api";
import type { Traveler } from "./lib/model";

let owner: SupabaseClient; // Mike, an owner
let vic: SupabaseClient; // a viewer
let sam: SupabaseClient; // another viewer
let stranger: SupabaseClient;
let tripId: string;
const ids: Record<string, string> = {}; // Mike, Vic, Sam, Priya (added by name, never signed in)
let flight: string;
let lift: string;
let fondue: string;

const log = (c: SupabaseClient, item: string, who: string, cents: number, points = false) =>
  c.rpc("log_own_line", { p_item: item, p_traveler: ids[who], p_cents: cents, p_with_points: points });
const clear = (c: SupabaseClient, item: string, who: string) => c.rpc("clear_own_line", { p_item: item, p_traveler: ids[who] });
/** The own line of `who` on `item`, as `c` is allowed to read it (null when the database hides it). */
const line = async (c: SupabaseClient, item: string, who: string) => {
  const { data } = await c
    .from("expenses")
    .select("id, total_cents, with_points, own, expense_shares(traveler_id, amount_cents)")
    .eq("item_id", item)
    .eq("paid_by", ids[who])
    .maybeSingle();
  return data;
};
const marks = async (c: SupabaseClient, item: string) => {
  const { data } = await c.rpc("own_marks", { p_trip: tripId });
  return ((data as { item_id: string; traveler_id: string }[] | null) ?? [])
    .filter((m) => m.item_id === item)
    .map((m) => Object.keys(ids).find((n) => ids[n] === m.traveler_id))
    .sort();
};
const status = async (item: string) => (await owner.from("items").select("status, pay_mode").eq("id", item).single()).data!;

beforeAll(async () => {
  [owner, vic, sam, stranger] = await Promise.all([
    signedIn("w-owner", "Mike"),
    signedIn("w-vic", "Vic"),
    signedIn("w-sam", "Sam"),
    signedIn("w-stranger", "Stan"),
  ]);
  const { data } = await owner.rpc("create_trip", {
    p_name: "RLS test: who pays",
    p_stops: [{ name: "Chamonix", start_date: "2027-02-05", end_date: "2027-02-08" }],
    p_my_name: "Mike",
  });
  tripId = data as string;
  await owner.from("travelers").insert([
    { trip_id: tripId, name: "Vic", role: "viewer" },
    { trip_id: tripId, name: "Sam", role: "viewer" },
    { trip_id: tripId, name: "Priya", role: "owner" },
  ]);
  const { data: people } = await owner.from("travelers").select("id, name").eq("trip_id", tripId);
  for (const p of people ?? []) ids[p.name] = p.id;
  const { data: link } = await owner.from("trip_links").select("token").eq("trip_id", tripId).single();
  await vic.rpc("join_trip", { p_token: link!.token, p_traveler_id: ids.Vic });
  await sam.rpc("join_trip", { p_token: link!.token, p_traveler_id: ids.Sam });

  const { data: items, error } = await owner
    .from("items")
    .insert([
      { trip_id: tripId, kind: "flight", title: "UA 57 to Geneva", day: "2027-02-05", part: "morning", status: "planned" },
      { trip_id: tripId, kind: "activity", title: "Lift passes", day: "2027-02-06", part: "morning", status: "suggested", pay_mode: "own" },
      { trip_id: tripId, kind: "meal", title: "Fondue", day: "2027-02-06", part: "evening", status: "planned" },
    ])
    .select("id, title");
  expect(error).toBeNull();
  flight = items!.find((i) => i.title.startsWith("UA"))!.id;
  lift = items!.find((i) => i.title === "Lift passes")!.id;
  fondue = items!.find((i) => i.title === "Fondue")!.id;
});

afterAll(async () => {
  await owner.from("trips").delete().eq("id", tripId);
});

describe("who pays, by default", () => {
  it("a flight is everyone pays their own; a meal is one bill", async () => {
    expect((await status(flight)).pay_mode).toBe("own");
    expect((await status(fondue)).pay_mode).toBe("split");
  });
});

describe("logging your own line", () => {
  it("a viewer logs their own, and the plan moves from Suggested to Planned", async () => {
    const { data, error } = await log(vic, lift, "Vic", 8000);
    expect(error).toBeNull();
    expect(data).toBe("planned");
    expect((await status(lift)).status).toBe("planned");
  });

  it("you read your own price back, as a cost whose payer is its only share", async () => {
    const mine = await line(vic, lift, "Vic");
    expect(mine).toMatchObject({ total_cents: 8000, own: true, with_points: false });
    expect(mine!.expense_shares).toEqual([{ traveler_id: ids.Vic, amount_cents: 8000 }]);
  });

  it("nobody else reads that price: not an owner, not another traveler, not a stranger", async () => {
    expect(await line(owner, lift, "Vic")).toBeNull();
    expect(await line(sam, lift, "Vic")).toBeNull();
    expect(await line(stranger, lift, "Vic")).toBeNull();
    // Not through the shares either.
    const mine = await line(vic, lift, "Vic");
    for (const c of [owner, sam, stranger]) {
      const { data } = await c.from("expense_shares").select("amount_cents").eq("expense_id", mine!.id);
      expect(data).toEqual([]);
    }
  });

  it("everyone on the trip sees who has booked; a stranger sees nothing", async () => {
    expect(await marks(owner, lift)).toEqual(["Vic"]);
    expect(await marks(sam, lift)).toEqual(["Vic"]);
    expect(await marks(vic, lift)).toEqual(["Vic"]);
    expect(await marks(stranger, lift)).toEqual([]);
  });

  it("another traveler can't log or clear your line", async () => {
    const a = await log(sam, lift, "Vic", 1);
    expect(a.error?.message).toContain("You can log your own cost");
    const b = await clear(sam, lift, "Vic");
    expect(b.error?.message).toContain("only they can change it");
    expect((await line(vic, lift, "Vic"))!.total_cents).toBe(8000);
  });

  it("a stranger can't log on the trip, even for someone on it", async () => {
    const { error } = await log(stranger, lift, "Vic", 1);
    expect(error?.message).toContain("That plan is gone");
  });

  it("nobody writes an own line straight into the table", async () => {
    for (const c of [owner, vic]) {
      const { error } = await c.from("expenses").insert({
        trip_id: tripId, item_id: lift, description: "sneaky", total_cents: 1, paid_by: ids.Sam, own: true,
      });
      expect(error).not.toBeNull();
    }
    expect(await marks(owner, lift)).toEqual(["Vic"]);
  });
});

describe("an owner logs for someone else", () => {
  it("an owner can log anyone's, and reads back what they entered", async () => {
    const { error } = await log(owner, lift, "Priya", 9000);
    expect(error).toBeNull();
    expect((await line(owner, lift, "Priya"))!.total_cents).toBe(9000);
    expect(await line(vic, lift, "Priya")).toBeNull();
    expect(await marks(sam, lift)).toEqual(["Priya", "Vic"]);
  });

  it("the person reads the line an owner entered for them", async () => {
    expect((await log(owner, lift, "Sam", 7000)).error).toBeNull();
    expect((await line(sam, lift, "Sam"))!.total_cents).toBe(7000);
    expect((await line(owner, lift, "Sam"))!.total_cents).toBe(7000);
  });

  it("once the person changes it themselves, the owner no longer reads it and can't change it", async () => {
    expect((await log(sam, lift, "Sam", 7550)).error).toBeNull();
    expect(await line(owner, lift, "Sam")).toBeNull();
    const again = await log(owner, lift, "Sam", 1);
    expect(again.error?.message).toContain("only they can change it");
    expect((await clear(owner, lift, "Sam")).error?.message).toContain("only they can change it");
    expect((await line(sam, lift, "Sam"))!.total_cents).toBe(7550);
  });

  it("an owner can't overwrite a line the person logged themselves", async () => {
    const { error } = await log(owner, lift, "Vic", 1);
    expect(error?.message).toContain("only they can change it");
  });
});

describe("status follows the lines", () => {
  it("is Planned until everyone going has logged theirs, then Confirmed", async () => {
    expect((await status(lift)).status).toBe("planned"); // 3 of 4: Mike hasn't
    const { data } = await log(owner, lift, "Mike", 8000);
    expect(data).toBe("confirmed");
    expect((await status(lift)).status).toBe("confirmed");
  });

  it("can't be set by hand in either direction", async () => {
    const down = await owner.from("items").update({ status: "planned" }).eq("id", lift).select("id");
    expect(down.error?.message).toContain("stays confirmed until a line is cleared");
    const up = await owner.from("items").update({ status: "confirmed" }).eq("id", flight).select("id");
    expect(up.error?.message).toContain("confirmed once everyone going has logged");
  });

  it("clearing a line takes it back to Planned", async () => {
    const { data, error } = await clear(owner, lift, "Mike");
    expect(error).toBeNull();
    expect(data).toBe("planned");
  });

  it("opting out removes that person from the count; opting back in adds them again", async () => {
    await owner.from("item_people").upsert({ item_id: lift, traveler_id: ids.Mike, going: false });
    expect((await status(lift)).status).toBe("confirmed"); // 3 of 3
    await owner.from("item_people").upsert({ item_id: lift, traveler_id: ids.Mike, going: true });
    expect((await status(lift)).status).toBe("planned"); // 3 of 4
  });

  it("someone added to the trip later counts too", async () => {
    await owner.from("item_people").upsert({ item_id: lift, traveler_id: ids.Mike, going: false });
    expect((await status(lift)).status).toBe("confirmed");
    const { data: jo } = await owner.from("travelers").insert({ trip_id: tripId, name: "Jo", role: "viewer" }).select("id").single();
    expect((await status(lift)).status).toBe("planned"); // Jo is going and hasn't booked
    await owner.from("travelers").delete().eq("id", jo!.id);
    expect((await status(lift)).status).toBe("confirmed");
  });
});

describe("paid with points", () => {
  it("is a mark on your own line with an optional cash value; logging means you're on the flight", async () => {
    const { data, error } = await log(vic, flight, "Vic", 0, true);
    expect(error).toBeNull();
    expect(data).toBe("confirmed"); // flights count only the people on them: Vic, 1 of 1
    expect(await line(vic, flight, "Vic")).toMatchObject({ total_cents: 0, with_points: true });
    const { data: going } = await vic.from("item_people").select("going").eq("item_id", flight).eq("traveler_id", ids.Vic).single();
    expect(going!.going).toBe(true);
    expect((await log(vic, flight, "Vic", 5600, true)).error).toBeNull(); // taxes paid in cash
    expect((await line(vic, flight, "Vic"))!.total_cents).toBe(5600);
  });
});

describe("switching who pays", () => {
  it("is refused while anything is logged against the plan", async () => {
    const { error } = await owner.from("items").update({ pay_mode: "split" }).eq("id", lift).select("id");
    expect(error?.message).toContain("Clear what's logged");
  });

  it("is one update for an owner while nothing is logged, and not open to a viewer", async () => {
    const asViewer = await vic.from("items").update({ pay_mode: "own" }).eq("id", fondue).select("id");
    expect(asViewer.data ?? []).toEqual([]);
    expect((await status(fondue)).pay_mode).toBe("split");
    const there = await owner.from("items").update({ pay_mode: "own" }).eq("id", fondue).select("id");
    expect(there.data).toHaveLength(1);
    const back = await owner.from("items").update({ pay_mode: "split" }).eq("id", fondue).select("id");
    expect(back.data).toHaveLength(1);
  });

  it("one bill and own lines don't mix on a plan", async () => {
    const shares = [{ traveler_id: ids.Mike, amount_cents: 100 }];
    const bill = await owner.rpc("confirm_item", { p_item: lift, p_total_cents: 100, p_paid_by: ids.Mike, p_split_mode: "even", p_shares: shares });
    expect(bill.error?.message).toContain("People have logged their own costs");
    const own = await log(owner, fondue, "Mike", 100);
    expect(own.error?.message).toContain("one bill, split");
    const undo = await owner.rpc("unconfirm_item", { p_item: lift });
    expect(undo.error?.message).toContain("each person clears their own line");
  });

  it("confirming an own-pay plan with one cost makes it one bill when nothing was logged (the app that's already live)", async () => {
    const { data: f2 } = await owner
      .from("items")
      .insert({ trip_id: tripId, kind: "flight", title: "Return flight", day: "2027-02-08", part: "day", status: "planned" })
      .select("id")
      .single();
    expect((await status(f2!.id)).pay_mode).toBe("own");
    const shares = [{ traveler_id: ids.Mike, amount_cents: 30000 }];
    const { error } = await owner.rpc("confirm_item", { p_item: f2!.id, p_total_cents: 30000, p_paid_by: ids.Mike, p_split_mode: "even", p_shares: shares });
    expect(error).toBeNull();
    expect(await status(f2!.id)).toEqual({ status: "confirmed", pay_mode: "split" });
    expect((await owner.rpc("unconfirm_item", { p_item: f2!.id })).error).toBeNull();
    await owner.from("items").delete().eq("id", f2!.id);
  });
});

describe("own lines and the tab", () => {
  it("never move a balance or add a payment, from anyone's view", async () => {
    const split = [
      { traveler_id: ids.Mike, amount_cents: 3000 },
      { traveler_id: ids.Vic, amount_cents: 3000 },
      { traveler_id: ids.Sam, amount_cents: 3000 },
      { traveler_id: ids.Priya, amount_cents: 3000 },
    ];
    const bill = await owner.rpc("confirm_item", { p_item: fondue, p_total_cents: 12000, p_paid_by: ids.Mike, p_split_mode: "even", p_shares: split });
    expect(bill.error).toBeNull();
    const travelers = Object.entries(ids).map(([name, id]) => ({ id, name })) as unknown as Traveler[];
    const expected = { [ids.Mike]: 9000, [ids.Vic]: -3000, [ids.Sam]: -3000, [ids.Priya]: -3000 };
    for (const c of [owner, vic, sam]) {
      const { data } = await c
        .from("expenses")
        .select("*, expense_shares(traveler_id, amount_cents, weight)")
        .eq("trip_id", tripId);
      const rows = data as ExpenseRow[];
      const result = settle(rows, travelers);
      expect(result.balances).toEqual(expected);
      expect(result.transfers).toHaveLength(3);
      expect(result).toEqual(settle(rows.filter((e) => !e.own), travelers));
    }
    // Each view holds different own lines: Vic sees two of his own, the owner the one he entered.
    const vicsOwn = await vic.from("expenses").select("id").eq("trip_id", tripId).eq("own", true);
    expect(vicsOwn.data).toHaveLength(2);
    const ownersOwn = await owner.from("expenses").select("id").eq("trip_id", tripId).eq("own", true);
    expect(ownersOwn.data).toHaveLength(1); // Priya's, which he entered
  });

  it("an owner can still delete the whole trip, own lines and all", async () => {
    const { data } = await owner.from("trips").delete().eq("id", tripId).select("id");
    expect(data).toHaveLength(1);
    const { data: left } = await vic.rpc("own_marks", { p_trip: tripId });
    expect(left ?? []).toEqual([]);
  });
});
