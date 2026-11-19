import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "../ui";

export interface TourStep<T extends string = string> {
  id: string;
  title: string;
  body: string;
  /** The phone tab the step's part of the trip is on. */
  tab: T;
  /** Finds the part of the page the step points at. */
  target: () => Element | null;
}

type Box = { top: number; left: number; width: number; height: number };
const PAD = 6;

/**
 * Show me around (the 11/17 pod notes: "a short walkthrough the first time someone joins or starts
 * a trip"). One step at a time, it dims the page, rings the part it's about and says what it's for;
 * on a phone it switches to that part's tab first. Next, Back, Skip, or Escape to stop.
 */
export function Tour<T extends string>({
  steps,
  onTab,
  onClose,
}: {
  steps: TourStep<T>[];
  onTab: (tab: T) => void;
  /** `finished`: true when they reached the end, false when they skipped. */
  onClose: (finished: boolean, step: number) => void;
}) {
  const [i, setI] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const step = steps[i];
  const last = i === steps.length - 1;

  const measure = useCallback(() => {
    const el = step?.target();
    if (!el) return setBox(null);
    const r = el.getBoundingClientRect();
    // A tall part (a long Money card) is ringed only as far as the screen shows it.
    const top = Math.max(r.top, 8);
    const bottom = Math.min(r.bottom, window.innerHeight - 8);
    setBox({ top: top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: Math.max(bottom - top, 40) + PAD * 2 });
  }, [step]);

  // Each step: its tab, then the part scrolled into view, then ringed.
  useLayoutEffect(() => {
    if (!step) return;
    onTab(step.tab);
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        step.target()?.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
        measure();
      });
    });
    card.current?.querySelector<HTMLButtonElement>("[data-next]")?.focus();
    return () => cancelAnimationFrame(frame);
    // onTab is the page's setter; a step change is what moves the ring.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i]);

  useEffect(() => {
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose(false, i);
    };
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("keydown", key);
    };
  }, [measure, onClose, i]);

  if (!step) return null;
  // The card sits away from the ring: at the top when the part is in the lower half of the screen.
  const cardOnTop = box ? box.top + box.height / 2 > window.innerHeight / 2 : false;

  return (
    <div data-testid="tour">
      {/* Taps on the dimmed page do nothing while the guide is up. */}
      <div className="fixed inset-0 z-[60]" aria-hidden onClick={(e) => e.stopPropagation()} />
      <div
        aria-hidden
        className="pointer-events-none fixed z-[61] rounded-2xl ring-2 ring-white transition-all duration-300"
        style={
          box
            ? { top: box.top, left: box.left, width: box.width, height: box.height, boxShadow: "0 0 0 9999px rgba(24,18,12,0.55)" }
            : { top: "50%", left: "50%", width: 0, height: 0, boxShadow: "0 0 0 9999px rgba(24,18,12,0.55)" }
        }
      />
      <div
        ref={card}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        className={`fixed inset-x-4 z-[62] mx-auto max-w-md rounded-2xl bg-white p-4 text-foreground shadow-2xl ${cardOnTop ? "top-4" : "bottom-4"}`}
      >
        <div className="mb-1 flex items-center justify-between gap-2">
          <p className="label-luxury text-[10px] text-muted-foreground">
            Show me around · {i + 1} of {steps.length}
          </p>
          <button
            type="button"
            aria-label="Close the guide"
            className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-foreground/5"
            onClick={() => onClose(false, i)}
          >
            <X className="size-4" />
          </button>
        </div>
        <h2 id="tour-title" className="font-display text-lg font-bold">
          {step.title}
        </h2>
        <p className="mt-1 text-sm text-foreground/85">{step.body}</p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <button type="button" className="min-h-11 text-sm font-semibold text-muted-foreground underline underline-offset-4" onClick={() => onClose(false, i)}>
            Skip
          </button>
          <div className="flex gap-2">
            {i > 0 && (
              <Button size="sm" variant="glass" className="!bg-foreground/5" onClick={() => setI(i - 1)}>
                Back
              </Button>
            )}
            <Button data-next size="sm" onClick={() => (last ? onClose(true, i) : setI(i + 1))}>
              {last ? "Done" : "Next"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
