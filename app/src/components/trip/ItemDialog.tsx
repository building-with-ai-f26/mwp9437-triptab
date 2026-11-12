import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button, DarkField, Dialog, Segmented } from "../ui";
import {
  addDays,
  dollars,
  KIND_LABEL,
  longDay,
  PART_LABEL,
  PARTS,
  STATUS_LABEL,
  tripDays,
  validateItem,
  type CostType,
  type DayPart,
  type Item,
  type ItemKind,
  type ItemStatus,
  type Trip,
} from "../../lib/model";
import { parseDollars, toCents } from "../../lib/money";
import type { ItemInput } from "../../lib/api";

export interface ItemDialogState {
  /** The item being edited, or null for a new one. */
  item: Item | null;
  day: string;
  part: DayPart;
  kind: ItemKind;
}

const KINDS: ItemKind[] = ["activity", "meal", "transport", "flight", "stay"];

/**
 * Add or edit a plan. Owners only: viewers see the plan read-only (Build 3 adds opting in or out).
 * Confirming with the real cost, who paid and who's in is a separate step (Build 3).
 */
export function ItemDialog({
  state,
  trip,
  canEdit,
  onClose,
  onSave,
  onDelete,
}: {
  state: ItemDialogState | null;
  trip: Trip;
  canEdit: boolean;
  onClose: () => void;
  onSave: (input: ItemInput, existing: Item | null) => Promise<void>;
  onDelete: (item: Item) => Promise<void>;
}) {
  return (
    <Dialog
      open={state !== null}
      onClose={onClose}
      title={state?.item ? (canEdit ? "Edit plan" : state.item.title) : state?.kind === "stay" ? "Add a stay" : "Add a plan"}
    >
      {state && (
        <ItemForm key={state.item?.id ?? `${state.day}-${state.part}-${state.kind}`} {...{ state, trip, canEdit, onClose, onSave, onDelete }} />
      )}
    </Dialog>
  );
}

function ItemForm({
  state,
  trip,
  canEdit,
  onClose,
  onSave,
  onDelete,
}: {
  state: ItemDialogState;
  trip: Trip;
  canEdit: boolean;
  onClose: () => void;
  onSave: (input: ItemInput, existing: Item | null) => Promise<void>;
  onDelete: (item: Item) => Promise<void>;
}) {
  const it = state.item;
  const [kind, setKind] = useState<ItemKind>(it?.kind ?? state.kind);
  const [title, setTitle] = useState(it?.title ?? "");
  const [day, setDay] = useState(it?.day ?? state.day);
  const [part, setPart] = useState<DayPart>(it?.part ?? state.part);
  const [endDay, setEndDay] = useState(it?.end_day ?? addDays(it?.day ?? state.day, 1));
  const [status, setStatus] = useState<ItemStatus>(it?.status === "confirmed" ? "confirmed" : (it?.status ?? "suggested"));
  const [estimate, setEstimate] = useState(it?.est_cents != null ? String(it.est_cents / 100) : "");
  const [costType, setCostType] = useState<CostType>(it?.cost_type ?? "total");
  const [location, setLocation] = useState(it?.location ?? "");
  const [notes, setNotes] = useState(it?.notes ?? "");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const days = tripDays(trip.start_date, trip.end_date);
  const checkoutDays = tripDays(addDays(day, 1), addDays(trip.end_date, 1));
  const typed = estimate.trim() === "" ? null : parseDollars(estimate);
  const estCents = typed == null || Number.isNaN(typed) ? null : toCents(typed);
  const isStay = kind === "stay";

  const input: ItemInput = {
    kind,
    title: title.trim(),
    day,
    part: isStay ? "night" : part,
    end_day: isStay ? endDay : null,
    location: location.trim() || null,
    notes: notes.trim() || null,
    status,
    est_cents: estCents,
    cost_type: isStay ? "total" : costType,
  };
  const problems = [
    ...validateItem(input, trip),
    ...(typed != null && Number.isNaN(typed) ? ["Type the estimate as a number, like 45 or $45."] : []),
  ];

  if (!canEdit && it) {
    return (
      <div className="space-y-3 text-sm text-white/85">
        <p>
          <span className="label-luxury block text-white/55">When</span>
          {isStay ? `${longDay(it.day)} to ${longDay(it.end_day ?? it.day)}` : `${longDay(it.day)}, ${PART_LABEL[it.part].toLowerCase()}`}
        </p>
        <p>
          <span className="label-luxury block text-white/55">Status</span>
          {STATUS_LABEL[it.status]}
          {it.est_cents != null && it.status !== "confirmed" ? `, about ${dollars(it.est_cents)}` : ""}
        </p>
        {it.location && (
          <p>
            <span className="label-luxury block text-white/55">Where</span>
            {it.location}
          </p>
        )}
        {it.notes && (
          <p className="whitespace-pre-line">
            <span className="label-luxury block text-white/55">Notes</span>
            {it.notes}
          </p>
        )}
        <p className="text-xs text-white/50">Only the trip's owners can change plans.</p>
      </div>
    );
  }

  const save = async () => {
    setTried(true);
    if (problems.length) return;
    setBusy(true);
    setError(null);
    try {
      await onSave(input, it);
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
      <DarkField label="What">
        <input
          className="field-dark"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={isStay ? "Chamonix Airbnb" : "Ski school"}
          autoFocus={!it}
        />
      </DarkField>

      <DarkField label="Kind" group>
        <Segmented label="Kind" value={kind} onChange={setKind} options={KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
      </DarkField>

      {isStay ? (
        <div className="grid grid-cols-2 gap-2">
          <DarkField label="Check in">
            <select
              className="field-dark"
              value={day}
              onChange={(e) => {
                setDay(e.target.value);
                if (endDay <= e.target.value) setEndDay(addDays(e.target.value, 1));
              }}
            >
              {days.map((d) => (
                <option key={d} value={d}>
                  {longDay(d)}
                </option>
              ))}
            </select>
          </DarkField>
          <DarkField label="Check out">
            <select className="field-dark" value={endDay} onChange={(e) => setEndDay(e.target.value)}>
              {checkoutDays.map((d) => (
                <option key={d} value={d}>
                  {longDay(d)}
                </option>
              ))}
            </select>
          </DarkField>
        </div>
      ) : (
        <>
          <DarkField label="Day">
            <select className="field-dark" value={day} onChange={(e) => setDay(e.target.value)}>
              {days.map((d) => (
                <option key={d} value={d}>
                  {longDay(d)}
                </option>
              ))}
            </select>
          </DarkField>
          <DarkField label="Part of the day" group>
            <Segmented label="Part of the day" value={part} onChange={setPart} options={PARTS.map((p) => ({ value: p, label: PART_LABEL[p] }))} />
          </DarkField>
        </>
      )}

      {status !== "confirmed" ? (
        <DarkField group label="Status" hint="Suggested looks faint until the group decides. Confirming with the real cost comes next.">
          <Segmented
            label="Status"
            value={status}
            onChange={setStatus}
            options={[
              { value: "suggested", label: "Suggested" },
              { value: "planned", label: "Planned" },
            ]}
          />
        </DarkField>
      ) : (
        <p className="mb-3 text-sm text-white/70">Confirmed and paid. Undo the confirmation to change its status.</p>
      )}

      <div className="grid grid-cols-[1fr_auto] items-end gap-2">
        <DarkField label={isStay ? "Estimated total" : "Estimated cost"}>
          <input
            className="field-dark"
            inputMode="decimal"
            value={estimate}
            onChange={(e) => setEstimate(e.target.value)}
            placeholder="$"
          />
        </DarkField>
        {!isStay && (
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

      <DarkField label="Where (optional)">
        <input className="field-dark" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Address or place" />
      </DarkField>
      <DarkField label="Notes (optional)">
        <textarea className="field-dark min-h-[72px] resize-y" value={notes} onChange={(e) => setNotes(e.target.value)} />
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

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        {it ? (
          <Button
            type="button"
            variant="light"
            size="sm"
            className="text-red-200"
            disabled={busy}
            onClick={async () => {
              if (!window.confirm(`Remove "${it.title}" from the trip?`)) return;
              setBusy(true);
              try {
                await onDelete(it);
                onClose();
              } catch (e) {
                setError((e as Error).message);
                setBusy(false);
              }
            }}
          >
            <Trash2 /> Remove
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button type="button" variant="light" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving..." : it ? "Save" : "Add to trip"}
          </Button>
        </div>
      </div>
    </form>
  );
}
