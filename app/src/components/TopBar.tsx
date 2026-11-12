import type { ReactNode } from "react";
import { Link } from "react-router";
import { ArrowLeft } from "lucide-react";

/** Sticky glass header (spring Dashboard.tsx / MyTrips.tsx). */
export function TopBar({
  back,
  title,
  subtitle,
  children,
}: {
  back?: { to: string; label: string };
  title: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="glass-card sticky top-0 z-40 flex h-14 items-center justify-between gap-2 border-x-0 border-t-0 border-b border-white/15 px-3 sm:h-16 sm:px-6">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        {back && (
          <Link
            to={back.to}
            aria-label={back.label}
            className="grid size-9 shrink-0 place-items-center rounded-full text-foreground hover:bg-white/30"
          >
            <ArrowLeft className="size-5" />
          </Link>
        )}
        <div className="min-w-0">
          <h1 className="truncate font-display text-base font-bold text-foreground sm:text-lg">{title}</h1>
          {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">{children}</div>
    </header>
  );
}
