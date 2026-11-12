import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { CalendarDays, Check, Plus, Users } from "lucide-react";
import { TopBar } from "../components/TopBar";
import { Button, ErrorNote, PhotoFrame, Spinner } from "../components/ui";
import { DayBlock, DayChips, useActiveDay, type TimelineActions } from "../components/trip/Timeline";
import { ItemDialog, type ItemDialogState } from "../components/trip/ItemDialog";
import { AddPersonDialog, GroupLinkCard, PeopleCard } from "../components/trip/People";
import {
  addItem,
  addTraveler,
  deleteItem,
  loadTrip,
  removeTraveler,
  resetLink,
  setRole,
  updateItem,
  updateLink,
  type TripBundle,
} from "../lib/api";
import { useAuth } from "../lib/auth";
import { canEdit, dateRange, ROLE_LABEL } from "../lib/model";
import { buildTimeline } from "../lib/timeline";
import { photoFor } from "../lib/photos";
import { track } from "../lib/analytics";

type Tab = "itinerary" | "people";

export default function TripPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const [bundle, setBundle] = useState<TripBundle | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("itinerary");
  const [dialog, setDialog] = useState<ItemDialogState | null>(null);
  const [addingPerson, setAddingPerson] = useState(false);

  const reload = useCallback(
    () =>
      loadTrip(id)
        .then((b) => {
          setBundle(b);
          setError(null);
        })
        .catch((e: Error) => setError(e.message)),
    [id],
  );

  useEffect(() => {
    reload();
    // Pick up what others changed when you come back to the tab.
    const onFocus = () => document.visibilityState === "visible" && reload();
    document.addEventListener("visibilitychange", onFocus);
    return () => document.removeEventListener("visibilitychange", onFocus);
  }, [reload]);

  const days = useMemo(
    () => (bundle ? buildTimeline(bundle.trip, bundle.stops, bundle.items) : []),
    [bundle],
  );
  const [active, jump] = useActiveDay(days.map((d) => d.date));

  if (bundle === undefined && !error) return <Spinner label="Loading trip" />;
  if (!bundle) {
    return (
      <div className="relative min-h-dvh">
        <PhotoFrame src={photoFor("travel")} />
        <main className="relative z-10 mx-auto max-w-md px-4 py-20">
          <div className="glass-card-solid rounded-3xl p-7 text-center">
            <h1 className="mb-2 font-display text-2xl font-bold italic">This trip isn't here</h1>
            <p className="mb-5 text-sm text-muted-foreground">
              {error ?? "It may have been deleted, or you're not on it. Ask someone on the trip for the group link."}
            </p>
            <Link to="/trips" className="font-medium text-gold-dark underline-offset-4 hover:underline">
              Back to my trips
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const { trip, stops, travelers, link } = bundle;
  const me = travelers.find((t) => t.user_id === user?.id) ?? null;
  const editable = canEdit(me?.role);
  const photo = photoFor(`${stops.map((s) => s.name).join(" ")} ${trip.name}`);

  const actions: TimelineActions = {
    canEdit: editable,
    onAdd: (day, part, kind = "activity") => setDialog({ item: null, day, part, kind }),
    onOpen: (item) => setDialog({ item, day: item.day, part: item.part, kind: item.kind }),
  };

  const peopleCard = (
    <PeopleCard
      trip={trip}
      travelers={travelers}
      link={link}
      meId={me?.id ?? null}
      canEdit={editable}
      onAdd={() => setAddingPerson(true)}
      onRole={async (t, role) => {
        await setRole(t.id, role);
        await reload();
      }}
      onRemove={async (t) => {
        await removeTraveler(t.id);
        await reload();
      }}
    />
  );

  return (
    <div className="relative min-h-dvh">
      <PhotoFrame src={photo} />
      <div className="relative z-10">
        <TopBar
          back={{ to: "/trips", label: "My trips" }}
          title={trip.name}
          subtitle={`${dateRange(trip.start_date, trip.end_date)}${stops.length ? ` · ${stops.map((s) => s.name).join(", ")}` : ""}`}
        >
          {me && (
            <span className="hidden rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-gold-dark sm:inline">
              You're {me.role === "owner" ? "an" : "a"} {ROLE_LABEL[me.role]}
            </span>
          )}
        </TopBar>

        {/* Phone: one pane at a time (spring's Schedule / Details toggle). */}
        <div className="flex gap-1 px-4 pt-3 lg:hidden" role="tablist">
          {(
            [
              ["itinerary", "Itinerary", CalendarDays],
              ["people", `People (${travelers.length})`, Users],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 font-display text-sm font-semibold transition-all ${
                tab === key ? "glass-card text-foreground shadow-md" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </div>

        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-8">
          <main className={tab === "itinerary" ? "" : "hidden lg:block"}>
            <div className="flex flex-wrap items-end justify-between gap-2 pb-3 pt-4 sm:pt-6">
              <div>
                <h2 className="font-display text-xl font-bold italic sm:text-2xl">Your Itinerary</h2>
                <p className="mt-1.5 inline-flex flex-wrap items-center gap-x-3 gap-y-1 rounded-full bg-white/45 px-3 py-1 text-[11px] text-muted-foreground backdrop-blur-sm">
                  <span className="italic">Suggested is faint</span>
                  <span className="font-medium text-foreground/80">Planned is solid</span>
                  <span className="inline-flex items-center gap-1 font-medium text-green-700">
                    Confirmed (paid) <span className="inline-flex items-center rounded-full bg-green-500/20 px-1 text-[10px] font-bold">$<Check className="size-2.5" strokeWidth={3} /></span>
                  </span>
                </p>
              </div>
              {editable && (
                <Button size="sm" onClick={() => setDialog({ item: null, day: active ?? trip.start_date, part: "day", kind: "activity" })}>
                  <Plus /> Add a plan
                </Button>
              )}
            </div>
            {error && <ErrorNote>{error}</ErrorNote>}
            <DayChips days={days} active={active} onPick={jump} />
            <div className="divide-y divide-foreground/10 pb-16">
              {days.map((d, i) => (
                <DayBlock key={d.date} day={d} last={i === days.length - 1} actions={actions} />
              ))}
            </div>
          </main>

          <aside className={`space-y-4 pb-16 pt-4 sm:pt-6 lg:sticky lg:top-20 lg:block lg:max-h-[calc(100dvh-5rem)] lg:self-start lg:overflow-y-auto ${tab === "people" ? "" : "hidden"}`}>
            {peopleCard}
            {editable && link && (
              <GroupLinkCard
                trip={trip}
                link={link}
                onChange={async (patch) => {
                  await updateLink(trip.id, patch);
                  await reload();
                }}
                onReset={async () => {
                  await resetLink(trip.id);
                  await reload();
                }}
              />
            )}
            {!editable && (
              <section className="glass-card-solid rounded-2xl p-4 text-sm text-muted-foreground">
                You're a viewer on this trip: you see every plan and who's going. Ask an owner if you need to add or
                change something.
              </section>
            )}
          </aside>
        </div>
      </div>

      <ItemDialog
        state={dialog}
        trip={trip}
        canEdit={editable}
        onClose={() => setDialog(null)}
        onSave={async (input, existing) => {
          if (existing) {
            await updateItem(existing.id, input);
            track("plan updated", { kind: input.kind, status: input.status });
          } else {
            await addItem(trip.id, input);
            track("plan added", { kind: input.kind, status: input.status, part: input.part, has_estimate: input.est_cents != null });
          }
          await reload();
        }}
        onDelete={async (item) => {
          await deleteItem(item.id);
          await reload();
        }}
      />
      <AddPersonDialog
        open={addingPerson}
        defaultRole={link?.default_role ?? "owner"}
        onClose={() => setAddingPerson(false)}
        onAdd={async (p) => {
          await addTraveler(trip.id, p);
          track("person added", { method: "direct", role: p.role, has_email: Boolean(p.email.trim()), has_phone: Boolean(p.phone.trim()) });
          await reload();
        }}
      />
    </div>
  );
}
