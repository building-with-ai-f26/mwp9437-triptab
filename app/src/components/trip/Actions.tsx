import { useState, type FormEvent } from "react";
import { CalendarDays, ListChecks, Plus, Trash2 } from "lucide-react";
import { Button } from "../ui";
import type { ActionItem } from "../../lib/api";
import { dueDayOk, dueWindow, longDay, type Traveler, type Trip } from "../../lib/model";

/**
 * Action items (vision, "Help along the way"): what still needs booking or deciding and who's on
 * it. Yours come first. Owners add and hand them out; whoever has one can tick it off.
 */
export function ActionsCard({
  trip,
  actions,
  travelers,
  meId,
  canEdit,
  onAdd,
  onDone,
  onAssign,
  onDelete,
}: {
  trip: Trip;
  actions: ActionItem[];
  travelers: Traveler[];
  meId: string | null;
  canEdit: boolean;
  onAdd: (title: string, assignee: string | null, dueDay: string | null) => Promise<void>;
  onDone: (a: ActionItem, done: boolean) => Promise<void>;
  onAssign: (a: ActionItem, assignee: string | null) => Promise<void>;
  onDelete: (a: ActionItem) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState<string>("");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dueRange = dueWindow(trip.end_date);
  const name = (id: string | null) => (id ? (travelers.find((t) => t.id === id)?.name ?? "?") : null);
  const open = actions.filter((a) => !a.done);
  const done = actions.filter((a) => a.done);
  // Yours first, then everyone else's by name, then unassigned.
  const rank = (a: ActionItem) => (a.assignee === meId ? 0 : a.assignee ? 1 : 2);
  const sorted = [...open].sort(
    (a, b) => rank(a) - rank(b) || (name(a.assignee) ?? "").localeCompare(name(b.assignee) ?? "") || a.created_at.localeCompare(b.created_at),
  );

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    if (due && !dueDayOk(due, trip.end_date)) {
      setError(`Pick a due date from today through ${longDay(trip.end_date)}, the trip's last day.`);
      return;
    }
    setBusy(true);
    await run(async () => {
      await onAdd(title, assignee || null, due || null);
      setTitle("");
      setDue("");
    });
    setBusy(false);
  };

  const row = (a: ActionItem) => {
    const mayTick = canEdit || (a.assignee !== null && a.assignee === meId);
    return (
      <li key={a.id} className="flex items-start gap-2.5 py-2">
        <input
          type="checkbox"
          className="mt-0.5 size-5 shrink-0 accent-[#8c7054]"
          checked={a.done}
          disabled={!mayTick}
          onChange={() => run(() => onDone(a, !a.done))}
          aria-label={`${a.done ? "Mark not done" : "Mark done"}: ${a.title}`}
        />
        <div className="min-w-0 flex-1">
          <p className={`text-sm ${a.done ? "text-muted-foreground line-through" : "font-medium"}`}>{a.title}</p>
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            {canEdit ? (
              <select
                aria-label={`Who has "${a.title}"`}
                className="h-7 max-w-36 rounded-full border border-white/50 bg-white/40 px-2 text-xs"
                value={a.assignee ?? ""}
                onChange={(e) => run(() => onAssign(a, e.target.value || null))}
              >
                <option value="">Nobody yet</option>
                {travelers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.id === meId ? " (you)" : ""}
                  </option>
                ))}
              </select>
            ) : (
              <span className={a.assignee === meId ? "font-semibold text-gold-dark" : ""}>
                {a.assignee === meId ? "You" : (name(a.assignee) ?? "Nobody yet")}
              </span>
            )}
            {a.due_day && (
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="size-3" /> by {longDay(a.due_day)}
              </span>
            )}
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Delete "${a.title}"?`)) run(() => onDelete(a));
            }}
            className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            aria-label={`Delete ${a.title}`}
          >
            <Trash2 className="size-4" />
          </button>
        )}
      </li>
    );
  };

  return (
    <section className="glass-card-solid rounded-2xl p-4" aria-labelledby="actions-title">
      <h2 id="actions-title" className="flex items-center gap-2 font-display text-lg font-bold">
        <ListChecks className="size-4 text-primary" /> Action items
      </h2>
      <p className="mb-2 text-xs text-muted-foreground">
        {open.length ? `${open.length} open` : "Nothing open"}
        {meId && open.some((a) => a.assignee === meId) ? `, ${open.filter((a) => a.assignee === meId).length} yours` : ""}
      </p>

      {canEdit && (
        <form onSubmit={submit} className="mb-2 space-y-2 rounded-2xl bg-white/30 p-2.5">
          <div className="flex gap-2">
            <input
              className="field min-w-0 flex-1"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Book the Barcelona flight"
              aria-label="New action item"
            />
            <Button type="submit" className="!h-11 shrink-0" disabled={busy || !title.trim()}>
              <Plus /> Add
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <select className="field !w-auto min-w-32 flex-1" value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label="Who's on it">
              <option value="">Who's on it?</option>
              {travelers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.id === meId ? " (you)" : ""}
                </option>
              ))}
            </select>
            <label className="flex min-w-48 flex-1 items-center gap-2 text-xs">
              <span className="shrink-0 font-semibold text-foreground">Due by</span>
              <input
                type="date"
                className="field min-w-0 flex-1"
                value={due}
                min={dueRange.min}
                max={dueRange.max}
                onChange={(e) => setDue(e.target.value)}
                aria-label="Due by (optional)"
                title={`Any day from today through ${longDay(trip.end_date)}`}
              />
            </label>
          </div>
          <p className="text-xs text-muted-foreground">Due any day from today through {longDay(trip.end_date)}, so pre-trip bookings fit too.</p>
        </form>
      )}

      {sorted.length > 0 && <ul className="divide-y divide-foreground/10">{sorted.map(row)}</ul>}
      {sorted.length === 0 && !canEdit && <p className="text-sm text-muted-foreground">Nothing to do right now.</p>}
      {done.length > 0 && (
        <details className="mt-2 border-t border-foreground/10 pt-2">
          <summary className="cursor-pointer text-xs text-muted-foreground">{done.length} done</summary>
          <ul className="divide-y divide-foreground/10">{done.map(row)}</ul>
        </details>
      )}
      {error && (
        <p role="alert" className="mt-2 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
