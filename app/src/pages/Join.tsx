import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { Check, UserPlus } from "lucide-react";
import { Brand } from "../components/Brand";
import { AuthForm } from "../components/AuthForm";
import { Button, PhotoFrame, Spinner } from "../components/ui";
import { joinPreview, joinTrip, myPayOn, setMyPay, type JoinPreview } from "../lib/api";
import { PayInfoForm } from "../components/trip/PayInfo";
import { nameOf, useAuth } from "../lib/auth";
import { dateRange, ROLE_LABEL } from "../lib/model";
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
  // Just joined: how people pay you, once (Mike's 11/18 notes). Skipped when you set it on another trip.
  const [payStep, setPayStep] = useState<{ tripId: string; venmo: string | null; zelle: string | null } | null>(null);

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
        }
      })
      .catch(() => setPreview(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, ready, user?.id]);

  // Signed back in to a spot you'd already taken: go straight to the trip.
  useEffect(() => {
    if (signInAs && user && preview?.my_traveler_id) navigate(`/trips/${preview.trip_id}`, { replace: true });
  }, [signInAs, user, preview, navigate]);

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

  const join = async () => {
    if (!pick) return;
    setBusy(true);
    setError(null);
    try {
      const tripId = await joinTrip(token, "travelerId" in pick ? { travelerId: pick.travelerId } : { newName: pick.newName });
      track("name claimed", { method: "travelerId" in pick ? "picked" : "added" });
      if (!("travelerId" in pick)) track("person added", { method: "group link", role: preview.default_role });
      // Null on a database without Zelle yet, or if it can't be read: straight to the trip.
      const pay = user ? await myPayOn(tripId, user.id) : null;
      if (pay && !pay.pay_locked) {
        setPayStep({ tripId, venmo: pay.venmo, zelle: pay.zelle });
        setBusy(false);
        return;
      }
      navigate(`/trips/${tripId}`, { replace: true });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
      joinPreview(token).then((p) => p && setPreview(p));
    }
  };

  if (payStep) {
    const open = () => navigate(`/trips/${payStep.tripId}`, { replace: true });
    return (
      <Frame photo={photo}>
        <TripHeading preview={preview} />
        <h2 className="mb-1 font-display text-xl font-bold text-white">How should people pay you back?</h2>
        <p className="mb-4 text-sm text-white/80">
          So the group can pay you in a tap from Settle up. You can change it any time in People.
        </p>
        <PayInfoForm
          venmo={payStep.venmo}
          zelle={payStep.zelle}
          zelleReady
          saveLabel="Save and open the trip"
          onSave={async (v, z) => {
            await setMyPay(v, z);
            track("pay info saved", { where: "join", has_venmo: Boolean(v.trim()), has_zelle: Boolean(z.trim()) });
            open();
          }}
        >
          <Button
            type="button"
            variant="light"
            onClick={() => {
              track("pay info skipped", { where: "join" });
              open();
            }}
          >
            Skip for now
          </Button>
        </PayInfoForm>
      </Frame>
    );
  }

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
              <h2 className="label-luxury mb-2 text-white/80">Who are you?</h2>
              <ul className="mb-3 grid grid-cols-2 gap-2">
                {preview.people.map((p) => (
                  <li key={p.id}>
                    <button
                      disabled={p.claimed && Boolean(user)}
                      aria-label={p.claimed && !user ? `${p.name}, joined. That's you? Sign in` : undefined}
                      onClick={() => (p.claimed ? setSignInAs(p.name) : setPick({ travelerId: p.id, name: p.name }))}
                      className="flex min-h-12 w-full items-center justify-between gap-2 rounded-2xl border border-white/15 bg-white/5 px-3 text-left text-sm text-white transition-colors hover:bg-white/15 disabled:cursor-default disabled:opacity-45 disabled:hover:bg-white/5"
                    >
                      <span className="truncate">{p.name}</span>
                      {p.claimed && (
                        <span className="flex shrink-0 items-center gap-0.5 text-[11px] text-white/80">
                          <Check className="size-3" /> {user ? "Joined" : "Joined · Sign in"}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
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
                <button className="underline underline-offset-4" onClick={() => setPick(null)}>
                  Not you?
                </button>
              </p>
              <AuthForm
                defaultName={pickedName}
                googleReturn={
                  "travelerId" in pick
                    ? `/join/${token}?as=${pick.travelerId}`
                    : `/join/${token}?name=${encodeURIComponent(pick.newName)}`
                }
                intro="So your spot stays yours on any device. You can start right away."
                onDone={() => {
                  /* the effect above reloads the preview once the session lands; then Join shows */
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
              Back
            </Button>
            <Button className="flex-1" onClick={join} disabled={busy}>
              {busy ? "Joining..." : "Join the trip"}
            </Button>
          </div>
        </>
      )}
    </Frame>
  );
}

function TripHeading({ preview }: { preview: JoinPreview }) {
  return (
    <>
      <p className="label-luxury mb-1 text-white/60">You're invited to</p>
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
