import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { PART_LABEL, PARTS, priceLabel, type Item } from "../../lib/model";
import { dayLayout, weeks, type Placement, type Run, type TimelineDay } from "../../lib/timeline";
import type { TimelineActions } from "./Timeline";

/**
 * The week view (vision, "The itinerary as a timeline"): seven days side by side, morning to
 * night, like an Outlook calendar, with where everyone's staying along the bottom. On a phone the
 * grid scrolls sideways inside its card.
 */
export function WeekView({ days, actions }: { days: TimelineDay[]; actions: TimelineActions }) {
  const all = weeks(days);
  const [w, setW] = useState(0);
  const week = all[Math.min(w, all.length - 1)] ?? [];
  // Narrow columns so a whole week fits beside the sidebar on desktop; names truncate (full name
  // on hover and in the plan's dialog). On a phone the grid scrolls sideways inside its card.
  const cols = { gridTemplateColumns: `64px repeat(${week.length}, minmax(86px, 1fr))`, minWidth: `${64 + week.length * 86}px` };

  const chip = (item: Item, placed?: Placement, tall = false) => {
    const out = actions.isOut?.(item) ?? false;
    // One plan, one cost: the price shows where the plan starts, not in every slot it covers.
    const price = placed && !placed.first ? null : priceLabel(item, actions.exactCents?.(item));
    return (
      <button
        key={item.id}
        type="button"
        className={`item-card !px-1.5 !py-1.5 ${tall ? "h-full" : ""}`}
        data-kind={item.kind}
        data-status={item.status}
        data-out={out}
        data-continued={placed && !placed.first ? "true" : undefined}
        onClick={() => actions.onOpen(item)}
        title={item.title}
      >
        <span
          className={`line-clamp-2 text-[11px] leading-snug ${"font-medium"}`}
        >
          {item.title}
        </span>
        {price && <span className="block truncate text-[10px] text-muted-foreground">{price}</span>}
        {placed?.label && <span className="block truncate text-[10px] text-foreground/75">{placed.label}</span>}
      </button>
    );
  };

  return (
    <section aria-label="Week view" className="pb-16 pt-2">
      {all.length > 1 && (
        <div className="mb-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setW(Math.max(0, w - 1))}
            disabled={w === 0}
            className="glass grid size-10 place-items-center rounded-full disabled:opacity-30"
            aria-label="Previous week"
          >
            <ChevronLeft className="size-4" />
          </button>
          <p className="font-display text-sm font-semibold">
            Week {w + 1} of {all.length}: {week[0]?.chip.weekday} {week[0]?.chip.date} to {week[week.length - 1]?.chip.weekday}{" "}
            {week[week.length - 1]?.chip.date}
          </p>
          <button
            type="button"
            onClick={() => setW(Math.min(all.length - 1, w + 1))}
            disabled={w >= all.length - 1}
            className="glass grid size-10 place-items-center rounded-full disabled:opacity-30"
            aria-label="Next week"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      )}

      <div className="glass-card overflow-x-auto rounded-2xl">
        <div className="grid" style={cols}>
          <div style={{ gridColumn: 1, gridRow: 1 }} />
          {week.map((d, di) => (
            <div key={d.date} className="min-w-0 border-b border-l border-white/30 px-1.5 py-2 text-center" style={{ gridColumn: di + 2, gridRow: 1 }}>
              <p className="font-display text-xs font-bold text-foreground">{d.chip.weekday}</p>
              <p className="text-sm font-semibold">{d.chip.date}</p>
              <p className="truncate text-[10px] text-muted-foreground">{d.title}</p>
            </div>
          ))}

          {/* One row per part; a plan running across parts is one chip over those rows (T5). */}
          {PARTS.map((part, i) => (
            <div key={`label-${part}`} className="label-luxury border-b border-white/30 px-2 pt-2.5 text-foreground" style={{ gridColumn: 1, gridRow: i + 2 }}>
              {PART_LABEL[part]}
            </div>
          ))}
          {week.map((d, di) => {
            const layout = dayLayout(d);
            const col = di + 2;
            const run = (r: Run, tall = false) => <div key={r.item.id} className={tall ? "h-full" : ""}>{chip(r.item, { first: r.first, label: r.label }, tall)}</div>;
            return PARTS.map((part, i) => {
              const seg = layout.segments.find((g) => g.from <= i && i <= g.to);
              if (seg) {
                if (seg.from !== i) return null;
                const rows = PARTS.slice(seg.from, seg.to + 1);
                const singles = rows.filter((p) => (seg.singles[p] ?? []).length > 0);
                return (
                  <div
                    key={d.date + part}
                    data-segment={`${d.date}|${PARTS[seg.from]}-${PARTS[seg.to]}`}
                    className="flex min-w-0 gap-1 border-b border-l border-white/30 p-1"
                    style={{ gridColumn: col, gridRow: `${seg.from + 2} / ${seg.to + 3}` }}
                  >
                    {seg.lanes.map((lane, li) => (
                      <div key={li} className="flex min-w-0 flex-1 flex-col gap-1">
                        {lane.map((r) => (
                          <div key={r.item.id} className="min-h-0" style={{ flexGrow: r.to - r.from + 1 }}>
                            {run(r, true)}
                          </div>
                        ))}
                      </div>
                    ))}
                    {singles.length > 0 && (
                      <div className="flex min-w-0 flex-1 flex-col gap-1">{singles.flatMap((p) => (seg.singles[p] ?? []).map((r) => run(r)))}</div>
                    )}
                  </div>
                );
              }
              const runs = layout.parts[part] ?? [];
              return (
                <div key={d.date + part} className="min-h-16 min-w-0 space-y-1 border-b border-l border-white/30 p-1" style={{ gridColumn: col, gridRow: i + 2 }}>
                  {runs.map((r) => run(r))}
                  {runs.length === 0 && actions.canEdit && (
                    <button
                      type="button"
                      onClick={() => actions.onAdd(d.date, part)}
                      aria-label={`Add to ${PART_LABEL[part].toLowerCase()} on ${d.chip.weekday} ${d.chip.date}`}
                      className="grid h-8 w-full place-items-center rounded-xl text-muted-foreground/60 hover:bg-white/30 hover:text-primary"
                    >
                      <Plus className="size-3.5" />
                    </button>
                  )}
                </div>
              );
            });
          })}

          <div className="label-luxury px-2 pt-2.5 text-foreground" style={{ gridColumn: 1, gridRow: PARTS.length + 2 }}>
            Stay
          </div>
          {week.map((d, di) => {
            const nights = d.stays.filter((s) => !s.checkout);
            return (
              <div key={d.date + "stay"} className="min-w-0 space-y-1 border-l border-white/30 p-1" style={{ gridColumn: di + 2, gridRow: PARTS.length + 2 }}>
                {nights.map((s) => (
                  <button
                    key={s.item.id}
                    type="button"
                    className="item-card !px-1.5 !py-1.5"
                    data-kind="stay"
                    data-status={s.item.status}
                    onClick={() => actions.onOpen(s.item)}
                    title={s.item.title}
                  >
                    <span className="line-clamp-2 text-[11px] font-medium leading-snug">{s.item.title}</span>
                  </button>
                ))}
                {d.overnight.map((i) => (
                  <button
                    key={`overnight-${i.id}`}
                    type="button"
                    className="item-card !px-1.5 !py-1.5"
                    data-kind={i.kind}
                    data-status={i.status}
                    onClick={() => actions.onOpen(i)}
                    title={`Overnight: ${i.title}${actions.aboard?.(i).everyone ? ", no stay needed" : ""}`}
                  >
                    <span className="line-clamp-2 text-[11px] font-medium leading-snug">{i.title}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
