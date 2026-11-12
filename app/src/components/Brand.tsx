import { Link } from "react-router";
import { Plane } from "lucide-react";

/** Logo lockup from spring LandingHub.tsx: glass tile, Playfair name, uppercase label. */
export function Brand({ light = false }: { light?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2.5" aria-label="TripTab home">
      <span className={`grid size-9 place-items-center rounded-2xl glass sm:size-10 ${light ? "" : "bg-white/30"}`}>
        <Plane className={`size-4 sm:size-5 ${light ? "text-white" : "text-primary"}`} />
      </span>
      <span>
        <span className={`block font-display text-lg font-bold leading-tight sm:text-xl ${light ? "text-white" : "text-foreground"}`}>
          TripTab
        </span>
        <span className={`label-luxury block leading-tight ${light ? "text-white/75" : "text-muted-foreground"}`}>
          Group trips, settled
        </span>
      </span>
    </Link>
  );
}
