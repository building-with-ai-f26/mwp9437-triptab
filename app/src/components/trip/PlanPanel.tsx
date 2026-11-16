import { useState } from "react";
import { CalendarPlus, Check, CircleDollarSign, Pencil } from "lucide-react";
import { Button, Segmented } from "../ui";
import type { ExpenseRow, ItemPerson } from "../../lib/api";
import { isGoing, myShareOf } from "../../lib/ledger";
import { dollars, type Item, type Traveler } from "../../lib/model";
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
  canEdit,
  onGoing,
  onConfirm,
}: {
  tripName: string;
  item: Item;
  travelers: Traveler[];
  itemPeople: ItemPerson[];
  meId: string | null;
  expense: ExpenseRow | undefined;
  canEdit: boolean;
  onGoing: (travelerId: string, going: boolean) => Promise<void>;
  onConfirm: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const going = travelers.filter((t) => isGoing(item, t.id, itemPeople));
  const flight = item.kind === "flight";
  const meIn = meId ? isGoing(item, meId, itemPeople) : false;
  const share = myShareOf(expense, meId);
  const payer = travelers.find((t) => t.id === expense?.paid_by)?.name;

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
      {item.status === "confirmed" && expense ? (
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
