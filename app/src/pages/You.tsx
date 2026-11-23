import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Check, Eye, EyeOff, Lock, LockOpen } from "lucide-react";
import { TopBar } from "../components/TopBar";
import { Button, ErrorNote, PhotoFrame, Spinner } from "../components/ui";
import { myProfile, saveMyPrefs, saveMyProfile, type Profile } from "../lib/api";
import { ACTIVITIES, CUISINES, tasteLabel } from "../lib/tastes";
import { nameOf, useAuth } from "../lib/auth";
import { zelleLabel } from "../lib/pay";
import { photoFor } from "../lib/photos";
import { supabase } from "../lib/supabase";
import { track } from "../lib/analytics";

const PHOTO = photoFor("resort lisbon");

/**
 * You: your profile (C50, Mike's call 11/23). Your name, Venmo, Zelle and phone, kept once and
 * filled in on every trip you join, so an existing user joins with nothing to re-enter. Your email
 * is the one you sign in with. The lock is set here: locked, no Owner can change your Venmo, Zelle
 * or phone on any trip; unlocked, an Owner of a trip you're on can add or fix them.
 */
export default function You() {
  const { user, refreshUser } = useAuth();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [name, setName] = useState(nameOf(user));
  const [venmo, setVenmo] = useState("");
  const [zelle, setZelle] = useState("");
  const [phone, setPhone] = useState("");
  const [locked, setLocked] = useState(true);
  // The preferences survey (C51): optional, private unless you share it.
  const [cuisines, setCuisines] = useState<string[]>([]);
  const [activities, setActivities] = useState<string[]>([]);
  const [shared, setShared] = useState(false);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Only the latest load fills the form. A second reply arriving late (React runs this twice in
    // development) would otherwise wipe what you'd started typing.
    let stale = false;
    myProfile().then((p) => {
      if (stale) return;
      setProfile(p);
      if (!p) return;
      setVenmo(p.venmo ? `@${p.venmo}` : "");
      setZelle(p.zelle ? zelleLabel(p.zelle) : "");
      setPhone(p.phone ?? "");
      setLocked(p.locked);
      setCuisines(p.cuisines ?? []);
      setActivities(p.activities ?? []);
      setShared(p.prefs_shared ?? false);
    });
    return () => {
      stale = true;
    };
  }, []);

  const edit = () => setState("idle");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError("Add your name, so the group knows who you are.");
    setState("saving");
    setError(null);
    try {
      if (name.trim() !== nameOf(user)) {
        const { error: nameError } = await supabase.auth.updateUser({ data: { name: name.trim().slice(0, 60) } });
        if (nameError) throw new Error("Couldn't save your name. Try again.");
        await refreshUser();
      }
      await saveMyProfile({ venmo, zelle, phone, locked });
      if (profile?.cuisines !== undefined) {
        await saveMyPrefs(cuisines, activities, shared);
        track("preferences saved", { cuisines: cuisines.length, activities: activities.length, shared });
      }
      track("profile saved", { has_venmo: Boolean(venmo.trim()), has_zelle: Boolean(zelle.trim()), has_phone: Boolean(phone.trim()), locked });
      setState("saved");
    } catch (err) {
      setError((err as Error).message);
      setState("idle");
    }
  };

  return (
    <div className="relative min-h-dvh">
      <PhotoFrame src={PHOTO} />
      <div className="relative z-10">
        <TopBar back={{ to: "/trips", label: "My trips" }} title={<span className="italic">You</span>} subtitle="Your profile, on every trip you join" />
        <main className="mx-auto max-w-xl px-4 py-6 sm:px-6 sm:py-8">
          {profile === undefined && <Spinner label="Loading your profile" />}
          {profile === null && <ErrorNote>Your profile couldn't be loaded. Try again in a moment.</ErrorNote>}
          {profile && (
            <form onSubmit={submit} noValidate className="glass-card-solid space-y-4 rounded-3xl p-5 sm:p-6" aria-label="Your profile">
              <p className="text-sm text-foreground/80">
                Fill this in once. It goes on every trip you're on and every trip you join, so nobody has to ask you again.
              </p>
              <Row label="Name" hint="How the group sees you when you join a trip. Trips you're already on keep the name you have there.">
                <input className="field" value={name} maxLength={60} autoComplete="name" onChange={(e) => (setName(e.target.value), edit())} />
              </Row>
              <Row label="Email" hint="The email you sign in with. It isn't changed here.">
                <p className="break-all rounded-xl bg-white/50 px-3 py-2.5 text-sm text-foreground" data-testid="you-email">
                  {user?.email}
                </p>
              </Row>
              <Row label="Venmo username" hint="Everyone on your trips sees it, so they can pay you back.">
                <input className="field" value={venmo} placeholder="@username" autoCapitalize="none" autoCorrect="off" autoComplete="off" onChange={(e) => (setVenmo(e.target.value), edit())} />
              </Row>
              <Row label="Zelle phone or email" hint="Everyone on your trips sees it too.">
                <input className="field" value={zelle} placeholder="(555) 123-4567 or you@mail.com" autoCapitalize="none" autoCorrect="off" autoComplete="off" inputMode="email" onChange={(e) => (setZelle(e.target.value), edit())} />
              </Row>
              <Row label="Phone" hint="Only the Owners of your trips see it, so they can text you an invite or a reminder.">
                <input className="field" value={phone} placeholder="(555) 123-4567" type="tel" autoComplete="tel" maxLength={32} onChange={(e) => (setPhone(e.target.value), edit())} />
              </Row>

              <fieldset className="rounded-2xl border border-foreground/10 bg-white/40 p-3">
                <legend className="label-luxury px-1 text-foreground/80">Who can change your Venmo, Zelle and phone</legend>
                <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Who can change your Venmo, Zelle and phone">
                  {(
                    [
                      [true, "Locked", "Only you. No Owner can change them on any trip.", Lock],
                      [false, "Unlocked", "You, and an Owner of a trip you're on, who can add or fix them for that trip.", LockOpen],
                    ] as const
                  ).map(([value, title, text, Icon]) => (
                    <button
                      key={title}
                      type="button"
                      role="radio"
                      aria-checked={locked === value}
                      onClick={() => (setLocked(value), edit())}
                      className={`flex min-h-11 items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                        locked === value ? "border-primary bg-white/80 shadow-sm" : "border-foreground/10 bg-white/30 hover:bg-white/50"
                      }`}
                    >
                      <Icon className={`mt-0.5 size-4 shrink-0 ${locked === value ? "text-primary" : "text-foreground/60"}`} />
                      <span>
                        <span className="block text-sm font-semibold text-foreground">{title}</span>
                        <span className="block text-xs text-foreground/80">{text}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </fieldset>

              {profile.cuisines !== undefined && (
                <fieldset className="rounded-2xl border border-foreground/10 bg-white/40 p-3" data-testid="tastes">
                  <legend className="label-luxury px-1 text-foreground/80">What you like (optional)</legend>
                  <p className="mb-3 text-xs text-foreground/80">
                    Tick what fits, so AI help suggests plans the group will like. It counts how many of the group picked each thing, never who, and only once 3 people on a trip have answered.
                  </p>
                  <Picks label="Food" options={CUISINES} picked={cuisines} onChange={(v) => (setCuisines(v), edit())} />
                  <Picks label="Things to do" options={ACTIVITIES} picked={activities} onChange={(v) => (setActivities(v), edit())} />
                  <div className="mt-3 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Who sees what you like">
                    {(
                      [
                        [false, "Private", "Nobody sees your picks. AI help still counts them, with no name.", EyeOff],
                        [true, "Shared with the group", "The people on your trips see your picks beside your name.", Eye],
                      ] as const
                    ).map(([value, title, text, Icon]) => (
                      <button
                        key={title}
                        type="button"
                        role="radio"
                        aria-checked={shared === value}
                        onClick={() => (setShared(value), edit())}
                        className={`flex min-h-11 items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                          shared === value ? "border-primary bg-white/80 shadow-sm" : "border-foreground/10 bg-white/30 hover:bg-white/50"
                        }`}
                      >
                        <Icon className={`mt-0.5 size-4 shrink-0 ${shared === value ? "text-primary" : "text-foreground/60"}`} />
                        <span>
                          <span className="block text-sm font-semibold text-foreground">{title}</span>
                          <span className="block text-xs text-foreground/80">{text}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}

              {error && <ErrorNote>{error}</ErrorNote>}
              <div className="flex items-center justify-end gap-3">
                {state === "saved" && (
                  <p role="status" className="text-sm font-medium text-green-900">
                    Saved, on all your trips.
                  </p>
                )}
                <Button type="submit" disabled={state === "saving"}>
                  {state === "saving" ? "Saving..." : state === "saved" ? (
                    <>
                      <Check /> Saved
                    </>
                  ) : (
                    "Save"
                  )}
                </Button>
              </div>
            </form>
          )}
        </main>
      </div>
    </div>
  );
}

/** A row of chips to tick, any number of them. */
function Picks({ label, options, picked, onChange }: { label: string; options: readonly string[]; picked: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="mb-2" role="group" aria-label={label}>
      <p className="mb-1.5 text-xs font-semibold text-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = picked.includes(o);
          return (
            <button
              key={o}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? picked.filter((x) => x !== o) : [...picked, o])}
              className={`min-h-9 rounded-full border px-3 text-sm transition-colors ${
                on ? "border-primary bg-primary font-semibold text-primary-foreground" : "border-foreground/15 bg-white/50 text-foreground hover:bg-white/80"
              }`}
            >
              {tasteLabel(o)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label-luxury mb-1 block text-foreground/80">{label}</span>
      {children}
      <span className="mt-1 block text-xs text-foreground/70">{hint}</span>
    </label>
  );
}
