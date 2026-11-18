import { useState, type FormEvent } from "react";
import { ArrowRight, Banknote, X } from "lucide-react";
import { Button, DarkField, Dialog, Segmented } from "../ui";
import type { Payment, PaymentDraft, PaymentMethod } from "../../lib/api";
import { venmoLink } from "../../lib/ledger";
import { dollars, longDay, todayIso, type Traveler } from "../../lib/model";
import { parseDollars, toCents } from "../../lib/money";
import type { Transfer } from "../../types";

/**
 * Recorded payments (Build 3, the 11/17 pod feedback): Settle up with Pay with Venmo and Record it
 * on each payment, recording one by hand (cash, Zelle), and the list of what's been paid.
 * TripTab never moves money; it keeps the record so balances are right mid-trip.
 */
const METHOD_LABEL: Record<PaymentMethod, string> = { venmo: "Venmo", cash: "Cash", zelle: "Zelle", other: "Other" };
const METHODS: PaymentMethod[] = ["venmo", "cash", "zelle", "other"];

const nameOf = (travelers: Traveler[], id: string, meId: string | null) =>
  id === meId ? "You" : (travelers.find((t) => t.id === id)?.name ?? "?");

export function SettleDialog({
  open,
  transfers,
  travelers,
  meId,
  canEdit,
  tripName,
  paymentsReady,
  onRecord,
  onSaveVenmo,
  onClose,
}: {
  open: boolean;
  transfers: Transfer[];
  travelers: Traveler[];
  meId: string | null;
  canEdit: boolean;
  tripName: string;
  /** False on a database without payments yet: Settle up only lists who pays whom. */
  paymentsReady: boolean;
  onRecord: (prefill: Partial<PaymentDraft>) => void;
  onSaveVenmo: (handle: string) => Promise<void>;
  onClose: () => void;
}) {
  const name = (id: string) => nameOf(travelers, id, meId);
  const venmoOf = (id: string) => travelers.find((t) => t.id === id)?.venmo ?? null;
  return (
    <Dialog open={open} onClose={onClose} title="Settle up">
      {open && (
        <div>
          <p className="mb-4 text-sm text-white/80">
            The fewest payments that square everyone up. TripTab doesn't move money: pay with Venmo, cash or any app, then record it so
            balances stay right.
          </p>
          {transfers.length === 0 ? (
            <p className="rounded-2xl bg-white/5 px-4 py-3 text-white">Everyone's even.</p>
          ) : (
            <ol className="space-y-2">
              {transfers.map((t) => {
                const mine = t.from === meId || t.to === meId;
                const handle = venmoOf(t.to);
                return (
                  <li key={`${t.from}-${t.to}`} className="rounded-2xl bg-white/5 px-4 py-3 text-white" data-testid="transfer">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{name(t.from)}</span>
                      <ArrowRight className="size-4 text-white/70" />
                      <span className="min-w-0 flex-1 truncate font-semibold">{name(t.to)}</span>
                      <span className="font-display text-lg font-bold tabular-nums">{dollars(t.amountCents)}</span>
                    </div>
                    {paymentsReady && (mine || canEdit) && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {t.from === meId && handle && (
                          <a
                            href={venmoLink(handle, t.amountCents, `TripTab: ${tripName}`)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-h-9 items-center rounded-full bg-[#1e6aa1] px-3.5 text-sm font-semibold text-white hover:bg-[#185a8a]"
                          >
                            Pay with Venmo
                          </a>
                        )}
                        <Button size="sm" variant="light" onClick={() => onRecord({ from: t.from, to: t.to, cents: t.amountCents })}>
                          Record it
                        </Button>
                        {t.from === meId && !handle && (
                          <span className="text-xs text-white/70">No Venmo for {name(t.to)} yet; any app works, then record it.</span>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
          {paymentsReady && meId && (
            <>
              <Button variant="light" size="sm" className="mt-3" onClick={() => onRecord({})}>
                <Banknote /> Record a payment
              </Button>
              <VenmoField current={venmoOf(meId) ?? ""} onSave={onSaveVenmo} />
            </>
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

/** Your Venmo username, so Pay with Venmo works for people paying you. */
function VenmoField({ current, onSave }: { current: string; onSave: (handle: string) => Promise<void> }) {
  const [value, setValue] = useState(current);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setState("saving");
    setError(null);
    try {
      await onSave(value);
      setState("saved");
    } catch (err) {
      setError((err as Error).message);
      setState("idle");
    }
  };
  return (
    <form onSubmit={save} className="mt-4 border-t border-white/10 pt-3">
      <DarkField label="Your Venmo (optional)" hint="So friends can pay you in one tap. Everyone on your trips sees it.">
        <div className="flex gap-2">
          <input
            className="field-dark"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setState("idle");
            }}
            placeholder="@username"
            autoCapitalize="none"
            autoCorrect="off"
          />
          <Button type="submit" size="sm" disabled={state === "saving" || value.trim() === current}>
            {state === "saving" ? "Saving..." : state === "saved" ? "Saved" : "Save"}
          </Button>
        </div>
      </DarkField>
      {error && (
        <p role="alert" className="-mt-1 text-xs font-medium text-red-200">
          {error}
        </p>
      )}
    </form>
  );
}

export function RecordPaymentDialog({
  prefill,
  travelers,
  meId,
  canEdit,
  onClose,
  onSave,
}: {
  prefill: Partial<PaymentDraft> | null;
  travelers: Traveler[];
  meId: string | null;
  canEdit: boolean;
  onClose: () => void;
  onSave: (draft: PaymentDraft) => Promise<void>;
}) {
  return (
    <Dialog open={prefill !== null} onClose={onClose} title="Record a payment">
      {prefill && <PaymentForm key={JSON.stringify(prefill)} {...{ prefill, travelers, meId, canEdit, onClose, onSave }} />}
    </Dialog>
  );
}

function PaymentForm({
  prefill,
  travelers,
  meId,
  canEdit,
  onClose,
  onSave,
}: {
  prefill: Partial<PaymentDraft>;
  travelers: Traveler[];
  meId: string | null;
  canEdit: boolean;
  onClose: () => void;
  onSave: (draft: PaymentDraft) => Promise<void>;
}) {
  const others = travelers.filter((t) => t.id !== meId);
  const [from, setFrom] = useState(prefill.from ?? meId ?? travelers[0]?.id ?? "");
  const [to, setTo] = useState(prefill.to ?? others.find((t) => t.id !== (prefill.from ?? meId))?.id ?? "");
  const [amount, setAmount] = useState(prefill.cents ? (prefill.cents / 100).toFixed(2) : "");
  const [paidOn, setPaidOn] = useState(prefill.paidOn ?? todayIso());
  const [method, setMethod] = useState<PaymentMethod>(prefill.method ?? "venmo");
  const [note, setNote] = useState(prefill.note ?? "");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const typed = parseDollars(amount);
  const problems = [
    ...(!from || !to ? ["Pick who paid and who got it."] : []),
    ...(from && from === to ? ["Pick two different people."] : []),
    ...(Number.isNaN(typed) || typed <= 0 ? ["Enter the amount, like 50 or $50."] : []),
    ...(!canEdit && from !== meId && to !== meId ? ["You can record a payment you made or got. An owner can record any."] : []),
    ...(!paidOn ? ["Pick the day it was paid."] : []),
  ];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (problems.length) return;
    setBusy(true);
    setError(null);
    try {
      await onSave({ from, to, cents: toCents(typed), paidOn, method, note });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const options = (list: Traveler[]) =>
    list.map((t) => (
      <option key={t.id} value={t.id}>
        {t.name}
        {t.id === meId ? " (you)" : ""}
      </option>
    ));

  return (
    <form onSubmit={submit} noValidate>
      <div className="grid grid-cols-2 gap-x-2">
        <DarkField label="Who paid">
          <select className="field-dark" value={from} onChange={(e) => setFrom(e.target.value)}>
            {options(travelers)}
          </select>
        </DarkField>
        <DarkField label="To">
          <select className="field-dark" value={to} onChange={(e) => setTo(e.target.value)}>
            {options(travelers)}
          </select>
        </DarkField>
        <DarkField label="Amount">
          <input className="field-dark" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="$" />
        </DarkField>
        <DarkField label="When">
          <input className="field-dark" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
        </DarkField>
      </div>
      <DarkField label="How" group>
        <Segmented label="How" value={method} onChange={setMethod} options={METHODS.map((m) => ({ value: m, label: METHOD_LABEL[m] }))} />
      </DarkField>
      <DarkField label="Note (optional)">
        <input className="field-dark" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Airbnb deposit" maxLength={140} />
      </DarkField>
      {tried && problems.length > 0 && (
        <p role="alert" className="mb-3 rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-200">
          {problems.join(" ")}
        </p>
      )}
      {error && (
        <p role="alert" className="mb-3 rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      )}
      <p className="mb-3 text-xs text-white/70">TripTab only records it; the money moves in Venmo, cash or your bank's app.</p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="light" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Recording..." : "Record payment"}
        </Button>
      </div>
    </form>
  );
}

/** What's been paid back so far, newest first, in the Money card. */
export function PaymentsList({
  payments,
  travelers,
  meId,
  myUserId,
  canEdit,
  onRemove,
}: {
  payments: Payment[];
  travelers: Traveler[];
  meId: string | null;
  myUserId: string | null;
  canEdit: boolean;
  onRemove: (p: Payment) => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  if (payments.length === 0) return null;
  const name = (id: string) => nameOf(travelers, id, meId);
  return (
    <div className="mb-3 border-t border-foreground/10 pt-2" aria-label="Payments">
      <p className="label-luxury mb-1 text-muted-foreground">Payments</p>
      <ul>
        {[...payments].reverse().map((p) => (
          <li key={p.id} className="flex items-center gap-2 py-1 text-sm" data-testid="payment">
            <Banknote className="size-4 shrink-0 text-primary" />
            <span className="min-w-0 flex-1">
              <span className="block truncate">
                {name(p.from_traveler)} paid {name(p.to_traveler) === "You" ? "you" : name(p.to_traveler)}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {METHOD_LABEL[p.method]} · {longDay(p.paid_on)}
                {p.note ? ` · ${p.note}` : ""}
              </span>
            </span>
            <span className="shrink-0 font-semibold tabular-nums">{dollars(p.amount_cents)}</span>
            {(canEdit || (myUserId && p.created_by === myUserId)) && (
              <button
                type="button"
                aria-label={`Remove the ${dollars(p.amount_cents)} payment from ${name(p.from_traveler)}`}
                className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-white/40 hover:text-foreground"
                onClick={async () => {
                  if (!window.confirm(`Remove this ${dollars(p.amount_cents)} payment? Balances go back to before it.`)) return;
                  setError(null);
                  try {
                    await onRemove(p);
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                <X className="size-4" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="text-xs font-medium text-red-900">
          {error}
        </p>
      )}
    </div>
  );
}
