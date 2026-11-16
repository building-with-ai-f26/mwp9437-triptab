import { useState } from "react";
import { MapPin, Plus, Trash2 } from "lucide-react";
import { Button, DarkField, Dialog } from "../ui";
import { dateRange, nightsBetween, tripSpan, validateTrip, type Stop, type StopDraft, type Trip } from "../../lib/model";

/** Owners change a trip after starting it: its name and stops (the stops set the dates), or delete it. */
export function TripSettingsDialog({
  open,
  trip,
  stops,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  trip: Trip;
  stops: Stop[];
  onClose: () => void;
  onSave: (name: string, stops: StopDraft[]) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Trip settings">
      {open && <SettingsForm {...{ trip, stops, onClose, onSave, onDelete }} />}
    </Dialog>
  );
}

function SettingsForm({
  trip,
  stops: current,
  onClose,
  onSave,
  onDelete,
}: {
  trip: Trip;
  stops: Stop[];
  onClose: () => void;
  onSave: (name: string, stops: StopDraft[]) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [name, setName] = useState(trip.name);
  const [stops, setStops] = useState<StopDraft[]>(
    [...current].sort((a, b) => a.position - b.position).map(({ name, start_date, end_date }) => ({ name, start_date, end_date })),
  );
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const problems = validateTrip(name, stops);
  const dated = stops.filter((s) => s.start_date && s.end_date && s.end_date >= s.start_date);
  const span = dated.length ? tripSpan(dated) : null;
  const setStop = (i: number, patch: Partial<StopDraft>) => setStops((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  const save = async () => {
    setTried(true);
    if (problems.length) return;
    setBusy(true);
    setError(null);
    try {
      await onSave(name, stops);
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <DarkField label="Trip name">
        <input className="field-dark" value={name} onChange={(e) => setName(e.target.value)} />
      </DarkField>

      <fieldset className="mb-3">
        <legend className="label-luxury mb-1.5 text-white/65">Stops</legend>
        <ol className="space-y-2">
          {stops.map((s, i) => (
            <li key={i} className="rounded-2xl border border-white/10 p-2.5">
              <div className="mb-2 flex items-center gap-2">
                <MapPin className="size-4 shrink-0 text-white/60" />
                <input
                  className="field-dark"
                  aria-label={`Stop ${i + 1} place`}
                  value={s.name}
                  onChange={(e) => setStop(i, { name: e.target.value })}
                />
                {stops.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setStops((prev) => prev.filter((_, j) => j !== i))}
                    className="grid size-11 shrink-0 place-items-center rounded-full text-white/60 hover:bg-white/10 hover:text-red-200"
                    aria-label={`Remove stop ${i + 1}`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  className="field-dark"
                  type="date"
                  aria-label={`Stop ${i + 1} from`}
                  value={s.start_date}
                  onChange={(e) => setStop(i, { start_date: e.target.value })}
                />
                <input
                  className="field-dark"
                  type="date"
                  aria-label={`Stop ${i + 1} to`}
                  min={s.start_date || undefined}
                  value={s.end_date}
                  onChange={(e) => setStop(i, { end_date: e.target.value })}
                />
              </div>
            </li>
          ))}
        </ol>
        <Button
          type="button"
          variant="light"
          size="sm"
          className="mt-2"
          onClick={() => setStops((prev) => [...prev, { name: "", start_date: prev[prev.length - 1]?.end_date ?? "", end_date: "" }])}
        >
          <Plus /> Add a stop
        </Button>
      </fieldset>

      {span && (
        <p className="mb-3 text-sm text-white/70">
          {nightsBetween(span.start, span.end) + 1} days: {dateRange(span.start, span.end)}.
        </p>
      )}
      {((tried && problems.length > 0) || error) && (
        <p role="alert" className="mb-3 rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-200">
          {error ?? problems.join(" ")}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
        <Button
          type="button"
          variant="light"
          size="sm"
          className="text-red-200"
          disabled={busy}
          onClick={async () => {
            if (!window.confirm(`Delete "${trip.name}" for everyone on it? Its plans, people and money go too. This can't be undone.`)) return;
            setBusy(true);
            try {
              await onDelete();
            } catch (e) {
              setError((e as Error).message);
              setBusy(false);
            }
          }}
        >
          <Trash2 /> Delete trip
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="light" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </form>
  );
}
