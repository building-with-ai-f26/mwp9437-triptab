import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Button, Dialog } from "../ui";
import type { ExpenseRow, ItemPerson } from "../../lib/api";
import { isGoing, myShareOf } from "../../lib/ledger";
import { clock, dollars, longDay, PART_LABEL, STATUS_LABEL, type Item } from "../../lib/model";

/**
 * A trip's first view is about you (11/23 product manager review, item 4): how many plans you're
 * in, your share so far and where you stand, at the top of the itinerary. Tapping it lists every
 * plan with one tap to say you're in or out. A plan whose bill is in follows the bill (C47), so
 * it shows your share instead of a switch.
 */
export function YourPlans({
  items,
  itemPeople,
  expenses,
  meId,
  share,
  balance,
  onGoing,
  onOpen,
}: {
  items: Item[];
  itemPeople: ItemPerson[];
  /** The plans' bills (never own lines). */
  expenses: ExpenseRow[];
  meId: string;
  /** Your share of everything so far, in cents. */
  share: number;
  /** Positive: you're owed. Negative: you owe. */
  balance: number;
  onGoing: (item: Item, going: boolean) => Promise<void>;
  onOpen: (item: Item) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const plans = [...items].sort((a, b) => a.day.localeCompare(b.day) || (a.start_time ?? "").localeCompare(b.start_time ?? ""));
  const billOf = (item: Item) => expenses.find((e) => e.item_id === item.id && !e.own);
  const mine = plans.filter((i) => isGoing(i, meId, itemPeople));
  const standing = balance > 0 ? `you're owed ${dollars(balance)}` : balance < 0 ? `you owe ${dollars(-balance)}` : "you're even";

  const set = async (item: Item, going: boolean) => {
    setBusy(item.id);
    setError(null);
    try {
      await onGoing(item, going);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="your-plans"
        className="glass-card-solid mt-4 flex w-full items-center gap-3 rounded-2xl p-4 text-left sm:mt-6"
      >
        <span className="min-w-0 flex-1">
          <span className="block font-display text-lg font-semibold text-foreground">
            You're in {mine.length} of {plans.length} {plans.length === 1 ? "plan" : "plans"}
          </span>
          <span className="block text-sm text-foreground/80">
            Your share so far {dollars(share)} · {standing}
          </span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-0.5 text-sm font-semibold text-foreground">
          In or out <ChevronRight className="size-4" />
        </span>
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} title="Your plans">
        <p className="mb-3 text-sm text-white/80">
          Tap to say you're in or out. It changes only you; the group sees who's in on each plan.
        </p>
        <ul className="divide-y divide-white/10 rounded-2xl border border-white/10">
          {plans.map((item) => {
            const bill = billOf(item);
            const going = isGoing(item, meId, itemPeople);
            const myShare = myShareOf(bill, meId);
            return (
              <li key={item.id} className="flex items-center gap-3 px-3 py-2.5">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => (setOpen(false), onOpen(item))}>
                  <span className="block truncate text-sm font-medium text-white">{item.title}</span>
                  <span className="block text-xs text-white/70">
                    {longDay(item.day)} · {item.start_time ? clock(item.start_time) : PART_LABEL[item.part]} · {STATUS_LABEL[item.status]}
                  </span>
                </button>
                {bill ? (
                  <span className="shrink-0 text-right text-xs text-white/80">{myShare != null ? `In · your share ${dollars(myShare)}` : "Not on the bill"}</span>
                ) : (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={going}
                    aria-label={`${item.title}: ${going ? "you're in" : "you're out"}`}
                    disabled={busy === item.id}
                    onClick={() => set(item, !going)}
                    className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold transition-colors ${
                      going ? "bg-white/90 text-foreground" : "border border-white/25 text-white/80"
                    }`}
                  >
                    {going ? (item.kind === "flight" ? "On it" : "I'm in") : item.kind === "flight" ? "Not me" : "I'm out"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        {error && (
          <p role="alert" className="mt-3 rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        )}
        <div className="mt-4 flex justify-end">
          <Button variant="light" onClick={() => setOpen(false)}>
            Done
          </Button>
        </div>
      </Dialog>
    </>
  );
}
