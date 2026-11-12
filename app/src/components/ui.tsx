import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { X } from "lucide-react";

type Variant = "primary" | "glass" | "dark" | "ghost" | "light" | "danger";

const VARIANTS: Record<Variant, string> = {
  // Brown pill: spring's primary button (brown, shadow, Playfair label) in the header pills' shape.
  primary:
    "bg-primary text-primary-foreground hover:bg-gold-dark shadow-lg shadow-primary/20 font-display font-semibold",
  glass: "glass border-white/20 text-foreground hover:bg-white/30",
  dark: "bg-foreground text-background hover:bg-foreground/80",
  ghost: "text-muted-foreground hover:text-foreground hover:bg-white/20",
  light: "bg-white/10 text-white hover:bg-white/20 border border-white/15",
  danger: "text-destructive hover:bg-destructive/10",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "h-9 px-3.5 text-sm", md: "h-11 px-5 text-sm", lg: "h-12 px-7 text-base" };
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-full whitespace-nowrap transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&_svg]:size-4 [&_svg]:shrink-0 ${sizes[size]} ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

/** Full-bleed photo behind a screen, with spring's warm overlay so glass stays legible. */
export function PhotoFrame({ src, tone = "soft" }: { src: string; tone?: "soft" | "landing" }) {
  return (
    <div className="fixed inset-0 z-0 overflow-hidden" aria-hidden>
      <img
        src={src}
        alt=""
        className={`h-full w-full object-cover ${tone === "landing" ? "motion-safe:animate-kenburns" : ""}`}
      />
      {tone === "landing" ? (
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.05) 35%, rgba(0,0,0,0) 50%, rgba(0,0,0,0.05) 65%, rgba(0,0,0,0.35) 100%)",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/45 to-background/55 backdrop-blur-sm" />
      )}
    </div>
  );
}

/**
 * The one dialog: a native <dialog>, centered on desktop and pinned to the bottom at phone width,
 * opaque dark glass (no backdrop-filter, which breaks inside dialogs on mobile WebKit).
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="glass-card-readable m-0 mt-auto w-full max-w-none rounded-t-3xl p-0 backdrop:bg-black/50 sm:m-auto sm:max-w-lg sm:rounded-3xl"
      aria-label={title}
    >
      {open && (
        <div className="flex max-h-[88dvh] flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
            <h2 className="font-display text-lg font-semibold text-white">{title}</h2>
            <button
              onClick={onClose}
              className="-mr-2 grid size-10 place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white"
              aria-label="Close"
            >
              <X className="size-5" />
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && (
            <div className="flex flex-wrap justify-end gap-2 border-t border-white/10 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {footer}
            </div>
          )}
        </div>
      )}
    </dialog>
  );
}

/**
 * A labeled field for the dark dialog. `group` is for a row of pill choices: it uses a fieldset,
 * because a <label> around buttons ties the caption to the first button (a tap on "Kind" would
 * pick Activity).
 */
export function DarkField({
  label,
  hint,
  group = false,
  children,
}: {
  label: string;
  hint?: string;
  group?: boolean;
  children: ReactNode;
}) {
  if (group) {
    return (
      <fieldset className="mb-3 block min-w-0">
        <legend className="label-luxury mb-1.5 block text-white/65">{label}</legend>
        {children}
        {hint && <span className="mt-1 block text-xs text-white/50">{hint}</span>}
      </fieldset>
    );
  }
  return (
    <label className="mb-3 block">
      <span className="label-luxury mb-1.5 block text-white/65">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-white/50">{hint}</span>}
    </label>
  );
}

/** A labeled field on light glass. */
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="mb-4 block">
      <span className="label-luxury mb-1.5 block text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex justify-center py-16" role="status" aria-label={label}>
      <div className="size-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="mt-2 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {children}
    </p>
  );
}

/** A row of pill options (one choice), for the dark dialog or light glass. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  dark = true,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  dark?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`min-h-9 rounded-full px-3.5 text-sm transition-colors ${
              on
                ? "bg-primary font-semibold text-white"
                : dark
                  ? "border border-white/15 bg-white/5 text-white/80 hover:bg-white/15"
                  : "border border-white/50 bg-white/30 text-foreground hover:bg-white/50"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
