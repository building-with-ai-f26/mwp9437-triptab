import { useState } from "react";
import { Check, List as ListIcon, Luggage, Plus, Scale, Undo2 } from "lucide-react";
import { Button, DarkField, Dialog, Segmented } from "../ui";
import type { ExpenseRow, ItemPerson, Payment, ShareInput } from "../../lib/api";
import { KIND_ICON } from "./Timeline";
import { goingList, groupExpenses, isGoing, myNumbers } from "../../lib/ledger";
import { clock, dollars, longDay, tripDays, type CostType, type Item, type Traveler, type Trip } from "../../lib/model";
import { parseDollars, toCents, totalCents } from "../../lib/money";
import { computeSplit, SPLIT_LABEL, type SplitMode } from "../../lib/split";
import { foreignLabel, toUsdCents } from "../../lib/rates";
import { CurrencySelect, useUsdRate } from "./Currency";

export type ExpenseTarget = { kind: "item"; item: Item; expense?: ExpenseRow } | { kind: "general"; expense?: ExpenseRow };

export interface ExpenseSubmit {
  description: string;
  day: string | null;
  total: number;
  paidBy: string;
  mode: SplitMode;
  shares: ShareInput[];
  /** Typed in another currency (C33): the amount as written; total is then dollars at the day's rate. */
  foreign: { currency: string; cents: number } | null;
}

const MODES: SplitMode[] = ["even", "shares", "percent", "exact"];

/**
 * Confirm a plan with its real cost, who paid and who's in, or add a general expense. The split
 * is even by default, or by shares, percent or exact amounts (vision, principle 3).
 */
export function ExpenseDialog({
  target,
  trip,
  travelers,
  itemPeople,
  meId,
  onClose,
  onSubmit,
  onUndo,
  onDelete,
}: {
  target: ExpenseTarget | null;
  trip: Trip;
  travelers: Traveler[];
  itemPeople: ItemPerson[];
  meId: string | null;
  onClose: () => void;
  onSubmit: (t: ExpenseTarget, input: ExpenseSubmit) => Promise<void>;
  onUndo: (item: Item) => Promise<void>;
  onDelete: (expense: ExpenseRow) => Promise<void>;
}) {
  const title = !target
    ? ""
    : target.kind === "item"
      ? target.expense
        ? `Edit cost: ${target.item.title}`
        : `Confirm: ${target.item.title}`
      : target.expense
        ? "Edit expense"
        : "Add an expense";
  return (
    <Dialog open={target !== null} onClose={onClose} title={title}>
      {target && (
        <ExpenseForm
          key={target.kind === "item" ? target.item.id : (target.expense?.id ?? "new")}
          {...{ target, trip, travelers, itemPeople, meId, onClose, onSubmit, onUndo, onDelete }}
        />
      )}
    </Dialog>
  );
}

function ExpenseForm({
  target,
  trip,
  travelers,
  itemPeople,
  meId,
  onClose,
  onSubmit,
  onUndo,
  onDelete,
}: {
  target: ExpenseTarget;
  trip: Trip;
  travelers: Traveler[];
  itemPeople: ItemPerson[];
  meId: string | null;
  onClose: () => void;
  onSubmit: (t: ExpenseTarget, input: ExpenseSubmit) => Promise<void>;
  onUndo: (item: Item) => Promise<void>;
  onDelete: (expense: ExpenseRow) => Promise<void>;
}) {
  const ex = target.expense;
  const item = target.kind === "item" ? target.item : null;
  const startIn = ex
    ? ex.expense_shares.map((s) => s.traveler_id)
    : item
      ? goingList(item, travelers, itemPeople).map((t) => t.id)
      : travelers.map((t) => t.id);
  const startValues = Object.fromEntries(
    travelers.map((t) => {
      const s = ex?.expense_shares.find((x) => x.traveler_id === t.id);
      if (ex?.split_mode === "exact" && s) return [t.id, String(s.amount_cents / 100)];
      if (s?.weight != null) return [t.id, String(s.weight)];
      return [t.id, ""];
    }),
  );

  const [description, setDescription] = useState(ex?.description ?? "");
  const [day, setDay] = useState<string>(ex?.day ?? item?.day ?? "");
  const [amount, setAmount] = useState(
    ex?.currency && ex.foreign_cents != null
      ? String(ex.foreign_cents / 100)
      : ex
        ? String(ex.total_cents / 100)
        : item?.est_cents
          ? String(item.est_cents / 100)
          : "",
  );
  const [currency, setCurrency] = useState(ex?.currency ?? "USD");
  const rate = useUsdRate(currency);
  const [costType, setCostType] = useState<CostType>(ex ? "total" : (item?.cost_type ?? "total"));
  const [paidBy, setPaidBy] = useState(ex?.paid_by ?? meId ?? travelers[0]?.id ?? "");
  const [inIds, setInIds] = useState<string[]>(startIn);
  const [mode, setMode] = useState<SplitMode>(ex?.split_mode ?? "even");
  const [values, setValues] = useState<Record<string, string>>(startValues);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const people = travelers.filter((t) => inIds.includes(t.id)).map((t) => t.id);
  const typed = parseDollars(amount);
  const typedTotal = Number.isNaN(typed) || typed < 0 ? NaN : totalCents(typed, costType, people.length);
  // Another currency (C33): the split works in dollars at today's rate. An expense saved before in
  // the same currency and amount keeps the dollars it had, so editing it doesn't move the rate.
  const foreign = currency !== "USD" && !Number.isNaN(typedTotal) ? { currency, cents: typedTotal } : null;
  const keptRate = Boolean(foreign && ex?.currency === foreign.currency && ex.foreign_cents === foreign.cents);
  const total = !foreign ? typedTotal : keptRate ? ex!.total_cents : rate ? toUsdCents(foreign.cents, rate.rate) : NaN;
  const numeric = Object.fromEntries(
    people.map((id) => {
      const v = parseDollars(values[id] ?? "");
      if (mode === "exact") return [id, Number.isNaN(v) ? 0 : toCents(v)];
      if (mode === "shares") return [id, Number.isNaN(v) ? 1 : v];
      if (mode === "percent") return [id, Number.isNaN(v) ? 100 / Math.max(people.length, 1) : v];
      return [id, 0];
    }),
  );
  const split = Number.isNaN(total)
    ? { shares: {} as Record<string, number>, error: "Enter the cost, like 120 or $120." }
    : computeSplit({ mode, total, people, values: numeric });
  const descriptionMissing = target.kind === "general" && !description.trim();
  const rateProblem =
    foreign && !keptRate && rate === null ? `Couldn't get today's rate for ${currency}. Type the amount in USD for now.` : null;
  const problem = descriptionMissing ? "Say what it was for." : !paidBy ? "Pick who paid." : (rateProblem ?? split.error);

  const toggle = (id: string) => setInIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const submit = async () => {
    setTried(true);
    if (problem) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(target, {
        description: item ? item.title : description,
        day: day || null,
        total,
        paidBy,
        mode,
        shares: people.map((id) => ({
          traveler_id: id,
          amount_cents: split.shares[id] ?? 0,
          weight: mode === "shares" || mode === "percent" ? numeric[id] : null,
        })),
        foreign,
      });
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const name = (id: string) => travelers.find((t) => t.id === id)?.name ?? "?";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {item ? (
        <p className="mb-4 text-sm text-white/70">
          {ex ? "Change what it cost, who paid or who's in." : "Confirmed means paid: this logs the cost on the tab in the same step."}
          {item.est_cents != null && !ex && ` Estimated ${dollars(item.est_cents)}${item.cost_type === "per_person" ? " per person" : ""}.`}
        </p>
      ) : (
        <>
          <DarkField label="What for">
            <input
              className="field-dark"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Groceries for the chalet"
              autoFocus={!ex}
            />
          </DarkField>
          <DarkField label="Day (optional)">
            <select className="field-dark" value={day} onChange={(e) => setDay(e.target.value)}>
              <option value="">No particular day</option>
              {tripDays(trip.start_date, trip.end_date).map((d) => (
                <option key={d} value={d}>
                  {longDay(d)}
                </option>
              ))}
            </select>
          </DarkField>
        </>
      )}

      <div className="grid grid-cols-[1fr_auto] items-end gap-2">
        <DarkField label={item ? "What it cost" : "Amount"}>
          <span className="flex gap-2">
            <input
              className="field-dark min-w-0 flex-1"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={currency === "USD" ? "$" : currency}
              autoFocus={Boolean(item)}
              aria-label={item ? "What it cost" : "Amount"}
            />
            <CurrencySelect value={currency} onChange={setCurrency} />
          </span>
          {foreign && (
            <span className="mt-1 block text-xs text-white/70" data-testid="fx-about">
              {keptRate
                ? `${foreignLabel(foreign.currency, foreign.cents)}, ${dollars(ex!.total_cents)} in the split, as saved.`
                : rate
                  ? `${foreignLabel(foreign.currency, foreign.cents)} is about ${dollars(total)} at today's rate (${rate.rate} from the European Central Bank). It's an estimate until whoever paid enters what their card charged.`
                  : rate === undefined
                    ? "Looking up today's rate..."
                    : null}
            </span>
          )}
        </DarkField>
        {item && (
          <div className="mb-3">
            <Segmented
              label="Priced as"
              value={costType}
              onChange={setCostType}
              options={[
                { value: "total", label: "Total" },
                { value: "per_person", label: "Per person" },
              ]}
            />
          </div>
        )}
      </div>

      <DarkField label="Paid by">
        <select className="field-dark" value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
          {travelers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {t.id === meId ? " (you)" : ""}
            </option>
          ))}
        </select>
      </DarkField>

      <DarkField label="Split" group>
        <Segmented label="Split" value={mode} onChange={setMode} options={MODES.map((m) => ({ value: m, label: SPLIT_LABEL[m] }))} />
      </DarkField>

      <fieldset className="mb-3">
        <legend className="label-luxury mb-1.5 text-white/80">Who's in</legend>
        <ul className="divide-y divide-white/10 rounded-2xl border border-white/10">
          {travelers.map((t) => {
            const on = inIds.includes(t.id);
            return (
              <li key={t.id} className="flex min-h-12 items-center gap-3 px-3 py-1.5">
                <label className="flex min-w-0 flex-1 items-center gap-2.5 text-sm text-white">
                  <input type="checkbox" className="size-5 accent-[#8c7054]" checked={on} onChange={() => toggle(t.id)} />
                  <span className="truncate">
                    {t.name}
                    {t.id === meId ? " (you)" : ""}
                  </span>
                </label>
                {on && mode !== "even" && (
                  <input
                    className="field-dark !min-h-9 w-20 !px-2 text-right text-sm"
                    inputMode="decimal"
                    aria-label={`${t.name}'s ${mode === "exact" ? "amount" : mode === "percent" ? "percent" : "shares"}`}
                    placeholder={mode === "shares" ? "1" : mode === "percent" ? "%" : "$"}
                    value={values[t.id] ?? ""}
                    onChange={(e) => setValues({ ...values, [t.id]: e.target.value })}
                  />
                )}
                {on && (
                  <span className="w-16 shrink-0 text-right text-sm tabular-nums text-white/80">
                    {split.shares[t.id] != null ? dollars(split.shares[t.id]) : ""}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </fieldset>

      <p className={`mb-3 rounded-xl px-3 py-2 text-sm ${problem && tried ? "bg-red-500/15 text-red-200" : "bg-white/5 text-white/75"}`} role={problem && tried ? "alert" : undefined}>
        {problem
          ? problem
          : `Logs ${dollars(total)}, paid by ${name(paidBy)}, split ${people.length} ${people.length === 1 ? "way" : "ways"} (${SPLIT_LABEL[mode].toLowerCase()}).`}
      </p>
      {error && (
        <p role="alert" className="mb-3 rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        {ex ? (
          <Button
            type="button"
            variant="light"
            size="sm"
            className="text-red-200"
            disabled={busy}
            onClick={async () => {
              const ask = item ? `Undo the confirmation? The ${dollars(ex.total_cents)} comes off the tab and the plan goes back to Planned.` : `Delete "${ex.description}" from the tab?`;
              if (!window.confirm(ask)) return;
              setBusy(true);
              try {
                if (item) await onUndo(item);
                else await onDelete(ex);
                onClose();
              } catch (e) {
                setError((e as Error).message);
                setBusy(false);
              }
            }}
          >
            <Undo2 /> {item ? "Undo confirmation" : "Delete"}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button type="button" variant="light" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            <Check /> {busy ? "Saving..." : item ? (ex ? "Save" : "Confirm and log") : "Add to the tab"}
          </Button>
        </div>
      </div>
    </form>
  );
}

/**
 * The Money summary: your balance first, then the group's, then Settle up (spring ExpensesPanel).
 * Every line behind it is in MoneyList; on desktop "Every cost and payment" opens that list in the
 * main column (Mike's 11/19 review: the summary stays a summary).
 */
export function MoneyCard({
  travelers,
  expenses,
  balances,
  meId,
  canEdit,
  payments,
  lineCount,
  showingAll,
  onShowAll,
  onAdd,
  onSettle,
  onSettleFx,
}: {
  travelers: Traveler[];
  expenses: ExpenseRow[];
  balances: Record<string, number>;
  meId: string | null;
  canEdit: boolean;
  /** Null on a database without payments yet. */
  payments: Payment[] | null;
  /** How many lines the full list has. */
  lineCount: number;
  /** Desktop only: the full list is open in the main column. */
  showingAll?: boolean;
  /** Desktop only: open or close the full list. Left out on a phone, where the list sits below. */
  onShowAll?: () => void;
  onAdd: () => void;
  onSettle: () => void;
  /** C33: what the card charged for a pending foreign cost (dollars), or null to keep the estimate. */
  onSettleFx?: (expense: ExpenseRow, totalCents: number | null) => Promise<void>;
}) {
  const mine = myNumbers(expenses, meId, payments ?? []);
  const pendingFx = expenses.filter((e) => e.fx_pending && !e.own && e.currency && e.foreign_cents != null);
  const anyMoney = groupExpenses(expenses).length > 0 || (payments?.length ?? 0) > 0;

  return (
    <section className="glass-card-solid rounded-2xl p-4" aria-labelledby="money-title">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="money-title" className="font-display text-lg font-bold">
          Money
        </h2>
        {canEdit && (
          <Button size="sm" variant="glass" onClick={onAdd}>
            <Plus /> Expense
          </Button>
        )}
      </div>

      <div className="mb-3 rounded-2xl bg-white/35 p-3">
        <p className="label-luxury text-muted-foreground">Your balance</p>
        <p
          className={`font-display text-2xl font-bold ${mine.balance > 0 ? "text-green-800" : mine.balance < 0 ? "text-destructive" : ""}`}
        >
          {mine.balance > 0 ? `You're owed ${dollars(mine.balance)}` : mine.balance < 0 ? `You owe ${dollars(-mine.balance)}` : "You're even"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Trip spend {dollars(mine.tripTotal)} · your share {dollars(mine.share)} · you paid {dollars(mine.paid)}
        </p>
        {mine.own > 0 && (
          <p className="mt-1 text-xs text-muted-foreground" data-testid="own-spend">
            Includes {dollars(mine.own)} you paid on your own (flights and the like). Own costs are never split and never in Settle up.
          </p>
        )}
      </div>

      {anyMoney ? (
        <ul className="mb-3 space-y-1 text-sm">
          {travelers.map((t) => {
            const b = balances[t.id] ?? 0;
            return (
              <li key={t.id} className="flex items-center justify-between gap-2">
                <span className="truncate">
                  {t.name}
                  {t.id === meId ? " (you)" : ""}
                </span>
                <span className={`tabular-nums ${b > 0 ? "text-green-800" : b < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                  {b > 0 ? `is owed ${dollars(b)}` : b < 0 ? `owes ${dollars(-b)}` : "even"}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mb-3 text-sm text-muted-foreground">Nothing on the tab yet. Confirm a plan with its cost, or add an expense.</p>
      )}

      {pendingFx.length > 0 && (
        <FxPending
          expenses={pendingFx}
          travelers={travelers}
          meId={meId}
          canEdit={canEdit}
          onSettleFx={onSettleFx}
        />
      )}

      <div className="flex flex-col gap-2">
        {onShowAll && lineCount > 0 && (
          <Button variant="glass" className="w-full" onClick={onShowAll} aria-pressed={showingAll}>
            <ListIcon /> {showingAll ? "Back to the itinerary" : `Every cost and payment (${lineCount})`}
          </Button>
        )}
        <Button className="w-full" onClick={onSettle} disabled={!anyMoney}>
          <Scale /> Settle up
        </Button>
      </div>
    </section>
  );
}

/**
 * Costs in another currency still at the day's estimate (C33, Mike's call 11/21), shown above Settle
 * up: whoever paid enters what their card charged (everyone's part scales to it) or keeps the
 * estimate. Settle up works with the estimate until then.
 */
function FxPending({
  expenses,
  travelers,
  meId,
  canEdit,
  onSettleFx,
}: {
  expenses: ExpenseRow[];
  travelers: Traveler[];
  meId: string | null;
  canEdit: boolean;
  onSettleFx?: (expense: ExpenseRow, totalCents: number | null) => Promise<void>;
}) {
  const [charge, setCharge] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const name = (id: string) => (id === meId ? "you" : (travelers.find((t) => t.id === id)?.name ?? "whoever paid"));
  const act = async (e: ExpenseRow, cents: number | null) => {
    if (!onSettleFx) return;
    setBusy(e.id);
    setError(null);
    try {
      await onSettleFx(e, cents);
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(null);
  };
  return (
    <section className="mb-3 rounded-2xl bg-amber-100/70 p-3 text-sm" aria-labelledby="fx-title" data-testid="fx-pending">
      <h3 id="fx-title" className="font-semibold text-foreground">
        {expenses.length === 1 ? "A cost is still an estimate" : `${expenses.length} costs are still estimates`}
      </h3>
      <ul className="mt-1 space-y-2">
        {expenses.map((e) => {
          const mayAct = Boolean(onSettleFx) && (canEdit || e.paid_by === meId);
          const typed = parseDollars(charge[e.id] ?? "");
          const ok = !Number.isNaN(typed) && typed >= 0 && (charge[e.id] ?? "").trim() !== "";
          return (
            <li key={e.id} data-testid="fx-item">
              <p className="text-foreground">
                <b>{e.description}</b>: {foreignLabel(e.currency!, e.foreign_cents!)}, about {dollars(e.total_cents)} at the day's rate.{" "}
                {e.paid_by === meId ? "Enter what your card charged" : `Waiting for ${name(e.paid_by)} to enter what their card charged`}, or keep
                the estimate.
              </p>
              {mayAct && (
                <form
                  className="mt-1.5 flex flex-wrap items-center gap-2"
                  onSubmit={(ev) => {
                    ev.preventDefault();
                    if (ok) act(e, toCents(typed));
                  }}
                >
                  <input
                    className="field w-32"
                    inputMode="decimal"
                    placeholder="$ charged"
                    aria-label={`What the card charged for ${e.description}`}
                    value={charge[e.id] ?? ""}
                    onChange={(ev) => setCharge((c) => ({ ...c, [e.id]: ev.target.value }))}
                  />
                  <Button size="sm" type="submit" disabled={busy != null || !ok}>
                    Save
                  </Button>
                  <Button size="sm" type="button" variant="ghost" disabled={busy != null} onClick={() => act(e, null)}>
                    Keep the estimate
                  </Button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
      {error && (
        <p role="alert" className="mt-2 rounded-xl bg-destructive/10 px-3 py-2 text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}

const TRAVEL_KINDS = ["flight", "transport", "stay"] as const;

/** "Fri, Feb 5, 9:30 AM", or for a stay "Fri, Feb 5 to Sun, Feb 7". */
function when(i: Item): string {
  if (i.kind === "stay" && i.end_day) return `${longDay(i.day)} to ${longDay(i.end_day)}`;
  const at = i.start_time ? `, ${clock(i.start_time)}` : "";
  const arrive = i.end_day && i.end_day !== i.day ? ` to ${longDay(i.end_day)}${i.end_time ? `, ${clock(i.end_time)}` : ""}` : "";
  return `${longDay(i.day)}${at}${arrive}`;
}

/**
 * Travel and lodging: your flights, cars, trains and stays by date, and everyone's one tap away
 * (vision, principle 6). Was "Your flights" on the Money tab; Mike's 11/19 review: a Thanksgiving
 * drive has car rentals and a stay at his parents', not flights, and it isn't money.
 */
export function TravelCard({
  items,
  travelers,
  itemPeople,
  meId,
  compact = false,
  onOpen,
}: {
  items: Item[];
  travelers: Traveler[];
  itemPeople: ItemPerson[];
  meId: string | null;
  /** A phone, atop the itinerary: nothing on a trip with no travel, one line when none is yours. */
  compact?: boolean;
  onOpen: (item: Item) => void;
}) {
  const [everyone, setEveryone] = useState(false);
  const travel = items
    .filter((i) => (TRAVEL_KINDS as readonly string[]).includes(i.kind) && i.status !== "suggested")
    .sort((a, b) => a.day.localeCompare(b.day) || (a.start_time ?? "").localeCompare(b.start_time ?? ""));
  const mine = travel.filter((f) => meId && isGoing(f, meId, itemPeople));
  if (compact && travel.length === 0) return null;

  const seeEveryone = (
    <>
      <Button variant="glass" size="sm" onClick={() => setEveryone(true)} disabled={travel.length === 0}>
        See everyone's
      </Button>
      <Dialog open={everyone} onClose={() => setEveryone(false)} title="Everyone's travel and lodging">
        {everyone && (
          <ul className="space-y-3">
            {travelers.map((t) => {
              const theirs = travel.filter((f) => isGoing(f, t.id, itemPeople));
              return (
                <li key={t.id} className="rounded-2xl bg-white/5 px-4 py-3 text-white">
                  <p className="font-semibold">
                    {t.name}
                    {t.id === meId ? " (you)" : ""}
                  </p>
                  {theirs.length ? (
                    theirs.map((f) => (
                      <p key={f.id} className="text-sm text-white/75">
                        {when(f)}: {f.title}
                      </p>
                    ))
                  ) : (
                    <p className="text-sm italic text-white/70">Nothing added yet</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Dialog>
    </>
  );

  if (compact && mine.length === 0) {
    return (
      <section className="glass-card-solid mt-4 flex items-center justify-between gap-2 rounded-2xl px-4 py-2" aria-labelledby="travel-title">
        <h2 id="travel-title" className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          <Luggage className="size-4 shrink-0 text-primary" />
          <span className="truncate">
            Travel and lodging <span className="font-normal text-muted-foreground">· none of yours yet</span>
          </span>
        </h2>
        {seeEveryone}
      </section>
    );
  }

  return (
    <section className={`glass-card-solid rounded-2xl p-4 ${compact ? "mt-4" : ""}`} aria-labelledby="travel-title">
      <h2 id="travel-title" className="mb-2 flex items-center gap-2 font-display text-lg font-bold">
        <Luggage className="size-4 text-primary" /> Travel and lodging
      </h2>
      {mine.length ? (
        <ul className="mb-2 space-y-1">
          {mine.map((f) => {
            const Icon = KIND_ICON[f.kind];
            return (
              <li key={f.id}>
                <button type="button" onClick={() => onOpen(f)} className="flex w-full items-start gap-2 rounded-xl px-1 py-1.5 text-left text-sm hover:bg-white/30">
                  <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span className="min-w-0">
                    <span className="block font-medium">{f.title}</span>
                    <span className="block text-xs text-muted-foreground">{when(f)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mb-2 text-sm text-muted-foreground">No flight, car or stay of yours on the trip yet.</p>
      )}
      {seeEveryone}
    </section>
  );
}
