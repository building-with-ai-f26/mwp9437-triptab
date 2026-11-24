import { useEffect, useState } from "react";
import { CalendarCheck, ExternalLink, MapPin, Plus, Send, Wand2 } from "lucide-react";
import { Button, DarkField, Dialog } from "../ui";
import { askAi, clearAskTurns, myAskTurns, saveAskTurn, type AskOption } from "../../lib/api";
import { dueDayOk, longDay, PART_LABEL, PARTS, tripDays, type DayPart, type Traveler, type Trip } from "../../lib/model";
import { mapsLink } from "../../lib/maps";

export interface AskPick {
  option: AskOption;
  day: string;
  part: DayPart;
  /** "Add Book <place> to To do", with who and by when (T10). */
  reservation: { assignee: string | null; due: string | null } | null;
}

interface Turn {
  request: string;
  refine: boolean;
  options: AskOption[];
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "the web";
  }
};

/**
 * Ask AI (T10, Mike's C59, C60 and C64; the 11/24 pod's version): ask for ideas and get three option
 * cards (or as many as asked for), each with why it fits, a price range, the best time, whether to book
 * ahead, the place on Google Maps and the page it was found on. Refine your request under the cards
 * sends the ask again ("cheaper", "Italian instead"); new cards come in under the earlier ones. Add
 * puts an option on the trip as Suggested on the day and part picked. The conversation is kept for the
 * person who asked and nobody else (C60).
 */
export function AskAiDialog({
  open,
  trip,
  travelers,
  meId,
  emptySlots,
  initialRequest,
  onClose,
  onAdd,
  onFillSlots,
}: {
  open: boolean;
  trip: Trip;
  travelers: Traveler[];
  meId: string | null;
  /** The trip's empty slots, "YYYY-MM-DD part", to pre-pick a day and part for each option. */
  emptySlots: string[];
  initialRequest?: string;
  onClose: () => void;
  onAdd: (pick: AskPick) => Promise<void>;
  /** The older Plan with AI: ideas for every empty slot at once. */
  onFillSlots?: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Ask AI">
      {open && <AskPanel {...{ trip, travelers, meId, emptySlots, initialRequest, onAdd, onFillSlots }} />}
    </Dialog>
  );
}

function AskPanel({
  trip,
  travelers,
  meId,
  emptySlots,
  initialRequest,
  onAdd,
  onFillSlots,
}: {
  trip: Trip;
  travelers: Traveler[];
  meId: string | null;
  emptySlots: string[];
  initialRequest?: string;
  onAdd: (pick: AskPick) => Promise<void>;
  onFillSlots?: () => void;
}) {
  const [request, setRequest] = useState(initialRequest ?? "");
  const [count, setCount] = useState(3);
  const [useTastes, setUseTastes] = useState(true);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [thread, setThread] = useState<string>(() => crypto.randomUUID());
  const [refine, setRefine] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tastesNote, setTastesNote] = useState<string | null>(null);
  const [added, setAdded] = useState<Record<string, true>>({});

  // Your last conversation on this trip, as you left it (kept for you alone, C60).
  useEffect(() => {
    if (initialRequest) return;
    let live = true;
    myAskTurns(trip.id).then((rows) => {
      if (!live || !rows?.length) return;
      const last = rows[rows.length - 1].thread_id;
      const mine = rows.filter((r) => r.thread_id === last);
      setThread(last);
      setRequest(mine[0].request);
      setTurns(mine.map((r, i) => ({ request: r.request, refine: i > 0, options: r.options })));
    });
    return () => {
      live = false;
    };
  }, [trip.id, initialRequest]);

  const ask = async (refineText: string | null) => {
    const base = turns.length && refineText != null ? turns[0].request : request.trim();
    if (!base) return;
    setBusy(true);
    setError(null);
    try {
      const refinements = refineText != null ? [...turns.slice(1).map((t) => t.request), refineText] : [];
      const shown = refineText != null ? turns.flatMap((t) => t.options.map((o) => `${o.title}${o.price_level ? ` (${o.price_level})` : ""}`)) : [];
      const r = await askAi(trip.id, base, refinements, shown, count, useTastes);
      setTastesNote(
        !useTastes ? null : r.tastes_used ? `Using ${r.taste_answers} people's preferences.` : "Preferences count once 3 people on the trip have answered.",
      );
      const turn = { request: refineText ?? base, refine: refineText != null, options: r.options };
      const id = refineText != null ? thread : crypto.randomUUID();
      if (refineText == null) setThread(id);
      setTurns((all) => (refineText != null ? [...all, turn] : [turn]));
      setRefine("");
      saveAskTurn(trip.id, id, turn.request, r.options).catch(() => {});
      if (!r.options.length) setError(r.note ?? "No options came back for that. Try saying it another way.");
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };

  return (
    <div className="space-y-3 text-white" data-testid="ask-ai">
      {turns.length === 0 && (
        <>
          <DarkField label="What would you like ideas for?">
            <textarea
              className="field-dark min-h-20"
              value={request}
              onChange={(e) => setRequest(e.target.value)}
              placeholder="A fondue dinner in Chamonix, a rainy-day museum in Barcelona..."
              aria-label="What would you like ideas for?"
              maxLength={600}
            />
          </DarkField>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2">
              Options
              <select className="field-dark !h-9 !w-16 !py-0" value={count} onChange={(e) => setCount(Number(e.target.value))} aria-label="How many options">
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-h-9 items-center gap-2">
              <input type="checkbox" className="size-5 accent-[#8c7054]" checked={useTastes} onChange={(e) => setUseTastes(e.target.checked)} />
              Consider group preferences
            </label>
          </div>
          <Button type="button" disabled={busy || !request.trim()} onClick={() => ask(null)}>
            <Wand2 /> {busy ? "Asking..." : "Ask"}
          </Button>
          {onFillSlots && (
            <button type="button" onClick={onFillSlots} className="block text-sm text-white/80 underline underline-offset-4">
              Or fill every empty slot with ideas at once
            </button>
          )}
        </>
      )}

      {turns.map((t, ti) => (
        <section key={ti} aria-label={t.refine ? `Refined: ${t.request}` : `Asked: ${t.request}`} className="space-y-2">
          <p className="text-sm text-white/70">
            {t.refine ? "Refined: " : "You asked: "}
            <span className="font-semibold text-white">{t.request}</span>
          </p>
          <ul className="space-y-2" data-testid="ask-options">
            {t.options.map((o, oi) => (
              <OptionCard
                key={`${ti}-${oi}`}
                option={o}
                trip={trip}
                travelers={travelers}
                meId={meId}
                emptySlots={emptySlots}
                added={Boolean(added[`${ti}-${oi}`])}
                onAdd={async (pick) => {
                  await onAdd(pick);
                  setAdded((a) => ({ ...a, [`${ti}-${oi}`]: true }));
                }}
              />
            ))}
          </ul>
        </section>
      ))}

      {turns.length > 0 && (
        <div className="space-y-2 rounded-2xl border border-white/15 bg-white/5 p-3">
          <DarkField label="Refine your request">
            <div className="flex gap-2">
              <input
                className="field-dark min-w-0 flex-1"
                value={refine}
                onChange={(e) => setRefine(e.target.value)}
                placeholder="Cheaper, Italian instead, closer to the chalet..."
                aria-label="Refine your request"
                maxLength={600}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && refine.trim()) {
                    e.preventDefault();
                    ask(refine.trim());
                  }
                }}
              />
              <Button type="button" disabled={busy || !refine.trim()} onClick={() => ask(refine.trim())} aria-label="Refine">
                <Send />
              </Button>
            </div>
          </DarkField>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-white/70">
            <label className="flex min-h-9 items-center gap-2">
              <input type="checkbox" className="size-5 accent-[#8c7054]" checked={useTastes} onChange={(e) => setUseTastes(e.target.checked)} />
              Consider group preferences
            </label>
            <button
              type="button"
              className="min-h-9 underline underline-offset-4"
              onClick={async () => {
                await clearAskTurns(trip.id).catch(() => {});
                setTurns([]);
                setRequest("");
                setTastesNote(null);
              }}
            >
              New ask
            </button>
          </div>
          {busy && <p className="text-sm text-white/80">Asking...</p>}
        </div>
      )}
      {tastesNote && <p className="text-xs text-white/70" data-testid="tastes-note">{tastesNote}</p>}
      {error && (
        <p role="alert" className="rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      )}
      <p className="text-xs text-white/60">Your asks are kept for you alone. What you add goes on the trip as Suggested, for everyone to see and vote on.</p>
    </div>
  );
}

function OptionCard({
  option: o,
  trip,
  travelers,
  meId,
  emptySlots,
  added,
  onAdd,
}: {
  option: AskOption;
  trip: Trip;
  travelers: Traveler[];
  meId: string | null;
  emptySlots: string[];
  added: boolean;
  onAdd: (pick: AskPick) => Promise<void>;
}) {
  // An empty slot in its best part, else the first empty slot, else the trip's first day.
  const firstFit = emptySlots.find((s) => s.endsWith(` ${o.best_part}`)) ?? emptySlots[0] ?? `${trip.start_date} ${o.best_part}`;
  const [day, setDay] = useState(firstFit.slice(0, 10));
  const [part, setPart] = useState<DayPart>(o.best_part);
  const [book, setBook] = useState(o.needs_reservation);
  const [assignee, setAssignee] = useState(meId ?? "");
  const [due, setDue] = useState("");
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const days = tripDays(trip.start_date, trip.end_date);

  return (
    <li className="rounded-2xl border border-white/15 bg-white/5 p-3" data-testid="ask-option">
      <p className="flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="font-display text-lg font-semibold">{o.title}</span>
        {o.price_level && <span className="text-sm font-semibold text-amber-200" aria-label={`Price ${o.price_level}`}>{o.price_level}</span>}
      </p>
      {o.description && <p className="text-sm text-white/85">{o.description}</p>}
      {o.why && <p className="mt-1 text-xs text-white/75">Why: {o.why}</p>}
      <p className="mt-1 text-xs text-white/75">
        Best {PART_LABEL[o.best_part].toLowerCase()}
        {o.best_time ? `, ${o.best_time}` : ""}
        {o.needs_reservation ? " · book ahead" : ""}
      </p>
      <a href={mapsLink(o.title, o.location)} target="_blank" rel="noreferrer" data-testid="maps-link" className="mt-1 flex max-w-full items-center gap-1 text-sm font-semibold text-white underline underline-offset-2">
        <MapPin className="size-3.5 shrink-0" />
        <span className="truncate">Open in Google Maps</span>
      </a>
      <a href={o.source_url} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1 text-xs text-amber-200 underline underline-offset-2">
        <ExternalLink className="size-3 shrink-0" />
        <span className="truncate">Found on {hostOf(o.source_url)}</span>
      </a>
      {added ? (
        <p className="mt-2 flex items-center gap-1 text-sm font-semibold text-green-200">
          <CalendarCheck className="size-4" /> Added as Suggested
        </p>
      ) : !picking ? (
        <Button type="button" size="sm" className="mt-2" onClick={() => setPicking(true)}>
          <Plus /> Add
        </Button>
      ) : (
        <div className="mt-2 space-y-2" role="group" aria-label={`Add ${o.title}`}>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <select className="field-dark !h-10 !py-0 text-sm" value={day} onChange={(e) => setDay(e.target.value)} aria-label={`Day for ${o.title}`}>
              {days.map((d) => (
                <option key={d} value={d}>
                  {longDay(d)}
                </option>
              ))}
            </select>
            <select className="field-dark !h-10 !w-28 !py-0 text-sm" value={part} onChange={(e) => setPart(e.target.value as DayPart)} aria-label={`Part of the day for ${o.title}`}>
              {PARTS.map((p) => (
                <option key={p} value={p}>
                  {PART_LABEL[p]}
                </option>
              ))}
            </select>
          </div>
          {o.needs_reservation && (
            <div className="space-y-2 rounded-xl bg-white/5 p-2">
              <label className="flex min-h-9 items-center gap-2 text-sm">
                <input type="checkbox" className="size-5 accent-[#8c7054]" checked={book} onChange={(e) => setBook(e.target.checked)} />
                Add "Book {o.title}" to To do
              </label>
              {book && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <select className="field-dark !h-10 !py-0 text-sm" value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label="Who books it">
                    <option value="">Nobody yet</option>
                    {travelers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                        {t.id === meId ? " (you)" : ""}
                      </option>
                    ))}
                  </select>
                  <input type="date" className="field-dark !h-10 text-sm" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Book by" />
                </div>
              )}
            </div>
          )}
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onAdd({
                  option: o,
                  day,
                  part,
                  reservation: o.needs_reservation && book ? { assignee: assignee || null, due: due && dueDayOk(due, trip.end_date) ? due : null } : null,
                });
              } finally {
                setBusy(false);
              }
            }}
          >
            <Plus /> Add as Suggested
          </Button>
        </div>
      )}
    </li>
  );
}
