/**
 * Drag and drop on the itinerary (Build 3 polish, from the 11/17 pod notes): an Owner picks up a
 * plan and drops it on another part of the day, or on a day chip to move it to that day. A mouse
 * starts a drag after a few pixels; a finger after a short press and hold, so scrolling still
 * works. The rules of a move are in lib/move.ts; the save and Undo are TripPage's.
 *
 * Where a drop lands is worked out here, from the real pointer and where each target is on screen
 * right now. The library's own pointer is offset by how far the page has scrolled, which is right
 * for slots but wrong for the day chips, which stay put in a sticky bar while the page scrolls.
 */
import { useRef, useState, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type Modifier,
} from "@dnd-kit/core";
import { Sparkles } from "lucide-react";
import type { DayPart, Item } from "../../lib/model";
import { justDropped, parseSlot } from "../../lib/move";
import { KIND_ICON } from "./Timeline";

/** Where the pointer or finger is now, in screen coordinates, while a plan is dragged. */
let pointer: { x: number; y: number } | null = null;
const coordsOf = (e: Event): { x: number; y: number } | null => {
  if ("touches" in e) {
    const t = (e as TouchEvent).touches[0] ?? (e as TouchEvent).changedTouches[0];
    return t ? { x: t.clientX, y: t.clientY } : null;
  }
  return "clientX" in e ? { x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY } : null;
};
const track = (e: Event) => {
  pointer = coordsOf(e) ?? pointer;
};

// A finger drag must not scroll the page under it (iOS Safari ignores the library's own guard).
const holdStill = (e: TouchEvent) => e.preventDefault();

/** The bottom edge of the sticky day chips: anything above it is hidden under the bars. */
const barBottom = () => document.querySelector('nav[aria-label="Days"]')?.getBoundingClientRect().bottom ?? 0;

/** Where a drop lands: a day chip whenever the pointer is on one, otherwise the slot under the
 *  pointer, never one hidden under the sticky bars. */
const landing: CollisionDetection = ({ droppableContainers }) => {
  const at = pointer;
  if (!at) return [];
  const under = (node: HTMLElement | null) => {
    const r = node?.getBoundingClientRect();
    return Boolean(r && at.x >= r.left && at.x <= r.right && at.y >= r.top && at.y <= r.bottom);
  };
  const chip = droppableContainers.find((c) => String(c.id).startsWith("chip:") && under(c.node.current));
  if (chip) return [{ id: chip.id }];
  if (at.y < barBottom()) return [];
  const slot = droppableContainers.find((c) => !String(c.id).startsWith("chip:") && under(c.node.current));
  return slot ? [{ id: slot.id }] : [];
};

/** The plan being dragged rides just right of the pointer, so the target under it stays in view. */
const besidePointer: Modifier = ({ transform, activatorEvent, draggingNodeRect }) => {
  const start = activatorEvent ? coordsOf(activatorEvent) : null;
  if (!start || !draggingNodeRect) return transform;
  return { ...transform, x: transform.x + start.x - draggingNodeRect.left + 18, y: transform.y + start.y - draggingNodeRect.top - 22 };
};

/** Edge scrolling, ours rather than the library's: near the bottom of the screen the page scrolls
 *  down, just below the day chips it scrolls up, and over the chips themselves it holds still. */
const EDGE = 64;
function edgeSpeed(y: number): number {
  const bar = barBottom();
  if (y > window.innerHeight - EDGE) return Math.ceil(((y - (window.innerHeight - EDGE)) / EDGE) * 16);
  if (y > bar && y < bar + EDGE) return -Math.ceil(((bar + EDGE - y) / EDGE) * 16);
  return 0;
}

export function MovePlans({ children, onMove }: { children: ReactNode; onMove: (item: Item, day: string, part: DayPart) => void }) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 280, tolerance: 8 } }),
  );
  const [active, setActive] = useState<Item | null>(null);
  const touching = useRef(false);
  const frame = useRef<number | null>(null);

  const scrollLoop = () => {
    const speed = pointer ? edgeSpeed(pointer.y) : 0;
    if (speed) window.scrollBy(0, speed);
    frame.current = requestAnimationFrame(scrollLoop);
  };

  const release = () => {
    window.removeEventListener("pointermove", track);
    window.removeEventListener("touchmove", track);
    if (touching.current) window.removeEventListener("touchmove", holdStill);
    touching.current = false;
    if (frame.current != null) cancelAnimationFrame(frame.current);
    frame.current = null;
    pointer = null;
    justDropped.mark();
    setActive(null);
  };

  const start = (e: DragStartEvent) => {
    const item = e.active.data.current?.item as Item | undefined;
    if (!item) return;
    pointer = coordsOf(e.activatorEvent);
    window.addEventListener("pointermove", track, { passive: true });
    window.addEventListener("touchmove", track, { passive: true });
    if (e.activatorEvent.type.startsWith("touch")) {
      window.addEventListener("touchmove", holdStill, { passive: false });
      touching.current = true;
      navigator.vibrate?.(10);
    }
    frame.current = requestAnimationFrame(scrollLoop);
    setActive(item);
  };

  const end = (e: DragEndEvent) => {
    const item = e.active.data.current?.item as Item | undefined;
    const over = e.over ? String(e.over.id) : null;
    release();
    if (!item || !over) return;
    if (over.startsWith("chip:")) return onMove(item, over.slice(5), item.part);
    const slot = parseSlot(over);
    if (slot) onMove(item, slot.day, slot.part);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={landing}
      autoScroll={false}
      onDragStart={start}
      onDragEnd={end}
      onDragCancel={release}
      accessibility={{
        screenReaderInstructions: { draggable: "Press and hold to drag this plan to another part of the day or another day. Or open it to change its day." },
        announcements: {
          onDragStart: ({ active: a }) => `Picked up ${(a.data.current?.item as Item | undefined)?.title ?? "a plan"}.`,
          onDragOver: ({ over }) => (over ? `Over ${describe(String(over.id))}.` : "Not over a slot."),
          onDragEnd: ({ over }) => (over ? `Dropped on ${describe(String(over.id))}.` : "Dropped back where it was."),
          onDragCancel: () => "Move cancelled.",
        },
      }}
    >
      {children}
      <DragOverlay dropAnimation={null} modifiers={[besidePointer]}>
        {active && <Ghost item={active} />}
      </DragOverlay>
    </DndContext>
  );
}

function describe(id: string): string {
  if (id.startsWith("chip:")) return id.slice(5);
  const slot = parseSlot(id);
  return slot ? `${slot.day}, ${slot.part}` : "a slot";
}

/** What follows the finger or pointer: the plan, small and lifted. */
function Ghost({ item }: { item: Item }) {
  const Icon = item.status === "suggested" ? Sparkles : KIND_ICON[item.kind];
  return (
    <div
      className="item-card pointer-events-none !w-max max-w-[240px] rotate-[-2deg] !py-2 shadow-2xl shadow-black/25"
      data-kind={item.kind}
      data-status={item.status}
      data-testid="drag-ghost"
    >
      <div className="flex items-center gap-2">
        <Icon className="size-4 shrink-0 opacity-70" aria-hidden />
        <p className="truncate text-sm font-medium">{item.title}</p>
      </div>
    </div>
  );
}
