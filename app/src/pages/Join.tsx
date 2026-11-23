import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { BedDouble, Bus, Check, Palmtree, Plane, UserPlus, UtensilsCrossed, type LucideIcon } from "lucide-react";
import { Brand } from "../components/Brand";
import { AuthForm } from "../components/AuthForm";
import { Button, PhotoFrame, Spinner } from "../components/ui";
import { joinPreview, joinTrip, type JoinPreview } from "../lib/api";
import { quietFirstVisit } from "../lib/firstVisit";
import { nameOf, useAuth } from "../lib/auth";
import { clock, dateRange, longDay, PART_LABEL, ROLE_LABEL, STATUS_LABEL, type ItemKind } from "../lib/model";
import { LANDING_PHOTO, photoFor } from "../lib/photos";
import { track } from "../lib/analytics";

type Pick = { travelerId: string; name: string } | { newName: string };

/** Names match the way the database's unique index does: trimmed, any case. */
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The group link. You see the trip and the names already added, pick yours ("Don't see your
 * name?" adds you), make an account or sign in, and you're on the trip. The role comes from
 * the server (join_trip), never from the link.
 *
 * From the link to the trip in as few steps as it takes (C45, Mike's call 11/23): picking your name
 * is the answer to "who are you", so there's no second "Join as ...?" after it. Signed out, you
 * pick, make an account, and land on the trip. Signed in already, one tap joins: on your name, or
 * on "Join as Julia" when your account's name is on the list. How people pay you is asked at the
 * first Settle up, not here, and the first visit opens with no guide and no email reminder.
 *
 * A name that has already joined is someone's spot. Signed out, tapping it asks you to sign in
 * (the 11/17 pod test: a podmate who joined on her phone found her spot "taken" on her laptop),
 * and signing in opens the trip. Signed in as someone else, it stays shut.
 */
export default function Join() {
  const { token = "" } = useParams();
  const [params] = useSearchParams();
  const { user, ready } = useAuth();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<JoinPreview | null | undefined>(undefined);
  const [pick, setPick] = useState<Pick | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signInAs, setSignInAs] = useState<string | null>(null);
  // The pick was this person's own tap (now, or before leaving for Google): join without asking again.
  const [goNow, setGoNow] = useState(false);

  useEffect(() => {
    if (!ready) return;
    joinPreview(token)
      .then((p) => {
        setPreview(p);
        if (p) {
          track("group link opened", { signed_in: Boolean(user), personal: Boolean(params.get("as")) });
          const as = p.people.find((x) => x.id === params.get("as") && !x.claimed);
          if (as) setPick({ travelerId: as.id, name: as.name });
          // Back from Google with a new name typed before leaving.
          const typed = params.get("name")?.trim();
          if (!as && typed && !p.people.some((x) => sameName(x.name, typed))) setPick({ newName: typed.slice(0, 60) });
          // Back from Google after picking a name here: that tap was the answer. An invite's own
          // link (?as= with no go) still asks once, since whoever opens it may not be that person.
          if (params.get("go") === "1") setGoNow(true);
          // Signed in already, and your account's name is on the list: offer it, one tap to join.
          const mine = !as && !typed && user && !p.my_traveler_id ? p.people.find((x) => !x.claimed && sameName(x.name, nameOf(user))) : undefined;
          if (mine) setPick((cur) => cur ?? { travelerId: mine.id, name: mine.name });
        }
      })
      .catch(() => setPreview(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, ready, user?.id]);

  // Signed back in to a spot you'd already taken: go straight to the trip.
  useEffect(() => {
    if (signInAs && user && preview?.my_traveler_id) navigate(`/trips/${preview.trip_id}`, { replace: true });
  }, [signInAs, user, preview, navigate]);

  async function join(p: Pick) {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const tripId = await joinTrip(token, "travelerId" in p ? { travelerId: p.travelerId } : { newName: p.newName });
      track("name claimed", { method: "travelerId" in p ? "picked" : "added" });
      if (!("travelerId" in p)) track("person added", { method: "group link", role: preview.default_role });
      quietFirstVisit();
      navigate(`/trips/${tripId}`, { replace: true });
    } catch (e) {
      // Back to the names, with what went wrong (someone took that name a moment ago, say).
      setError((e as Error).message);
      setGoNow(false);
      setPick(null);
      setBusy(false);
      joinPreview(token).then((fresh) => fresh && setPreview(fresh));
    }
  }

  // Picked and signed in: join. No second question.
  useEffect(() => {
    if (goNow && user && pick && preview && !preview.my_traveler_id && !busy) join(pick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goNow, user?.id, pick, preview?.trip_id]);

  if (!ready || preview === undefined) return <Spinner label="Opening the invite" />;

  if (!preview) {
    return (
      <Frame photo={LANDING_PHOTO}>
        <h1 className="mb-2 font-display text-2xl font-bold italic text-white">This link isn't active</h1>
        <p className="mb-5 text-sm text-white/70">
          The trip's owner may have turned it off or made a new one. Ask them for the current link.
        </p>
        <Link to="/" className="text-sm font-semibold text-white underline-offset-4 hover:underline">
          Go to TripTab
        </Link>
      </Frame>
    );
  }

  const photo = photoFor(`${preview.stops.join(" ")} ${preview.name}`);
  const pickedName = pick ? ("name" in pick ? pick.name : pick.newName) : "";

  if (busy && goNow) return <Spinner label="Opening the trip" />;

  if (preview.my_traveler_id) {
    const mine = preview.people.find((p) => p.id === preview.my_traveler_id);
    return (
      <Frame photo={photo}>
        <TripHeading preview={preview} />
        <p className="mb-5 text-sm text-white/80">You're on this trip as {mine?.name ?? nameOf(user)}.</p>
        <Button className="w-full" onClick={() => navigate(`/trips/${preview.trip_id}`)}>
          Open the trip
        </Button>
      </Frame>
    );
  }

  return (
    <Frame photo={photo}>
      <TripHeading preview={preview} />

      {signInAs && !user ? (
        <>
          <p className="mb-4 rounded-2xl bg-white/10 px-3 py-2 text-sm text-white/85">
            <strong>{signInAs}</strong> already joined this trip. That's you? Sign in with the account you joined with, and the
            trip opens.{" "}
            <button className="underline underline-offset-4" onClick={() => setSignInAs(null)}>
              Not you?
            </button>
          </p>
          <AuthForm
            initialMode="sign-in"
            googleReturn={`/join/${token}`}
            intro="Use the email you joined with, on any device."
            onDone={() => {
              /* "signed in" is tracked by the sign-in itself; the effects above reload the preview
                 once the session lands, then open the trip */
            }}
          />
        </>
      ) : !pick || !user ? (
        <>
          {!pick && (
            <>
              <TripPeek preview={preview} />
              <h2 className="label-luxury mb-2 text-white/80">Who are you?</h2>
              <ul className="mb-3 grid grid-cols-2 gap-2">
                {preview.people.map((p) => (
                  <li key={p.id}>
                    <button
                      disabled={p.claimed && Boolean(user)}
                      aria-label={p.claimed && !user ? `${p.name}, joined. That's you? Sign in` : undefined}
                      onClick={() => {
                        if (p.claimed) return setSignInAs(p.name);
                        setPick({ travelerId: p.id, name: p.name });
                        setGoNow(true);
                      }}
                      className="flex min-h-12 w-full flex-col items-start justify-center gap-0.5 rounded-2xl border border-white/15 bg-white/5 px-3 py-2 text-left text-sm text-white transition-colors hover:bg-white/15 disabled:cursor-default disabled:opacity-45 disabled:hover:bg-white/5"
                    >
                      {/* The tag sits under the name, so a name is never cut to "Mi..." on a phone (11/23 review). */}
                      <span className="max-w-full truncate">{p.name}</span>
                      {p.claimed && (
                        <span className="flex items-center gap-0.5 text-[11px] text-white/80">
                          <Check className="size-3" /> {user ? "Joined" : "Joined · Sign in"}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
              {user && !adding && nameOf(user).trim() && !preview.people.some((x) => sameName(x.name, nameOf(user))) && (
                <Button
                  className="mb-3 w-full"
                  onClick={() => {
                    setPick({ newName: nameOf(user).trim().slice(0, 60) });
                    setGoNow(true);
                  }}
                >
                  Join as {nameOf(user).trim()}
                </Button>
              )}
              {adding ? (
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const typed = newName.trim();
                    if (!typed) return;
                    // A name already on the trip is that person's spot: sign in to it, or take it.
                    const known = preview.people.find((p) => sameName(p.name, typed));
                    if (known?.claimed && !user) setSignInAs(known.name);
                    else if (known?.claimed) setError(`${known.name} has already joined. Pick another name.`);
                    else if (known) setPick({ travelerId: known.id, name: known.name });
                    else setPick({ newName: typed });
                    if (!known?.claimed) setGoNow(true);
                  }}
                >
                  <input
                    className="field-dark"
                    value={newName}
                    onChange={(e) => {
                      setNewName(e.target.value);
                      setError(null);
                    }}
                    placeholder="Your name"
                    aria-label="Your name"
                    autoFocus
                  />
                  <Button type="submit" disabled={!newName.trim()}>
                    Next
                  </Button>
                </form>
              ) : (
                <button
                  onClick={() => {
                    setAdding(true);
                    setNewName(nameOf(user));
                  }}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-white underline-offset-4 hover:underline"
                >
                  <UserPlus className="size-4" /> Don't see your name?
                </button>
              )}
              {error && (
                <p role="alert" className="mt-3 rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-100">
                  {error}
                </p>
              )}
            </>
          )}

          {pick && !user && (
            <>
              <p className="mb-4 rounded-2xl bg-white/10 px-3 py-2 text-sm text-white/85">
                Joining as <strong>{pickedName}</strong>.{" "}
                <button
                  className="underline underline-offset-4"
                  onClick={() => {
                    setPick(null);
                    setGoNow(false);
                  }}
                >
                  Not you?
                </button>
              </p>
              <AuthForm
                defaultName={pickedName}
                googleReturn={
                  "travelerId" in pick
                    ? `/join/${token}?as=${pick.travelerId}&go=1`
                    : `/join/${token}?name=${encodeURIComponent(pick.newName)}&go=1`
                }
                intro="So your spot stays yours on any device. You can start right away."
                onDone={() => {
                  // Making the account was the last step: join as soon as the session lands, even
                  // when the name came from an invite's own link.
                  setGoNow(true);
                }}
              />
            </>
          )}
        </>
      ) : (
        <>
          <p className="mb-4 text-sm text-white/85">
            Join as <strong>{pickedName}</strong>
            {"travelerId" in pick ? "" : `, as ${ROLE_LABEL[preview.default_role] === "Owner" ? "an Owner" : "a Viewer"}`}?
          </p>
          {error && (
            <p role="alert" className="mb-3 rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-200">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="light" onClick={() => setPick(null)} disabled={busy}>
              Not me
            </Button>
            <Button className="flex-1" onClick={() => join(pick)} disabled={busy}>
              {busy ? "Joining..." : "Join the trip"}
            </Button>
          </div>
        </>
      )}
    </Frame>
  );
}

const PLAN_ICON: Record<ItemKind, LucideIcon> = { activity: Palmtree, meal: UtensilsCrossed, transport: Bus, flight: Plane, stay: BedDouble };

/**
 * The trip before sign-up (C45, Mike's call 11/23): the next plans and who's coming, so a friend
 * sees something worth joining for before being asked for an account. Titles, days and status
 * only; costs, places and notes wait until you're on the trip. Nothing shows on a database that
 * doesn't send plans yet.
 */
function TripPeek({ preview }: { preview: JoinPreview }) {
  const plans = preview.plans ?? [];
  const joined = preview.people.filter((p) => p.claimed);
  const more = (preview.plan_count ?? plans.length) - plans.length;
  if (preview.plans === undefined) return null;
  const names = joined.map((p) => p.name);
  const coming =
    names.length === 0
      ? null
      : names.length <= 3
        ? `${names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`} ${names.length === 1 ? "is" : "are"} in`
        : `${names.slice(0, 2).join(", ")} and ${names.length - 2} more are in`;
  return (
    <section className="mb-5 rounded-2xl border border-white/10 bg-white/5 p-3" aria-label="A look at the trip" data-testid="trip-peek">
      {plans.length > 0 ? (
        <>
          <h2 className="label-luxury mb-2 text-white/80">Next up</h2>
          <ul className="space-y-2">
            {plans.map((p, i) => {
              const Icon = PLAN_ICON[p.kind] ?? Palmtree;
              return (
                <li key={i} className="flex items-start gap-2.5 text-sm text-white">
                  <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-white/10">
                    <Icon className="size-3.5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{p.title}</span>
                    <span className="block text-xs text-white/70">
                      {longDay(p.day)} · {p.start_time ? clock(p.start_time) : PART_LABEL[p.part]} · {STATUS_LABEL[p.status]}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
          {more > 0 && <p className="mt-2 text-xs text-white/70">and {more} more {more === 1 ? "plan" : "plans"} on the trip</p>}
        </>
      ) : (
        <p className="text-sm text-white/80">No plans yet. Join and help shape it.</p>
      )}
      {coming && (
        <p className="mt-3 border-t border-white/10 pt-2.5 text-sm text-white" data-testid="whos-coming">
          <span className="label-luxury mr-1.5 text-white/80">Who's coming</span>
          {coming}
          {preview.people.length > joined.length ? `, ${preview.people.length - joined.length} more invited` : ""}
        </p>
      )}
    </section>
  );
}

function TripHeading({ preview }: { preview: JoinPreview }) {
  return (
    <>
      <p className="label-luxury mb-1 text-white/60" data-testid="invited-by">
        {preview.invited_by ? `${preview.invited_by} invited you to` : "You're invited to"}
      </p>
      <h1 className="mb-1 font-display text-3xl font-bold italic leading-tight text-white">{preview.name}</h1>
      <p className="mb-5 text-sm text-white/70">
        {dateRange(preview.start_date, preview.end_date)}
        {preview.stops.length ? ` · ${preview.stops.join(", ")}` : ""}
      </p>
    </>
  );
}

function Frame({ photo, children }: { photo: string; children: ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col">
      <PhotoFrame src={photo} tone="landing" />
      <header className="relative z-10 px-4 py-4 sm:px-6 sm:py-5">
        <Brand light />
      </header>
      <main className="relative z-10 flex flex-1 items-start justify-center px-4 pb-10 pt-2 sm:items-center">
        <div className="glass-card-readable w-full max-w-md rounded-3xl p-6">{children}</div>
      </main>
    </div>
  );
}
