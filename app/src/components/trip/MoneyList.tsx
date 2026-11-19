import { useState } from "react";
import { Banknote, Receipt, X } from "lucide-react";
import type { ExpenseRow, Payment } from "../../lib/api";
import { dollars, longDay, type Item, type Traveler } from "../../lib/model";
import { filterLines, METHOD_LABEL, MONEY_KIND_LABEL, MONEY_KINDS, moneyLines, nameOf, yourPart, type MoneyKind, type MoneyLine } from "../../lib/moneyLines";
import { KIND_ICON } from "./Timeline";

/**
 * Every cost and payment on the trip in one list, by date, with chips to show any mix of plans,
 * other expenses and payments (Mike's 11/19 review, after Splitwise). Each line says who paid and
 * what it means for you. On a phone it sits under the Money summary; on desktop it takes the main
 * column, so a trip with a hundred lines doesn't push the sidebar out of sight.
 */
export function MoneyList({
  id,
  expenses,
  payments,
  items,
  travelers,
  meId,
  myUserId,
  canEdit,
  onOpenPlan,
  onOpenExpense,
  onRemovePayment,
}: {
  /** The heading's id, for the section's label. */
  id: string;
  expenses: ExpenseRow[];
  payments: Payment[] | null;
  items: Item[];
  travelers: Traveler[];
  meId: string | null;
  myUserId: string | null;
  canEdit: boolean;
  onOpenPlan: (item: Item) => void;
  onOpenExpense: (e: ExpenseRow) => void;
  onRemovePayment: (p: Payment) => Promise<void>;
}) {
  const [kinds, setKinds] = useState<Set<MoneyKind>>(() => new Set(MONEY_KINDS));
  const [error, setError] = useState<string | null>(null);
  const all = moneyLines(expenses, payments, meId);
  const shown = filterLines(all, kinds);
  const name = (tid: string) => nameOf(travelers, tid, meId);
  const toggle = (k: MoneyKind) =>
    setKinds((now) => {
      const next = new Set(now);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const open = (l: MoneyLine) => {
    if (l.kind === "payments") return;
    if (l.kind === "expenses") return onOpenExpense(l.expense);
    const item = items.find((i) => i.id === l.expense.item_id);
    if (item) onOpenPlan(item);
  };

  const remove = async (p: Payment) => {
    if (!window.confirm(`Remove this ${dollars(p.amount_cents)} payment? Balances go back to before it.`)) return;
    setError(null);
    try {
      await onRemovePayment(p);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <section className="glass-card-solid rounded-2xl p-4" aria-labelledby={id}>
      <h2 id={id} className="font-display text-lg font-bold">
        Every cost and payment
      </h2>
      <p className="mb-2 text-xs text-muted-foreground">By date. Tap a cost to see or change it.</p>

      <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Show">
        {MONEY_KINDS.map((k) => {
          const on = kinds.has(k);
          const n = all.filter((l) => l.kind === k).length;
          return (
            <button
              key={k}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(k)}
              className={`min-h-9 rounded-full border px-3 text-sm font-semibold transition-colors ${
                on ? "border-primary bg-primary text-primary-foreground" : "border-foreground/25 bg-white/50 text-foreground hover:bg-white/70"
              }`}
            >
              {MONEY_KIND_LABEL[k]} <span className="tabular-nums opacity-80">{n}</span>
            </button>
          );
        })}
      </div>

      {all.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing on the tab yet. Confirm a plan with its cost, or add an expense.</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">Pick a kind above to see its lines.</p>
      ) : (
        <ul className="divide-y divide-foreground/10" data-testid="money-lines">
          {shown.map((l) => {
            const part = yourPart(l, meId);
            const tone = part.tone === "lent" ? "text-green-800" : part.tone === "borrowed" ? "text-destructive" : "text-muted-foreground";
            const when = l.day ? longDay(l.day) : "No particular day";
            if (l.kind === "payments") {
              const p = l.payment;
              const canRemove = canEdit || (myUserId != null && p.created_by === myUserId);
              return (
                <li key={l.id} className="flex items-center gap-2 py-2 text-sm" data-testid="payment" data-kind="payments">
                  <Banknote className="size-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {name(p.from_traveler)} paid {name(p.to_traveler) === "You" ? "you" : name(p.to_traveler)}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {when} · {METHOD_LABEL[p.method]}
                      {p.note ? ` · ${p.note}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-semibold tabular-nums">{dollars(l.cents)}</span>
                    <span className={`block text-xs ${tone}`}>{part.text}</span>
                  </span>
                  {canRemove && (
                    <button
                      type="button"
                      aria-label={`Remove the ${dollars(p.amount_cents)} payment from ${name(p.from_traveler)}`}
                      className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-white/40 hover:text-foreground"
                      onClick={() => remove(p)}
                    >
                      <X className="size-4" />
                    </button>
                  )}
                </li>
              );
            }
            const item = l.kind === "plans" ? items.find((i) => i.id === l.expense.item_id) : undefined;
            const Icon = item ? KIND_ICON[item.kind] : Receipt;
            return (
              <li key={l.id} data-kind={l.kind}>
                <button type="button" onClick={() => open(l)} className="flex w-full items-center gap-2 rounded-xl py-2 text-left text-sm hover:bg-white/30">
                  <Icon className="size-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{l.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {when} · {name(l.paidBy)} paid
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-semibold tabular-nums">{l.expense.with_points && !l.cents ? "Points" : dollars(l.cents)}</span>
                    <span className={`block text-xs ${tone}`}>{part.text}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs font-medium text-red-900">
          {error}
        </p>
      )}
    </section>
  );
}
