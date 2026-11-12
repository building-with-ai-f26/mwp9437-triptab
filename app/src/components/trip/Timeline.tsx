import { useEffect, useRef, useState } from "react";
import { BedDouble, Bus, Check, MapPin, Palmtree, Plane, Plus, Sparkles, UtensilsCrossed, type LucideIcon } from "lucide-react";
import {
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
import type { TimelineDay, StayOnDay } from "../../lib/timeline";

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
  /** Whether the viewer has opted out of this item (Build 3). */
  isOut?: (item: Item) => boolean;
}

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
      className="glass-card sticky top-14 z-30 -mx-4 flex gap-1.5 overflow-x-auto border-x-0 border-t-0 border-b border-white/10 px-4 py-2 sm:top-16 sm:-mx-6 sm:gap-2 sm:px-6"
    >
      {days.map((d) => {
        const on = d.date === active;
        return (
          <button
            key={d.date}
            data-day={d.date}
            onClick={() => onPick(d.date)}
            aria-current={on ? "date" : undefined}
            className={`flex min-w-[46px] shrink-0 flex-col items-center rounded-2xl px-2 py-1.5 transition-colors ${
              on ? "bg-primary text-primary-foreground shadow-md shadow-primary/25" : "glass hover:bg-primary/15"
            }`}
          >
            <span className={`font-display text-[11px] font-bold ${on ? "text-white/85" : "text-muted-foreground"}`}>
              {d.chip.weekday}
            </span>
            <span className="text-sm font-semibold">{d.chip.date}</span>
          </button>
        );
      })}
    </nav>
  );
}

function ItemCard({ item, actions }: { item: Item; actions: TimelineActions }) {
  const Icon = item.status === "suggested" ? Sparkles : KIND_ICON[item.kind];
  const price = priceLabel(item, actions.exactCents?.(item));
  const out = actions.isOut?.(item) ?? false;
  const confirmed = item.status === "confirmed";

  return (
    <button
      type="button"
      className="item-card"
      data-kind={item.kind}
      data-status={item.status}
      data-out={out}
      onClick={() => actions.onOpen(item)}
      aria-label={`${item.title}, ${STATUS_LABEL[item.status]}${out ? ", you're out" : ""}`}
    >
      {confirmed && (
        <span
          className="absolute right-2 top-2 flex h-5 items-center gap-0.5 rounded-full bg-green-500/20 px-1.5 text-[10px] font-bold text-green-700"
          title="Confirmed and paid"
        >
          $ <Check className="size-3" strokeWidth={3} />
        </span>
      )}
      <div className="flex items-start gap-2.5">
        <Icon
          className={`mt-0.5 size-4 shrink-0 ${item.status === "suggested" ? "text-primary/50" : "opacity-70"}`}
          aria-hidden
        />
        <div className={`min-w-0 flex-1 ${confirmed ? "pr-10" : ""}`}>
          <p className={`truncate text-sm ${item.status === "suggested" ? "italic text-muted-foreground" : "font-medium"}`}>
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
              <span className={item.status === "confirmed" ? "font-semibold text-foreground" : "text-muted-foreground/80"}>
                {price}
              </span>
            )}
            {item.status !== "confirmed" && (
              <span className="label-luxury text-[9px] text-muted-foreground/70">{STATUS_LABEL[item.status]}</span>
            )}
            {out && <span className="text-[11px]">You're out</span>}
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
    <button type="button" className="item-card" data-kind="stay" data-status={item.status} onClick={() => actions.onOpen(item)}>
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary/10">
          {suggested ? <Sparkles className="size-4 text-primary/50" /> : <BedDouble className="size-4 text-primary" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="label-luxury text-[9px] text-muted-foreground">{stay.label}</p>
          <p className={`truncate text-sm ${suggested ? "italic text-muted-foreground" : "font-medium"}`}>{item.title}</p>
          {item.location && (
            <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
              <MapPin className="size-3 shrink-0" /> {item.location}
            </p>
          )}
        </div>
        {!stay.checkout && price && (
          <span className={`shrink-0 text-xs ${item.status === "confirmed" ? "font-semibold" : "text-muted-foreground/80"}`}>
            {price}
          </span>
        )}
        {item.status === "confirmed" && !stay.checkout && (
          <span className="flex h-5 shrink-0 items-center gap-0.5 rounded-full bg-green-500/20 px-1.5 text-[10px] font-bold text-green-700">
            $ <Check className="size-3" strokeWidth={3} />
          </span>
        )}
      </div>
    </button>
  );
}

function EmptySlot({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-11 w-full items-center gap-2 rounded-2xl border-2 border-dashed border-white/55 bg-white/10 px-3 text-left text-sm italic text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
    >
      <Plus className="size-4 shrink-0" /> {label}
    </button>
  );
}

export function DayBlock({ day, last, actions }: { day: TimelineDay; last: boolean; actions: TimelineActions }) {
  const nights = day.stays.filter((s) => !s.checkout);
  return (
    <section id={`day-${day.date}`} data-date={day.date} className="scroll-mt-32 py-4 sm:scroll-mt-36" aria-label={longDay(day.date)}>
      <header className="mb-3 flex items-center gap-3">
        <div className="glass grid size-11 shrink-0 place-items-center rounded-2xl bg-white/25">
          <span className="font-display text-base font-bold text-primary">{dayChip(day.date).date.split("/")[1]}</span>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-base font-semibold sm:text-lg">{day.title || "Free day"}</h3>
          <p className="label-luxury text-muted-foreground">{longDay(day.date)}</p>
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

      <div className="relative sm:ml-14">
        <div className="absolute bottom-0 left-[68px] top-0 w-px bg-foreground/10" aria-hidden />
        {PARTS.map((part) => {
          const items = day.parts[part];
          return (
            <div key={part} className="grid grid-cols-[60px_1fr] gap-4 py-1">
              <div className="label-luxury pt-3.5 text-muted-foreground">{PART_LABEL[part]}</div>
              <div className="min-w-0 space-y-2">
                {items.map((item) => (
                  <ItemCard key={item.id} item={item} actions={actions} />
                ))}
                {items.length === 0 &&
                  (actions.canEdit ? (
                    <EmptySlot label={`Add to ${PART_LABEL[part].toLowerCase()}`} onClick={() => actions.onAdd(day.date, part)} />
                  ) : (
                    <p className="py-3 text-xs italic text-muted-foreground/70">Nothing planned</p>
                  ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 space-y-2 border-t border-foreground/10 pt-3 sm:ml-14">
        {day.stays.map((s) => (
          <StayRow key={`${s.item.id}-${s.label}`} stay={s} actions={actions} />
        ))}
        {nights.length === 0 && !last && actions.canEdit && (
          <EmptySlot label="Add where everyone's staying" onClick={() => actions.onAdd(day.date, "night", "stay")} />
        )}
        {nights.length === 0 && !last && !actions.canEdit && (
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
