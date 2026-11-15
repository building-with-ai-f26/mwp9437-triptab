import { useState } from "react";
import { ArrowRight, Check, Plane, Plus, Receipt, Scale, Undo2 } from "lucide-react";
import { Button, DarkField, Dialog, Segmented } from "../ui";
import type { ExpenseRow, ItemPerson, ShareInput } from "../../lib/api";
import { goingList, isGoing, myNumbers } from "../../lib/ledger";
import { dollars, longDay, tripDays, type CostType, type Item, type Traveler, type Trip } from "../../lib/model";
import { parseDollars, toCents, totalCents } from "../../lib/money";
import { computeSplit, SPLIT_LABEL, type SplitMode } from "../../lib/split";
import type { Transfer } from "../../types";

export type ExpenseTarget = { kind: "item"; item: Item; expense?: ExpenseRow } | { kind: "general"; expense?: ExpenseRow };

export interface ExpenseSubmit {
  description: string;
  day: string | null;
  total: number;
  paidBy: string;
  mode: SplitMode;
  shares: ShareInput[];
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
    ex ? String(ex.total_cents / 100) : item?.est_cents ? String(item.est_cents / 100) : "",
  );
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
  const total = Number.isNaN(typed) || typed < 0 ? NaN : totalCents(typed, costType, people.length);
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
  const problem = descriptionMissing ? "Say what it was for." : !paidBy ? "Pick who paid." : split.error;

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
          <input
            className="field-dark"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="$"
            autoFocus={Boolean(item)}
          />
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
        <legend className="label-luxury mb-1.5 text-white/65">Who's in</legend>
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

/** The glass money sidebar: your balance first, then the group's, then Settle up (spring ExpensesPanel). */
export function MoneyCard({
  travelers,
  expenses,
  balances,
  meId,
  canEdit,
  onAdd,
  onOpen,
  onSettle,
}: {
  travelers: Traveler[];
  expenses: ExpenseRow[];
  balances: Record<string, number>;
  meId: string | null;
  canEdit: boolean;
  onAdd: () => void;
  onOpen: (e: ExpenseRow) => void;
  onSettle: () => void;
}) {
  const mine = myNumbers(expenses, meId);
  const general = expenses.filter((e) => !e.item_id);
  const name = (id: string) => travelers.find((t) => t.id === id)?.name ?? "?";

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
          className={`font-display text-2xl font-bold ${mine.balance > 0 ? "text-green-700" : mine.balance < 0 ? "text-destructive" : ""}`}
        >
          {mine.balance > 0 ? `You're owed ${dollars(mine.balance)}` : mine.balance < 0 ? `You owe ${dollars(-mine.balance)}` : "You're even"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Trip spend {dollars(mine.tripTotal)} · your share {dollars(mine.share)} · you paid {dollars(mine.paid)}
        </p>
      </div>

      {expenses.length > 0 ? (
        <ul className="mb-3 space-y-1 text-sm">
          {travelers.map((t) => {
            const b = balances[t.id] ?? 0;
            return (
              <li key={t.id} className="flex items-center justify-between gap-2">
                <span className="truncate">
                  {t.name}
                  {t.id === meId ? " (you)" : ""}
                </span>
                <span className={`tabular-nums ${b > 0 ? "text-green-700" : b < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                  {b > 0 ? `is owed ${dollars(b)}` : b < 0 ? `owes ${dollars(-b)}` : "even"}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mb-3 text-sm text-muted-foreground">Nothing on the tab yet. Confirm a plan with its cost, or add an expense.</p>
      )}

      {general.length > 0 && (
        <div className="mb-3 border-t border-foreground/10 pt-2">
          <p className="label-luxury mb-1 text-muted-foreground">Other expenses</p>
          <ul>
            {general.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => onOpen(e)}
                  className="flex w-full items-center gap-2 rounded-xl px-1 py-1.5 text-left text-sm hover:bg-white/30"
                >
                  <Receipt className="size-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate">{e.description}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{name(e.paid_by)} paid</span>
                  <span className="shrink-0 font-semibold tabular-nums">{dollars(e.total_cents)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Button className="w-full" onClick={onSettle} disabled={expenses.length === 0}>
        <Scale /> Settle up
      </Button>
    </section>
  );
}

export function SettleDialog({
  open,
  transfers,
  travelers,
  meId,
  onClose,
}: {
  open: boolean;
  transfers: Transfer[];
  travelers: Traveler[];
  meId: string | null;
  onClose: () => void;
}) {
  const name = (id: string) => (id === meId ? "You" : (travelers.find((t) => t.id === id)?.name ?? "?"));
  return (
    <Dialog open={open} onClose={onClose} title="Settle up">
      {open && (
        <div>
          <p className="mb-4 text-sm text-white/70">
            The fewest payments that square everyone up. TripTab doesn't move money; pay each other with Venmo or Cash App.
          </p>
          {transfers.length === 0 ? (
            <p className="rounded-2xl bg-white/5 px-4 py-3 text-white">Everyone's even.</p>
          ) : (
            <ol className="space-y-2">
              {transfers.map((t, i) => (
                <li key={i} className="flex items-center gap-2 rounded-2xl bg-white/5 px-4 py-3 text-white">
                  <span className="font-semibold">{name(t.from)}</span>
                  <ArrowRight className="size-4 text-white/50" />
                  <span className="min-w-0 flex-1 truncate font-semibold">{name(t.to)}</span>
                  <span className="font-display text-lg font-bold tabular-nums">{dollars(t.amountCents)}</span>
                </li>
              ))}
            </ol>
          )}
          <div className="mt-4 flex justify-end">
            <Button variant="light" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

/** Your flights, and everyone's one tap away (vision, principle 6). */
export function FlightsCard({
  items,
  travelers,
  itemPeople,
  meId,
  onOpen,
}: {
  items: Item[];
  travelers: Traveler[];
  itemPeople: ItemPerson[];
  meId: string | null;
  onOpen: (item: Item) => void;
}) {
  const [everyone, setEveryone] = useState(false);
  const flights = items.filter((i) => i.kind === "flight").sort((a, b) => a.day.localeCompare(b.day));
  const mine = flights.filter((f) => meId && isGoing(f, meId, itemPeople));

  return (
    <section className="glass-card-solid rounded-2xl p-4" aria-labelledby="flights-title">
      <h2 id="flights-title" className="mb-2 flex items-center gap-2 font-display text-lg font-bold">
        <Plane className="size-4 text-primary" /> Your flights
      </h2>
      {mine.length ? (
        <ul className="mb-2 space-y-1">
          {mine.map((f) => (
            <li key={f.id}>
              <button type="button" onClick={() => onOpen(f)} className="w-full rounded-xl px-1 py-1.5 text-left text-sm hover:bg-white/30">
                <span className="font-medium">{f.title}</span>
                <span className="block text-xs text-muted-foreground">{longDay(f.day)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-2 text-sm text-muted-foreground">No flight of yours on the trip yet.</p>
      )}
      <Button variant="glass" size="sm" onClick={() => setEveryone(true)} disabled={flights.length === 0}>
        See everyone's flights
      </Button>
      <Dialog open={everyone} onClose={() => setEveryone(false)} title="Everyone's flights">
        {everyone && (
          <ul className="space-y-3">
            {travelers.map((t) => {
              const theirs = flights.filter((f) => isGoing(f, t.id, itemPeople));
              return (
                <li key={t.id} className="rounded-2xl bg-white/5 px-4 py-3 text-white">
                  <p className="font-semibold">
                    {t.name}
                    {t.id === meId ? " (you)" : ""}
                  </p>
                  {theirs.length ? (
                    theirs.map((f) => (
                      <p key={f.id} className="text-sm text-white/75">
                        {longDay(f.day)}: {f.title}
                      </p>
                    ))
                  ) : (
                    <p className="text-sm italic text-white/50">No flight added yet</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Dialog>
    </section>
  );
}
