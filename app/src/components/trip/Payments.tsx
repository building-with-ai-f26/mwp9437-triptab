import { useState, type FormEvent } from "react";
import { ArrowRight, Banknote } from "lucide-react";
import { Button, DarkField, Dialog, Segmented } from "../ui";
import type { PaymentDraft, PaymentMethod } from "../../lib/api";
import { zelleLabel } from "../../lib/pay";
import { venmoLink, venmoNote } from "../../lib/ledger";
import { METHOD_LABEL, nameOf } from "../../lib/moneyLines";
import { PayInfoForm, ZelleCopy } from "./PayInfo";
import { dollars, todayIso, type Traveler } from "../../lib/model";
import { parseDollars, toCents } from "../../lib/money";
import type { Transfer } from "../../types";

/**
 * Recorded payments (Build 3, the 11/17 pod feedback): Settle up with Pay with Venmo and Record it
 * on each payment, recording one by hand (cash, Zelle), and the list of what's been paid.
 * TripTab never moves money; it keeps the record so balances are right mid-trip.
 */
const METHODS: PaymentMethod[] = ["venmo", "cash", "zelle", "other"];


export function SettleDialog({
  open,
  transfers,
  travelers,
  meId,
  canEdit,
  tripName,
  paymentsReady,
  zelleReady,
  onRecord,
  onSaveMyPay,
  onSaveVenmoFor,
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
  /** False on a database without Zelle yet: Venmo only, and no lock. */
  zelleReady: boolean;
  onRecord: (prefill: Partial<PaymentDraft>) => void;
  onSaveMyPay: (venmo: string, zelle: string) => Promise<void>;
  /** Owners: add or fix the Venmo of someone being paid, until they set their own. */
  onSaveVenmoFor: (travelerId: string, handle: string) => Promise<void>;
  onClose: () => void;
}) {
  const name = (id: string) => nameOf(travelers, id, meId);
  const person = (id: string) => travelers.find((t) => t.id === id);
  const venmoOf = (id: string) => person(id)?.venmo ?? null;
  const me = meId ? person(meId) : undefined;
  const note = venmoNote(tripName);
  // Offer "Add Jordan's Venmo" once, on the first line paying Jordan.
  const firstLineTo = new Map<string, number>();
  transfers.forEach((t, i) => {
    if (!firstLineTo.has(t.to)) firstLineTo.set(t.to, i);
  });
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
              {transfers.map((t, i) => {
                const mine = t.from === meId || t.to === meId;
                const handle = venmoOf(t.to);
                const zelle = person(t.to)?.zelle ?? null;
                // An Owner adds it, or fixes one an Owner added; once Jordan saves his own, it's his.
                const offerVenmo = canEdit && t.to !== meId && !person(t.to)?.pay_locked && firstLineTo.get(t.to) === i;
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
                            href={venmoLink(handle, t.amountCents, note)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-h-9 items-center rounded-full bg-[#1e6aa1] px-3.5 text-sm font-semibold text-white hover:bg-[#185a8a]"
                          >
                            Pay with Venmo
                          </a>
                        )}
                        {t.from === meId && zelle && <ZelleCopy zelle={zelle} />}
                        <Button size="sm" variant="light" onClick={() => onRecord({ from: t.from, to: t.to, cents: t.amountCents, method: handle ? "venmo" : zelle ? "zelle" : undefined })}>
                          Record it
                        </Button>
                        {t.from === meId && !handle && !zelle && !canEdit && (
                          <span className="text-xs text-white/70">No Venmo or Zelle for {name(t.to)} yet; any app works, then record it.</span>
                        )}
                      </div>
                    )}
                    {paymentsReady && offerVenmo && <AddVenmoFor name={name(t.to)} current={handle} onSave={(h) => onSaveVenmoFor(t.to, h)} />}
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
              <MyPay me={me} zelleReady={zelleReady} onSave={onSaveMyPay} />
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

/** "Add Jordan's Venmo" (or "Change"): an Owner fills it in for someone, from the line that pays them. */
function AddVenmoFor({ name, current, onSave }: { name: string; current: string | null; onSave: (handle: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(current ? `@${current}` : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-2 text-xs font-semibold text-white underline underline-offset-4">
        {current ? "Change" : "Add"} {name}'s Venmo
      </button>
    );
  }
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSave(value);
      setOpen(false);
      setBusy(false);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };
  return (
    <form onSubmit={save} className="mt-2">
      <label className="mb-1 block text-xs text-white/80" htmlFor={`venmo-for-${name}`}>
        {name}'s Venmo username
      </label>
      <div className="flex gap-2">
        <input
          id={`venmo-for-${name}`}
          className="field-dark"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="@username"
          autoCapitalize="none"
          autoCorrect="off"
          autoFocus
        />
        <Button type="submit" size="sm" disabled={busy || !value.trim()}>
          {busy ? "Saving..." : "Save"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-1 text-xs font-medium text-red-200">
          {error}
        </p>
      )}
    </form>
  );
}

/** How people pay you, at the foot of Settle up: what's set, and Edit opens the same form as People. */
function MyPay({ me, zelleReady, onSave }: { me: Traveler | undefined; zelleReady: boolean; onSave: (venmo: string, zelle: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const has = Boolean(me?.venmo || me?.zelle);
  const summary = [me?.venmo ? `Venmo @${me.venmo}` : null, me?.zelle ? `Zelle ${zelleLabel(me.zelle)}` : null].filter(Boolean).join(" · ");
  return (
    <section className="mt-4 border-t border-white/10 pt-3" aria-label="How people pay you">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="label-luxury text-white/80">How people pay you</p>
          <p className="truncate text-sm text-white">{has ? summary : "Add your Venmo or Zelle so friends can pay you in a tap."}</p>
        </div>
        {!editing && (
          <Button type="button" size="sm" variant="light" onClick={() => setEditing(true)}>
            {has ? "Edit" : "Add"}
          </Button>
        )}
      </div>
      {editing && (
        <div className="mt-3">
          <PayInfoForm
            venmo={me?.venmo}
            zelle={me?.zelle}
            zelleReady={zelleReady}
            onSave={async (v, z) => {
              await onSave(v, z);
              setEditing(false);
            }}
          >
            <Button type="button" variant="light" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </PayInfoForm>
        </div>
      )}
    </section>
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
