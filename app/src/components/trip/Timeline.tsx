import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { BedDouble, Bus, Check, ChevronDown, CornerDownRight, MapPin, Palmtree, Plane, Plus, Sparkles, ThumbsUp, UtensilsCrossed, type LucideIcon } from "lucide-react";
import {
  clock,
  dayChip,
  longDay,
  PART_LABEL,
  PARTS,
  priceLabel,
  STATUS_LABEL,
  type DayPart,
  type Item,
  type ItemKind,
} from "../../lib/model";
import { dayLayout, type Placement, type Run, type Segment, type TimelineDay, type StayOnDay } from "../../lib/timeline";
import { canDrag, chipId, foldId, justDropped, slotId, quietPress } from "../../lib/move";
import type { GoingBadge } from "../../lib/initials";

export const KIND_ICON: Record<ItemKind, LucideIcon> = {
  activity: Palmtree,
  meal: UtensilsCrossed,
  transport: Bus,
  flight: Plane,
  stay: BedDouble,
};

export interface TimelineActions {
  canEdit: boolean;
  onAdd: (day: string, part: DayPart, kind?: ItemKind) => void;
  onOpen: (item: Item) => void;
  /** Exact price for a confirmed item, when it has one (Build 3). */
  exactCents?: (item: Item) => number | null;
  /** Its cost is in (a bill, or everyone's own line): the green $ check (C21: Confirmed alone is a plain check). */
  paid?: (item: Item) => boolean;
  /** Whether the viewer has opted out of this item (Build 3). */
  isOut?: (item: Item) => boolean;
  /** A short line on the card: "Your share $40", or "3 of 4 in" (Build 3). */
  note?: (item: Item) => string | null;
  /** Who's on a flight or transfer, and whether that's the whole group: on an overnight one, they need no bed. */
  aboard?: (item: Item) => { names: string[]; everyone: boolean };
  /** Who's in, as initials on the card, or Everyone (Mike's 11/19 review); null on a trip of one. */
  going?: (item: Item) => GoingBadge | null;
  /** Thumbs up on a Suggested plan: how many, and whether yours is one (11/23 review, item 7). Null hides it. */
  votes?: (item: Item) => { count: number; mine: boolean } | null;
  /** On a Suggested plan: "Suggested by Jordan", or "AI idea, kept by you". */
  suggestedBy?: (item: Item) => string | null;
  /** Drag and drop (Owners, Day by day view): move a plan to a day and part. */
  onMove?: (item: Item, day: string, part: DayPart) => void;
}

/** Opens a plan, unless the tap was the end of a drag. */
const open = (actions: TimelineActions, item: Item) => {
  if (!justDropped()) actions.onOpen(item);
};

/** "Everyone's on it" covers tonight: no prompt for a stay. */
const nightCovered = (overnight: Item[], actions: TimelineActions): boolean =>
  overnight.some((i) => actions.aboard?.(i).everyone);

/** Sticky, horizontally scrolling day chips showing the actual day: "Thu" over "2/5". */
export function DayChips({ days, active, onPick }: { days: TimelineDay[]; active: string | null; onPick: (d: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>(`[data-day="${active}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);

  return (
    <nav
      ref={ref}
      aria-label="Days"
      className="glass-bar sticky top-14 z-30 -mx-4 flex gap-1.5 overflow-x-auto border-x-0 border-t-0 border-b border-white/10 px-4 py-2 sm:top-16 sm:-mx-6 sm:gap-2 sm:px-6 lg:top-28"
    >
      {days.map((d) => (
        <DayChip key={d.date} day={d} on={d.date === active} onPick={onPick} />
      ))}
    </nav>
  );
}

function DayChip({ day, on, onPick }: { day: TimelineDay; on: boolean; onPick: (d: string) => void }) {
  // A drop target while a plan is dragged: drop it here to move it to this day.
  const { setNodeRef, isOver } = useDroppable({ id: chipId(day.date) });
  return (
    <button
      ref={setNodeRef}
      data-day={day.date}
      data-over={isOver || undefined}
      onClick={() => onPick(day.date)}
      aria-current={on ? "date" : undefined}
      className={`flex min-w-[46px] shrink-0 flex-col items-center rounded-2xl px-2 py-1.5 transition-colors ${
        on ? "bg-primary text-primary-foreground shadow-md shadow-primary/25" : "glass hover:bg-primary/15"
      } ${isOver ? "ring-2 ring-primary ring-offset-2 ring-offset-white/60" : ""}`}
    >
      <span className={`font-display text-[11px] font-bold ${on ? "text-white" : "text-foreground"}`}>{day.chip.weekday}</span>
      <span className="text-sm font-semibold">{day.chip.date}</span>
    </button>
  );
}

/** A slot a plan runs on into: the same plan, shown lightly, with no price or status of its own. */
function ContinuedCard({ item, label, actions, tall = false }: { item: Item; label: string | null; actions: TimelineActions; tall?: boolean }) {
  const out = actions.isOut?.(item) ?? false;
  return (
    <button
      type="button"
      className={`item-card !py-2 ${tall ? "h-full" : ""}`}
      data-kind={item.kind}
      data-status={item.status}
      data-out={out}
      data-continued="true"
      onClick={() => open(actions, item)}
      aria-label={`${item.title}, ${label ?? "continues"}`}
    >
      <div className="flex items-center gap-2.5">
        <CornerDownRight className="size-3.5 shrink-0 opacity-60" aria-hidden />
        <p className={`min-w-0 flex-1 truncate text-sm `}>{item.title}</p>
        {label && <span className="shrink-0 text-[11px] text-foreground/75">{label}</span>}
      </div>
    </button>
  );
}

function ItemCard({ item, placed, actions, tall = false }: { item: Item; placed?: Placement; actions: TimelineActions; tall?: boolean }) {
  return actions.onMove && actions.canEdit && canDrag(item) ? (
    <DraggableCard item={item} placed={placed} actions={actions} tall={tall} />
  ) : (
    <CardButton item={item} placed={placed} actions={actions} tall={tall} />
  );
}

/** One plan's run of parts on a day (T5): the card where it starts, a slim line where it runs on. */
function RunView({ run, actions, tall = false }: { run: Run; actions: TimelineActions; tall?: boolean }) {
  return run.first ? (
    <ItemCard item={run.item} placed={{ first: true, label: run.label }} actions={actions} tall={tall} />
  ) : (
    <ContinuedCard item={run.item} label={run.label} actions={actions} tall={tall} />
  );
}

/**
 * Parts held together by plans that run across them (T5): one block over those rows. Each run is
 * one card (or line) as tall as the parts it covers; overlapping runs sit side by side, and a plan
 * in one part inside the block gets a column of its own. Each part keeps its own drop target.
 */
function SegmentBlock({ day, seg, actions }: { day: string; seg: Segment; actions: TimelineActions }) {
  const rows = PARTS.slice(seg.from, seg.to + 1);
  const singles = rows.some((p) => (seg.singles[p] ?? []).length > 0);
  const cols = seg.lanes.length + (singles ? 1 : 0);
  return (
    <div
      className="grid min-w-0 gap-x-2"
      data-segment={`${PARTS[seg.from]}-${PARTS[seg.to]}`}
      style={{ gridColumn: 2, gridRow: `${seg.from + 1} / ${seg.to + 2}`, gridTemplateRows: "subgrid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {rows.map((part, r) => (
        <Slot key={part} day={day} part={part} style={{ gridRow: r + 1, gridColumn: singles ? cols : "1 / -1" }}>
          {(seg.singles[part] ?? []).map((run) => (
            <RunView key={run.item.id} run={run} actions={actions} />
          ))}
        </Slot>
      ))}
      {seg.lanes.map((lane, li) =>
        lane.map((run) => (
          <div
            key={run.item.id}
            className="relative z-10 min-w-0"
            data-span={`${PARTS[run.from]}-${PARTS[run.to]}`}
            data-slots={PARTS.slice(run.from, run.to + 1)
              .map((p) => slotId(day, p))
              .join(" ")}
            style={{ gridColumn: li + 1, gridRow: `${run.from - seg.from + 1} / ${run.to - seg.from + 2}` }}
          >
            <RunView run={run} actions={actions} tall />
          </div>
        )),
      )}
    </div>
  );
}

/** A plan an Owner can drag: press and hold on a phone, or drag a few pixels with a mouse. */
function DraggableCard({ item, placed, actions, tall }: { item: Item; placed?: Placement; actions: TimelineActions; tall?: boolean }) {
  const { setNodeRef, listeners, isDragging } = useDraggable({ id: item.id, data: { item } });
  return <CardButton item={item} placed={placed} actions={actions} tall={tall} drag={{ ref: setNodeRef, listeners, isDragging }} />;
}

interface Drag {
  ref: (el: HTMLElement | null) => void;
  listeners: ReturnType<typeof useDraggable>["listeners"];
  isDragging: boolean;
}

/** Confirmed: the green "$ ✓" once its cost is in, a plain green check before (C21, 11/20). */
function ConfirmedBadge({ paid, className = "" }: { paid: boolean; className?: string }) {
  return (
    <span
      className={`flex h-5 items-center gap-0.5 rounded-full bg-green-500/20 px-1.5 text-[10px] font-bold text-green-700 ${className}`}
      title={paid ? "Confirmed and paid" : "Confirmed"}
      data-testid={paid ? "badge-paid" : "badge-confirmed"}
    >
      {paid && "$ "}
      <Check className="size-3" strokeWidth={3} />
    </span>
  );
}

/** Who's in, at the end of a card's details: a few initials and +N, or Everyone. */
function GoingFaces({ badge }: { badge: GoingBadge }) {
  return (
    <span className="ml-auto flex items-center" role="img" aria-label={badge.label} title={badge.label} data-testid="going">
      {badge.everyone ? (
        <span className="text-[11px] font-medium text-foreground/75">Everyone</span>
      ) : (
        <span className="flex -space-x-0.5">
          {badge.shown.map((p) => (
            <span
              key={p.id}
              className="grid size-6 place-items-center rounded-full bg-[#efe6da] text-[9px] font-bold tracking-tight text-foreground ring-2 ring-white"
            >
              {p.initials}
            </span>
          ))}
          {badge.more > 0 && (
            <span className="grid h-6 min-w-6 place-items-center rounded-full bg-[#e9e7e3] px-1 text-[9px] font-bold text-foreground ring-2 ring-white">
              +{badge.more}
            </span>
          )}
        </span>
      )}
    </span>
  );
}

function CardButton({ item, placed, actions, drag, tall = false }: { item: Item; placed?: Placement; actions: TimelineActions; drag?: Drag; tall?: boolean }) {
  const Icon = item.status === "suggested" ? Sparkles : KIND_ICON[item.kind];
  const price = priceLabel(item, actions.exactCents?.(item));
  const out = actions.isOut?.(item) ?? false;
  const confirmed = item.status === "confirmed";
  const going = actions.going?.(item) ?? null;
  const votes = item.status === "suggested" ? (actions.votes?.(item) ?? null) : null;

  return (
    <button
      type="button"
      ref={drag?.ref}
      {...drag?.listeners}
      onTouchStart={
        drag
          ? (e) => {
              quietPress();
              drag.listeners?.onTouchStart?.(e);
            }
          : undefined
      }
      className={`item-card ${tall ? "h-full" : ""} ${drag ? "draggable-card" : ""} ${drag?.isDragging ? "opacity-40" : ""}`}
      data-kind={item.kind}
      data-status={item.status}
      data-out={out}
      data-draggable={drag ? "true" : undefined}
      onClick={() => open(actions, item)}
      aria-label={`${item.title}, ${STATUS_LABEL[item.status]}${out ? ", you're out" : ""}${going ? `. ${going.label}` : ""}`}
    >
      {confirmed && <ConfirmedBadge paid={actions.paid?.(item) ?? true} className="absolute right-2 top-2" />}
      <div className="flex items-start gap-2.5">
        <Icon
          className={`mt-0.5 size-4 shrink-0 ${item.status === "suggested" ? "text-primary" : "opacity-70"}`}
          aria-hidden
        />
        <div className={`min-w-0 flex-1 ${confirmed ? "pr-10" : ""}`}>
          <p className={`truncate text-sm ${"font-medium"}`}>
            {item.title}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            {item.location && (
              <span className="flex min-w-0 items-center gap-1">
                <MapPin className="size-3 shrink-0" />
                <span className="truncate">{item.location}</span>
              </span>
            )}
            {price && (
              <span className={item.status === "confirmed" ? "font-semibold text-foreground" : "text-muted-foreground"}>
                {price}
              </span>
            )}
            {item.status !== "confirmed" && (
              <span className="label-luxury text-[9px] text-muted-foreground" data-testid="status-label">
                {(item.status === "suggested" && actions.suggestedBy?.(item)) || STATUS_LABEL[item.status]}
              </span>
            )}
            {placed?.label && <span className="text-[11px] font-medium text-foreground/80">{placed.label}</span>}
            {out && <span className="text-[11px]">{item.kind === "flight" ? "Not your flight" : "You're out"}</span>}
            {!out && actions.note?.(item) && <span className="text-[11px] text-foreground/75">{actions.note(item)}</span>}
            {votes && votes.count > 0 && (
              <span
                className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${votes.mine ? "bg-primary text-primary-foreground" : "bg-[#efe6da] text-foreground"}`}
                data-testid="votes"
                aria-label={`${votes.count} ${votes.count === 1 ? "person wants" : "people want"} this${votes.mine ? ", you included" : ""}`}
              >
                <ThumbsUp className="size-3" aria-hidden /> {votes.count}
              </span>
            )}
            {going && <GoingFaces badge={going} />}
          </div>
        </div>
      </div>
    </button>
  );
}

function StayRow({ stay, actions }: { stay: StayOnDay; actions: TimelineActions }) {
  const { item } = stay;
  const suggested = item.status === "suggested";
  const price = priceLabel(item, actions.exactCents?.(item));
  return (
    <button type="button" className="item-card" data-kind="stay" data-status={item.status} onClick={() => open(actions, item)}>
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary/10">
          {suggested ? <Sparkles className="size-4 text-primary" /> : <BedDouble className="size-4 text-primary" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="label-luxury text-[9px] text-muted-foreground">{stay.label}</p>
          <p className={`truncate text-sm ${"font-medium"}`}>{item.title}</p>
          {item.location && (
            <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
              <MapPin className="size-3 shrink-0" /> {item.location}
            </p>
          )}
        </div>
        {!stay.checkout && price && (
          <span className={`shrink-0 text-xs ${item.status === "confirmed" ? "font-semibold" : "text-muted-foreground"}`}>
            {price}
          </span>
        )}
        {item.status === "confirmed" && !stay.checkout && <ConfirmedBadge paid={actions.paid?.(item) ?? true} className="shrink-0" />}
      </div>
    </button>
  );
}

/** A red-eye or a night train in the stay row: who's on it needs no bed tonight (11/17 pod feedback). */
function OvernightRow({ item, actions }: { item: Item; actions: TimelineActions }) {
  const Icon = KIND_ICON[item.kind];
  const aboard = actions.aboard?.(item);
  const lands = item.end_day ? `${item.kind === "flight" ? "Lands" : "Arrives"} ${dayChip(item.end_day).weekday}${item.end_time ? ` ${clock(item.end_time)}` : ""}` : null;
  const who = !aboard
    ? null
    : aboard.everyone
      ? "Everyone's on it, so no stay needed tonight"
      : aboard.names.length
        ? `No stay needed for ${aboard.names.join(", ")}`
        : "No one's on it yet";
  return (
    <button type="button" className="item-card" data-kind={item.kind} data-status={item.status} data-testid="overnight" onClick={() => open(actions, item)}>
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-indigo/10">
          <Icon className="size-4 text-indigo" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="label-luxury text-[9px] text-muted-foreground">Overnight{lands ? ` · ${lands}` : ""}</p>
          <p className="truncate text-sm font-medium">{item.title}</p>
          {who && <p className="text-xs text-foreground/75">{who}</p>}
        </div>
      </div>
    </button>
  );
}

function EmptySlot({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-11 w-full items-center gap-2 rounded-2xl border-2 border-dashed border-white/55 bg-white/25 px-3 text-left text-sm italic text-foreground transition-colors hover:border-primary/50 hover:text-primary"
    >
      <Plus className="size-4 shrink-0" /> {label}
    </button>
  );
}

/** A part of a day, as a drop target while a plan is dragged. */
function Slot({ day, part, children, style, className = "" }: { day: string; part: DayPart; children?: ReactNode; style?: CSSProperties; className?: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: slotId(day, part) });
  return (
    <div
      ref={setNodeRef}
      data-slot={slotId(day, part)}
      data-over={isOver || undefined}
      style={style}
      className={`min-w-0 space-y-2 rounded-2xl transition-colors ${isOver ? "bg-primary/15 outline-2 outline-offset-4 outline-dashed outline-primary" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

/** An empty day on a phone: one row. Tap it to see its slots; a plan dragged onto it moves to that day. */
function FoldedDay({ day, actions, onOpen }: { day: TimelineDay; actions: TimelineActions; onOpen: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: foldId(day.date) });
    return (
      <section
        ref={setNodeRef}
        id={`day-${day.date}`}
        data-date={day.date}
        data-folded
        data-over={isOver || undefined}
        className={`scroll-mt-32 rounded-2xl py-2 transition-colors sm:scroll-mt-36 lg:scroll-mt-48 ${isOver ? "bg-primary/15 outline-2 outline-dashed outline-primary" : ""}`} aria-label={longDay(day.date)}>
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-expanded={false}
            aria-label={`Show ${longDay(day.date)}: nothing planned yet`}
            onClick={onOpen}
            className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-2xl text-left"
          >
            <span className="glass grid size-11 shrink-0 place-items-center rounded-2xl !bg-white/85">
              <span className="font-display text-base font-bold text-gold-dark">{dayChip(day.date).date.split("/")[1]}</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-display text-base font-semibold">{day.title || "Free day"}</span>
              <span className="label-luxury block text-foreground">
                {longDay(day.date)} · <span className="normal-case tracking-normal">nothing planned yet</span>
              </span>
            </span>
            <ChevronDown className="size-5 shrink-0 text-foreground/70" />
          </button>
          {actions.canEdit && (
            <button
              type="button"
              onClick={() => actions.onAdd(day.date, "day")}
              className="glass grid size-11 shrink-0 place-items-center rounded-full border-white/30 text-muted-foreground transition-all hover:bg-primary/15 hover:text-primary"
              aria-label={`Add a plan on ${longDay(day.date)}`}
            >
              <Plus className="size-4" />
            </button>
          )}
        </div>
      </section>
    );
}

export function DayBlock({
  day,
  last,
  actions,
  foldEmpty = false,
  startOpen = false,
}: {
  day: TimelineDay;
  last: boolean;
  actions: TimelineActions;
  /**
   * A phone: a day with nothing on it folds to one row (11/23 review, item 9: 12 empty days were
   * about 4,900 px of scrolling). A day with any plan or stay always shows whole, so a gap like
   * Thursday night still stands out. Laptops keep every slot in view.
   */
  foldEmpty?: boolean;
  /** Start this day unfolded even though it's empty (the first day of a trip with no plans yet). */
  startOpen?: boolean;
}) {
  const nights = day.stays.filter((s) => !s.checkout);
  const covered = nightCovered(day.overnight, actions);
  const layout = dayLayout(day);
  const [open, setOpen] = useState(startOpen);
  const empty = PARTS.every((p) => day.parts[p].length === 0) && day.stays.length === 0 && day.overnight.length === 0;
  const folded = foldEmpty && empty && !open;
  if (folded) return <FoldedDay day={day} actions={actions} onOpen={() => setOpen(true)} />;
  return (
    <section id={`day-${day.date}`} data-date={day.date} className="scroll-mt-32 py-4 sm:scroll-mt-36 lg:scroll-mt-48" aria-label={longDay(day.date)}>
      <header className="mb-3 flex items-center gap-3">
        <div className="glass grid size-11 shrink-0 place-items-center rounded-2xl !bg-white/85">
          <span className="font-display text-base font-bold text-gold-dark">{dayChip(day.date).date.split("/")[1]}</span>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-base font-semibold sm:text-lg">{day.title || "Free day"}</h3>
          <p className="label-luxury text-foreground">{longDay(day.date)}</p>
        </div>
        {actions.canEdit && (
          <button
            type="button"
            onClick={() => actions.onAdd(day.date, "day")}
            className="glass grid size-10 shrink-0 place-items-center rounded-full border-white/30 text-muted-foreground transition-all hover:bg-primary/15 hover:text-primary"
            aria-label={`Add a plan on ${longDay(day.date)}`}
          >
            <Plus className="size-4" />
          </button>
        )}
      </header>

      {/* One row per part of the day. A plan running across parts is one card over those rows (T5). */}
      <div className="relative grid grid-cols-[60px_minmax(0,1fr)] gap-x-4 gap-y-2 py-1 sm:ml-14">
        <div className="absolute bottom-0 left-[68px] top-0 w-px bg-foreground/10" aria-hidden />
        {PARTS.map((part, i) => (
          // A faint light backing: on darker photos the bare label fell just under 4.5:1.
          <div key={`label-${part}`} className="pt-3" style={{ gridColumn: 1, gridRow: i + 1 }}>
            <span className="label-luxury -ml-1.5 inline-block rounded-md bg-background/45 px-1.5 py-0.5 text-foreground">{PART_LABEL[part]}</span>
          </div>
        ))}
        {PARTS.map((part, i) => {
          const seg = layout.segments.find((g) => g.from <= i && i <= g.to);
          if (seg) return seg.from === i ? <SegmentBlock key={`seg-${part}`} day={day.date} seg={seg} actions={actions} /> : null;
          const runs = layout.parts[part] ?? [];
          return (
            <Slot key={part} day={day.date} part={part} style={{ gridColumn: 2, gridRow: i + 1 }}>
              {runs.map((run) => (
                <RunView key={run.item.id} run={run} actions={actions} />
              ))}
              {runs.length === 0 &&
                (actions.canEdit ? (
                  <EmptySlot label={`Add to ${PART_LABEL[part].toLowerCase()}`} onClick={() => actions.onAdd(day.date, part)} />
                ) : (
                  <p className="py-3 text-xs italic text-muted-foreground/70">Nothing planned</p>
                ))}
            </Slot>
          );
        })}
      </div>

      <div className="mt-3 space-y-2 border-t border-foreground/10 pt-3 sm:ml-14">
        {day.stays.map((s) => (
          <StayRow key={`${s.item.id}-${s.label}`} stay={s} actions={actions} />
        ))}
        {day.overnight.map((i) => (
          <OvernightRow key={`overnight-${i.id}`} item={i} actions={actions} />
        ))}
        {nights.length === 0 && !last && actions.canEdit && !covered && (
          <EmptySlot
            label={day.overnight.length ? "Add a stay for the others" : "Add where everyone's staying"}
            onClick={() => actions.onAdd(day.date, "night", "stay")}
          />
        )}
        {nights.length === 0 && !last && !actions.canEdit && !covered && day.overnight.length === 0 && (
          <p className="text-xs italic text-muted-foreground/70">No stay added for tonight</p>
        )}
      </div>
    </section>
  );
}

/** Tracks which day is at the top of the screen, for the day chips. */
export function useActiveDay(dates: string[]): [string | null, (d: string) => void] {
  const [active, setActive] = useState<string | null>(dates[0] ?? null);
  const key = dates.join(",");
  useEffect(() => {
    const sections = dates
      .map((d) => document.getElementById(`day-${d}`))
      .filter((el): el is HTMLElement => Boolean(el));
    const observer = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActive((top.target as HTMLElement).dataset.date ?? null);
      },
      { rootMargin: "-140px 0px -55% 0px" },
    );
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const jump = (d: string) => {
    setActive(d);
    document.getElementById(`day-${d}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return [active, jump];
}
