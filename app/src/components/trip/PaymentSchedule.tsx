import { useState } from "react";
import { CalendarClock, Check, Plus, Trash2 } from "lucide-react";
import { Button, DarkField } from "../ui";
import { CurrencySelect } from "./Currency";
import { dollars, type Item, type Traveler } from "../../lib/model";
import { parseDollars, toCents } from "../../lib/money";
import { foreignLabel } from "../../lib/rates";
import { paymentLine, summarize, type PlanPayment } from "../../lib/schedule";

export interface NewPayment {
  amount: number;
  currency: string;
  due_day: string | null;
  paid: boolean;
  paid_by: string;
}

/**
 * T7 (Mike's 11/23 ski trip test, C63): a plan's payment schedule, for deposits and installments.
 * Each payment has an amount, a due date, paid or not, and who pays. The plan's bill is what's been
 * paid; what's due is "coming up" and goes on the payer's To do list. Owners change it; everyone
 * else sees it.
 */
export function PaymentSchedule({
  item,
  rows,
  travelers,
  meId,
  canEdit,
  onAdd,
  onPaid,
  onRemove,
}: {
  item: Item;
  rows: PlanPayment[];
  travelers: Traveler[];
  meId: string | null;
  canEdit: boolean;
  onAdd: (p: NewPayment) => Promise<void>;
  onPaid: (row: PlanPayment, paid: boolean) => Promise<void>;
  onRemove: (row: PlanPayment) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [due, setDue] = useState("");
  const [paid, setPaid] = useState(false);
  const [payer, setPayer] = useState(rows[rows.length - 1]?.paid_by ?? meId ?? travelers[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const s = summarize(rows);
  const name = (id: string) => (id === meId ? "you" : (travelers.find((t) => t.id === id)?.name ?? "someone"));

  if (!canEdit && rows.length === 0) return null;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };
  const typed = amount.trim() === "" ? NaN : parseDollars(amount);

  return (
    <div className="space-y-2 rounded-2xl bg-white/5 p-3" data-testid="payment-schedule">
      <p className="flex items-center gap-2 text-sm font-semibold text-white">
        <CalendarClock className="size-4" /> Payment schedule
        {rows.length > 0 && (
          <span className="font-normal text-white/70" data-testid="schedule-summary">
            {s.allPaid ? `· all ${s.count} paid` : `· ${s.paidCount} of ${s.count} paid, ${dollars(s.dueCents)} to come`}
          </span>
        )}
      </p>
      {rows.length === 0 && <p className="text-xs text-white/70">Paying in parts (a deposit now, the rest later)? Add each payment and when it's due.</p>}
      {rows.length > 0 && (
        <ul className="divide-y divide-white/10 rounded-xl border border-white/10" data-testid="schedule-rows">
          {rows.map((r, i) => (
            <li key={r.id} className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5 text-sm text-white">
              <span className="min-w-0 flex-1">
                <span className="font-medium">Payment {i + 1}:</span> {paymentLine(r, dollars, foreignLabel)}
                <span className="block text-xs text-white/60">
                  {r.paid ? `Paid by ${name(r.paid_by)}` : `${name(r.paid_by) === "you" ? "You pay" : `${name(r.paid_by)} pays`}`}
                  {r.currency && r.currency !== "USD" ? ` · about ${dollars(r.amount_cents)}` : ""}
                </span>
              </span>
              {canEdit ? (
                <>
                  <label className="flex min-h-9 items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      className="size-5 accent-[#8c7054]"
                      checked={r.paid}
                      disabled={busy}
                      onChange={(e) => run(() => onPaid(r, e.target.checked))}
                      aria-label={`Payment ${i + 1} paid`}
                    />
                    Paid
                  </label>
                  <button
                    type="button"
                    className="grid size-9 place-items-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
                    aria-label={`Remove payment ${i + 1}`}
                    disabled={busy}
                    onClick={() => run(() => onRemove(r))}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </>
              ) : (
                r.paid && <Check className="size-4 text-green-200" aria-label="Paid" />
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && !adding && (
        <Button type="button" size="sm" variant="light" onClick={() => setAdding(true)}>
          <Plus /> Add a payment
        </Button>
      )}
      {canEdit && adding && (
        <div role="group" aria-label="New payment" className="space-y-2">
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <DarkField label="Amount">
              <input className="field-dark" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1000" aria-label="Payment amount" />
            </DarkField>
            <DarkField label="In">
              <CurrencySelect value={currency} onChange={setCurrency} label="Payment currency" />
            </DarkField>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <DarkField label={paid ? "Paid on" : "Due by (optional)"}>
              <input type="date" className="field-dark" value={due} onChange={(e) => setDue(e.target.value)} aria-label={paid ? "Paid on" : "Due by"} />
            </DarkField>
            <DarkField label="Who pays">
              <select className="field-dark" value={payer} onChange={(e) => setPayer(e.target.value)} aria-label="Who pays this payment">
                {travelers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.id === meId ? " (you)" : ""}
                  </option>
                ))}
              </select>
            </DarkField>
          </div>
          <label className="flex min-h-9 items-center gap-2 text-sm text-white">
            <input type="checkbox" className="size-5 accent-[#8c7054]" checked={paid} onChange={(e) => setPaid(e.target.checked)} />
            Already paid
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="light" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={busy || Number.isNaN(typed) || typed <= 0 || !payer}
              onClick={() =>
                run(async () => {
                  await onAdd({ amount: toCents(typed), currency, due_day: due || null, paid, paid_by: payer });
                  setAmount("");
                  setDue("");
                  setPaid(false);
                  setAdding(false);
                })
              }
            >
              <Check /> Add payment
            </Button>
          </div>
        </div>
      )}
      {rows.length > 0 && !s.allPaid && (
        <p className="text-xs text-white/60">
          {item.title} counts as {dollars(s.paidCents)} paid so far; the rest shows as coming up in Money until it's paid. Each unpaid payment with a date is on its payer's To do list.
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      )}
    </div>
  );
}
