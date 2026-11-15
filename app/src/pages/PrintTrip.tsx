import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft, Printer } from "lucide-react";
import { Button, Spinner } from "../components/ui";
import { loadTrip, type TripBundle } from "../lib/api";
import { useAuth } from "../lib/auth";
import { goingList, myNumbers, settle } from "../lib/ledger";
import { dateRange, dollars, longDay, PART_LABEL, PARTS, priceLabel, STATUS_LABEL } from "../lib/model";
import { buildTimeline } from "../lib/timeline";
import { track } from "../lib/analytics";

/**
 * The PDF itinerary (vision, "Help along the way"): a clean, printable page. The browser's print
 * dialog saves it as a PDF. Same data and same rules as the trip page: you only see a trip you're on.
 */
export default function PrintTrip() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const [bundle, setBundle] = useState<TripBundle | null | undefined>(undefined);

  useEffect(() => {
    loadTrip(id)
      .then((b) => {
        setBundle(b);
        if (b) track("pdf opened", { items: b.items.length });
      })
      .catch(() => setBundle(null));
  }, [id]);

  const days = useMemo(() => (bundle ? buildTimeline(bundle.trip, bundle.stops, bundle.items) : []), [bundle]);

  if (bundle === undefined) return <Spinner label="Loading itinerary" />;
  if (!bundle) {
    return (
      <main className="mx-auto max-w-lg p-8">
        <p>This trip isn't here, or you're not on it.</p>
        <Link to="/trips" className="text-gold-dark underline">
          Back to my trips
        </Link>
      </main>
    );
  }

  const { trip, stops, travelers, expenses, itemPeople, actions } = bundle;
  const me = travelers.find((t) => t.user_id === user?.id) ?? null;
  const exact = new Map(expenses.filter((e) => e.item_id).map((e) => [e.item_id as string, e.total_cents]));
  const { balances, transfers } = settle(expenses, travelers);
  const mine = myNumbers(expenses, me?.id ?? null);
  const name = (tid: string | null) => travelers.find((t) => t.id === tid)?.name ?? "Nobody yet";
  const open = actions.filter((a) => !a.done);

  return (
    <div className="min-h-dvh bg-white text-foreground print:min-h-0">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-white/95 px-4 py-2 print:hidden">
        <Link to={`/trips/${trip.id}`} className="inline-flex items-center gap-1.5 text-sm font-medium">
          <ArrowLeft className="size-4" /> Back to the trip
        </Link>
        <Button size="sm" onClick={() => window.print()}>
          <Printer /> Print or save as PDF
        </Button>
      </div>

      <main className="mx-auto max-w-3xl px-5 py-6 print:max-w-none print:p-0">
        <header className="mb-5 border-b-2 border-primary pb-3">
          <p className="label-luxury text-primary">TripTab itinerary</p>
          <h1 className="font-display text-3xl font-bold italic">{trip.name}</h1>
          <p className="text-sm text-muted-foreground">
            {dateRange(trip.start_date, trip.end_date)}
            {stops.length ? ` · ${stops.map((s) => `${s.name} (${longDay(s.start_date)} to ${longDay(s.end_date)})`).join(", ")}` : ""}
          </p>
          <p className="mt-1 text-sm">
            <span className="text-muted-foreground">Travelers:</span> {travelers.map((t) => t.name).join(", ")}
          </p>
        </header>

        {days.map((d) => {
          const any = PARTS.some((p) => d.parts[p].length) || d.stays.length;
          return (
            <section key={d.date} className="mb-4 break-inside-avoid">
              <h2 className="mb-1 flex items-baseline justify-between gap-2 border-b border-border pb-1 font-display text-lg font-semibold">
                <span>
                  {longDay(d.date)} {d.title && <span className="font-normal text-muted-foreground">· {d.title}</span>}
                </span>
              </h2>
              {!any && <p className="text-sm italic text-muted-foreground">Nothing planned yet.</p>}
              <table className="w-full text-sm">
                <tbody>
                  {PARTS.flatMap((p) =>
                    d.parts[p].map((item, i) => {
                      const going = goingList(item, travelers, itemPeople);
                      const price = priceLabel(item, exact.get(item.id) ?? null);
                      return (
                        <tr key={item.id} className="align-top">
                          <td className="label-luxury w-20 py-1 pr-2 text-muted-foreground">{i === 0 ? PART_LABEL[p] : ""}</td>
                          <td className="py-1 pr-2">
                            <span className={item.status === "suggested" ? "italic text-muted-foreground" : "font-medium"}>{item.title}</span>
                            {item.location && <span className="text-muted-foreground"> · {item.location}</span>}
                            <span className="block text-xs text-muted-foreground">
                              {STATUS_LABEL[item.status]}
                              {going.length < travelers.length || item.kind === "flight" ? ` · ${going.map((t) => t.name).join(", ") || "nobody yet"}` : " · everyone"}
                            </span>
                          </td>
                          <td className="w-24 py-1 text-right tabular-nums">{price ?? ""}</td>
                        </tr>
                      );
                    }),
                  )}
                  {d.stays.map((s) => (
                    <tr key={s.item.id + s.label} className="align-top">
                      <td className="label-luxury w-20 py-1 pr-2 text-muted-foreground">{s.checkout ? "Check out" : "Stay"}</td>
                      <td className="py-1 pr-2">
                        <span className="font-medium">{s.item.title}</span>
                        {s.item.location && <span className="text-muted-foreground"> · {s.item.location}</span>}
                        {!s.checkout && <span className="block text-xs text-muted-foreground">{s.label}</span>}
                      </td>
                      <td className="w-24 py-1 text-right tabular-nums">{!s.checkout && s.label === "Check in" ? (priceLabel(s.item, exact.get(s.item.id) ?? null) ?? "") : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          );
        })}

        <section className="mb-4 break-inside-avoid">
          <h2 className="mb-1 border-b border-border pb-1 font-display text-lg font-semibold">Money</h2>
          {expenses.length === 0 ? (
            <p className="text-sm italic text-muted-foreground">Nothing on the tab yet.</p>
          ) : (
            <>
              <p className="text-sm">
                Trip spend {dollars(mine.tripTotal)}
                {me ? ` · your share ${dollars(mine.share)} · you paid ${dollars(mine.paid)}` : ""}
              </p>
              <ul className="mt-1 text-sm">
                {travelers.map((t) => {
                  const b = balances[t.id] ?? 0;
                  return (
                    <li key={t.id}>
                      {t.name}: {b > 0 ? `is owed ${dollars(b)}` : b < 0 ? `owes ${dollars(-b)}` : "even"}
                    </li>
                  );
                })}
              </ul>
              {transfers.length > 0 && (
                <p className="mt-1 text-sm">
                  <span className="font-semibold">To settle:</span>{" "}
                  {transfers.map((t) => `${name(t.from)} pays ${name(t.to)} ${dollars(t.amountCents)}`).join("; ")}.
                </p>
              )}
            </>
          )}
        </section>

        {open.length > 0 && (
          <section className="mb-4 break-inside-avoid">
            <h2 className="mb-1 border-b border-border pb-1 font-display text-lg font-semibold">Still to do</h2>
            <ul className="text-sm">
              {open.map((a) => (
                <li key={a.id}>
                  {a.title}: {name(a.assignee)}
                  {a.due_day ? `, by ${longDay(a.due_day)}` : ""}
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="mt-6 text-xs text-muted-foreground">Made with TripTab.</p>
      </main>
    </div>
  );
}
