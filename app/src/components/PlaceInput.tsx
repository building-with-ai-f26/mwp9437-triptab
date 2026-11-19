import { useEffect, useId, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { searchPlaces, type Place } from "../lib/places";

/**
 * A place, with suggestions as you type (src/lib/places.ts): a stop's town by default, or with
 * `search` any other list (a plan's Where: addresses and places). Arrow keys and Enter pick one,
 * Escape closes the list, and any typed text still works. `onPick` fires when a place is chosen
 * from the list; `onCommit` when you leave the box, so the page can update its photo only once
 * there's a place, not on every keystroke (the 11/17 pod feedback). `dark` is for the dialogs.
 */
export function PlaceInput<P extends Place = Place>({
  value,
  onChange,
  onPick,
  onCommit,
  label,
  placeholder,
  search = searchPlaces as (text: string, signal: AbortSignal) => Promise<P[]>,
  credit = "Places from GeoNames, via Open-Meteo",
  dark = false,
}: {
  value: string;
  onChange: (text: string) => void;
  onPick: (place: P) => void;
  onCommit?: () => void;
  label: string;
  placeholder?: string;
  search?: (text: string, signal: AbortSignal) => Promise<P[]>;
  credit?: string;
  dark?: boolean;
}) {
  const listId = useId();
  const [places, setPlaces] = useState<P[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  // Look up only what the person is typing in this box now, not a name filled in by a pick or
  // the example, and not after they've moved on.
  const typed = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const typingHere = () => typed.current && document.activeElement === input.current;

  useEffect(() => {
    if (!typingHere()) return;
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => {
      search(value, ctrl.signal)
        .then((found) => {
          if (!typingHere()) return;
          setPlaces(found);
          setActive(-1);
          setOpen(found.length > 0);
        })
        .catch(() => setPlaces([]));
    }, 250);
    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
    // The search is the caller's; only what's typed starts a lookup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const pick = (p: P) => {
    typed.current = false;
    setOpen(false);
    setPlaces([]);
    onPick(p);
  };

  return (
    <div className="relative min-w-0 flex-1">
      <input
        ref={input}
        className={dark ? "field-dark" : "field"}
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          typed.current = true;
          onChange(e.target.value);
        }}
        onFocus={() => places.length > 0 && setOpen(true)}
        onBlur={() => {
          typed.current = false;
          setOpen(false);
          onCommit?.();
        }}
        onKeyDown={(e) => {
          if (!open || places.length === 0) return;
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            const step = e.key === "ArrowDown" ? 1 : -1;
            setActive((i) => (i + step + places.length) % places.length);
          } else if (e.key === "Enter" && active >= 0) {
            e.preventDefault();
            pick(places[active]);
          } else if (e.key === "Escape") {
            e.preventDefault();
            setOpen(false);
          }
        }}
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={`Places for ${label.toLowerCase()}`}
          className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-2xl border border-border bg-white/95 py-1 text-foreground shadow-lg backdrop-blur"
        >
          {places.map((p, i) => (
            <li
              key={`${p.name}|${p.detail}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              // mousedown, not click: the input's blur would close the list before a click lands.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(p);
              }}
              className={`flex min-h-11 cursor-pointer items-center gap-2.5 px-3 py-1.5 text-sm ${i === active ? "bg-sand" : "hover:bg-sand/70"}`}
            >
              <MapPin className="size-4 shrink-0 text-primary" />
              <span className="min-w-0">
                <span className="block truncate font-semibold">{p.name}</span>
                {p.detail && <span className="block truncate text-xs text-muted-foreground">{p.detail}</span>}
              </span>
            </li>
          ))}
          <li role="presentation" className="px-3 pb-1 pt-1.5 text-[10px] text-muted-foreground">
            {credit}
          </li>
        </ul>
      )}
    </div>
  );
}
