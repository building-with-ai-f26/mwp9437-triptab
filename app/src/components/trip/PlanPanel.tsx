import { useState, type FormEvent } from "react";
import { CalendarPlus, Check, CircleDollarSign, Pencil, Sparkles } from "lucide-react";
import { Button, Segmented } from "../ui";
import type { ExpenseRow, ItemPerson, OwnMark } from "../../lib/api";
import { bookedLabel, isGoing, myShareOf, ownLineOf, ownProgress } from "../../lib/ledger";
import { dollars, PAY_MODE_LABEL, STATUS_LABEL, type Item, type PayMode, type Traveler } from "../../lib/model";
import { parseDollars, toCents } from "../../lib/money";
import { downloadIcs, icsForItems } from "../../lib/ics";
import { track } from "../../lib/analytics";

/**
 * Top of a plan's dialog: its money (confirm with the real cost, or what was paid), your own
 * in or out, and who's going. Everyone can set their own in or out; owners can set anyone's.
 */
export function PlanPanel({
  tripName,
  item,
  travelers,
  itemPeople,
  meId,
  expense,
  expenses,
  ownMarks,
  canEdit,
  onGoing,
  onConfirm,
  onPayMode,
  onLogOwn,
  onClearOwn,
}: {
  tripName: string;
  item: Item;
  travelers: Traveler[];
  itemPeople: ItemPerson[];
  meId: string | null;
  /** The plan's one bill, when it's "One bill, split" and confirmed. */
  expense: ExpenseRow | undefined;
  /** Everything on the tab you can read; own lines are found in here. */
  expenses: ExpenseRow[];
  ownMarks: OwnMark[];
  canEdit: boolean;
  onGoing: (travelerId: string, going: boolean) => Promise<void>;
  onConfirm: () => void;
  onPayMode: (mode: PayMode) => Promise<void>;
  onLogOwn: (travelerId: string, cents: number, withPoints: boolean) => Promise<void>;
  onClearOwn: (travelerId: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const going = travelers.filter((t) => isGoing(item, t.id, itemPeople));
  const flight = item.kind === "flight";
  const meIn = meId ? isGoing(item, meId, itemPeople) : false;
  const share = myShareOf(expense, meId);
  const payer = travelers.find((t) => t.id === expense?.paid_by)?.name;
  const own = item.pay_mode === "own";
  const progress = ownProgress(item, travelers, itemPeople, ownMarks);
  const marked = new Set(ownMarks.filter((m) => m.item_id === item.id).map((m) => m.traveler_id));
  const logged = Boolean(expense) || marked.size > 0;
  const [editing, setEditing] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      setEditing(null);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
  };

  const set = async (travelerId: string, value: boolean) => {
    setBusy(travelerId);
    setError(null);
    try {
      await onGoing(travelerId, value);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
  };

  return (
    <div className="mb-4 space-y-3 border-b border-white/10 pb-4">
      <div>
        <p className="label-luxury mb-1.5 text-white/65">Who pays</p>
        {canEdit && !logged ? (
          <Segmented
            label="Who pays"
            value={item.pay_mode}
            onChange={(m) => m !== item.pay_mode && run("mode", () => onPayMode(m))}
            options={[
              { value: "split", label: PAY_MODE_LABEL.split },
              { value: "own", label: PAY_MODE_LABEL.own },
            ]}
          />
        ) : (
          <p className="text-sm text-white">
            {PAY_MODE_LABEL[item.pay_mode]}
            {canEdit && logged && (
              <span className="block text-xs text-white/60">
                {own ? "To make it one bill, clear the costs logged below first." : "To switch, undo the confirmation first (Edit cost)."}
              </span>
            )}
          </p>
        )}
        <p className="mt-1.5 text-xs text-white/60">
          {own
            ? "Each person going logs what they paid. Everyone sees who has booked; a price shows only to that person and whoever entered it. Own costs never go into Settle up."
            : "One person pays and it's split among who's in: evenly, or by shares, percent or exact amounts."}
        </p>
      </div>

      {!own &&
        (item.status === "confirmed" && expense ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-green-500/10 px-3 py-2.5 text-sm text-white">
            <span>
              <span className="mr-1.5 inline-flex items-center gap-0.5 rounded-full bg-green-500/25 px-1.5 text-[11px] font-bold text-green-200">
                $ <Check className="size-3" strokeWidth={3} />
              </span>
              Paid {dollars(expense.total_cents)}
              {payer ? ` by ${payer}` : ""}
              {share != null ? `. Your share: ${dollars(share)}` : ". You're not in this one"}
            </span>
            {canEdit && (
              <Button size="sm" variant="light" onClick={onConfirm}>
                <Pencil /> Edit cost
              </Button>
            )}
          </div>
        ) : (
          canEdit && (
            <Button className="w-full" onClick={onConfirm}>
              <CircleDollarSign /> Confirm with the real cost
            </Button>
          )
        ))}

      {own && (
        <div className="space-y-3 rounded-2xl bg-white/5 p-3" data-testid="own-lines">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-white" data-testid="own-status">
            {progress.complete ? (
              <>
                <span className="inline-flex items-center gap-0.5 rounded-full bg-green-500/25 px-1.5 text-[11px] font-bold text-green-200">
                  $ <Check className="size-3" strokeWidth={3} />
                </span>
                Confirmed: everyone going has booked
              </>
            ) : (
              `${STATUS_LABEL[item.status === "confirmed" ? "planned" : item.status]}, ${bookedLabel(progress)}`
            )}
          </p>

          <ul className="divide-y divide-white/10 rounded-2xl border border-white/10">
            {(meId && !progress.going.some((t) => t.id === meId)
              ? [...progress.going, ...travelers.filter((t) => t.id === meId)]
              : progress.going
            ).map((t) => {
              const mine = t.id === meId;
              const line = ownLineOf(expenses, item.id, t.id);
              const has = marked.has(t.id);
              // You change your own; an owner logs for someone who has none, or edits one they entered.
              const mayLog = mine || (canEdit && (!has || Boolean(line)));
              const open = editing === t.id;
              return (
                <li key={t.id} className="px-3 py-2">
                  <div className="flex min-h-9 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white">
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {t.name}
                      {mine ? " (you)" : ""}
                    </span>
                    {has ? (
                      <span className="inline-flex items-center gap-1 text-green-200">
                        <Check className="size-3.5" strokeWidth={3} /> Booked
                        {line && (
                          <span className="text-white">
                            {" · "}
                            {line.with_points ? (
                              <>
                                <Sparkles className="mb-0.5 inline size-3" /> points
                                {line.total_cents > 0 ? `, ${dollars(line.total_cents)} cash` : ""}
                              </>
                            ) : (
                              dollars(line.total_cents)
                            )}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-white/60">{progress.going.some((g) => g.id === t.id) ? "Not yet" : flight ? "Not on it" : "Out"}</span>
                    )}
                    {mayLog && !open && (
                      <Button size="sm" variant="light" onClick={() => setEditing(t.id)}>
                        {has ? <Pencil /> : <CircleDollarSign />}
                        {has ? "Edit" : mine ? "Log my cost" : `Log for ${t.name}`}
                      </Button>
                    )}
                  </div>
                  {open && (
                    <OwnLineForm
                      who={mine ? "you" : t.name}
                      line={line}
                      estCents={item.cost_type === "per_person" || flight ? item.est_cents : null}
                      busy={busy === t.id}
                      onCancel={() => setEditing(null)}
                      onSave={(cents, points) => run(t.id, () => onLogOwn(t.id, cents, points))}
                      onClear={has ? () => run(t.id, () => onClearOwn(t.id)) : undefined}
                    />
                  )}
                  {has && !line && !mine && canEdit && (
                    <p className="text-xs text-white/50">They logged it themselves, so the price is theirs to see and change.</p>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-white/60">
            Not covered yet: one person buying for part of the group while the rest buy their own. Add that as a general
            expense for now (Money, then Expense) and split it among the people it covered.
          </p>
        </div>
      )}

      {meId && (
        <div>
          <p className="label-luxury mb-1.5 text-white/65">{flight ? "Are you on this flight?" : "Are you in?"}</p>
          <Segmented
            label={flight ? "Are you on this flight?" : "Are you in?"}
            value={meIn ? "in" : "out"}
            onChange={(v) => set(meId, v === "in")}
            options={[
              { value: "in", label: flight ? "I'm on it" : "I'm in" },
              { value: "out", label: flight ? "Not me" : "I'm out" },
            ]}
          />
        </div>
      )}

      <div>
        <p className="label-luxury mb-1.5 text-white/65">
          {flight ? "On this flight" : "Who's in"} ({going.length} of {travelers.length})
        </p>
        {canEdit ? (
          <div className="flex flex-wrap gap-1.5">
            {travelers.map((t) => {
              const on = isGoing(item, t.id, itemPeople);
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={on}
                  disabled={busy === t.id}
                  onClick={() => set(t.id, !on)}
                  className={`min-h-9 rounded-full px-3 text-sm transition-colors ${
                    on ? "bg-white/90 font-medium text-foreground" : "border border-white/15 text-white/55 line-through"
                  }`}
                >
                  {t.name}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-white/80">{going.length ? going.map((t) => t.name).join(", ") : "Nobody yet"}</p>
        )}
      </div>
      <Button
        size="sm"
        variant="light"
        onClick={() => {
          downloadIcs(`${item.title}.ics`, icsForItems({ name: tripName }, [item]));
          track("calendar downloaded", { scope: "plan", kind: item.kind });
        }}
      >
        <CalendarPlus /> Add to calendar
      </Button>
      {error && (
        <p role="alert" className="rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      )}
    </div>
  );
}

/** One person's own cost: what they paid, or "Paid with points" with an optional cash value. */
function OwnLineForm({
  who,
  line,
  estCents,
  busy,
  onSave,
  onClear,
  onCancel,
}: {
  who: string;
  line: ExpenseRow | undefined;
  estCents: number | null;
  busy: boolean;
  onSave: (cents: number, withPoints: boolean) => void;
  onClear?: () => void;
  onCancel: () => void;
}) {
  const [price, setPrice] = useState(line ? String(line.total_cents / 100) : estCents ? String(estCents / 100) : "");
  const [points, setPoints] = useState(line?.with_points ?? false);
  const [tried, setTried] = useState(false);
  const typed = price.trim() === "" ? (points ? 0 : NaN) : parseDollars(price);
  const bad = Number.isNaN(typed) || typed < 0;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setTried(true);
    if (bad) return;
    onSave(toCents(typed), points);
  };

  return (
    <form onSubmit={submit} className="mt-2 space-y-2 pb-1">
      <label className="block">
        <span className="label-luxury mb-1 block text-white/65">
          {points ? "Cash value or fees (optional)" : who === "you" ? "What you paid" : `What ${who} paid`}
        </span>
        <input
          className="field-dark"
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="$"
          autoFocus
          aria-label={who === "you" ? "Your own cost" : `${who}'s own cost`}
        />
      </label>
      <label className="flex min-h-9 items-center gap-2.5 text-sm text-white">
        <input type="checkbox" className="size-5 accent-[#8c7054]" checked={points} onChange={(e) => setPoints(e.target.checked)} />
        Paid with points
      </label>
      {points && <p className="text-xs text-white/60">Points only touch your own line; nobody else's numbers change.</p>}
      {tried && bad && (
        <p role="alert" className="rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-200">
          Enter the cost, like 420 or $420.
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        {onClear && (
          <Button type="button" size="sm" variant="light" className="mr-auto text-red-200" disabled={busy} onClick={onClear}>
            Not booked
          </Button>
        )}
        <Button type="button" size="sm" variant="light" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={busy}>
          <Check /> {busy ? "Saving..." : line || onClear ? "Save" : "Mark as booked"}
        </Button>
      </div>
    </form>
  );
}
