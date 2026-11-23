import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Check, Lock, LockOpen } from "lucide-react";
import { TopBar } from "../components/TopBar";
import { Button, ErrorNote, PhotoFrame, Spinner } from "../components/ui";
import { myProfile, saveMyProfile, type Profile } from "../lib/api";
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
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    myProfile().then((p) => {
      setProfile(p);
      if (!p) return;
      setVenmo(p.venmo ? `@${p.venmo}` : "");
      setZelle(p.zelle ? zelleLabel(p.zelle) : "");
      setPhone(p.phone ?? "");
      setLocked(p.locked);
    });
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

function Row({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label-luxury mb-1 block text-foreground/80">{label}</span>
      {children}
      <span className="mt-1 block text-xs text-foreground/70">{hint}</span>
    </label>
  );
}
