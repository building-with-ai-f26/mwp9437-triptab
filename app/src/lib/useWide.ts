import { useEffect, useState } from "react";

/** Tailwind's `lg` (64rem): the desktop layout, with the sidebar beside the itinerary. */
const WIDE = "(min-width: 1024px)";

/**
 * Whether the screen has the desktop layout. For the few panels that sit in a different place on
 * a phone than on desktop (the Money list, Travel and lodging), so each renders once, not twice
 * with one copy hidden.
 */
export function useWide(): boolean {
  const [wide, setWide] = useState(() => typeof window !== "undefined" && window.matchMedia(WIDE).matches);
  useEffect(() => {
    const m = window.matchMedia(WIDE);
    const on = () => setWide(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return wide;
}
