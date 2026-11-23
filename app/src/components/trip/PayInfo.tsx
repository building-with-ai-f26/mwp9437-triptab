import { useState, type FormEvent, type ReactNode } from "react";
import { Check, Copy, Lock } from "lucide-react";
import { Button, DarkField, Dialog } from "../ui";
import { cleanVenmo, cleanZelle, VENMO_FORMAT, venmoLooksRight, ZELLE_FORMAT, zelleLabel, zelleLooksRight } from "../../lib/pay";
import type { Traveler } from "../../lib/model";

/**
 * How people pay you (Mike's notes, 11/18): your Venmo and your Zelle phone or email, one form,
 * reached from your row in People and from Settle up, which asks the first time (C45, 11/23). Once you save your
 * own, it's locked to you: an Owner can no longer change it.
 */
export function PayInfoForm({
  venmo,
  zelle,
  zelleReady,
  saveLabel = "Save",
  onSave,
  children,
}: {
  venmo: string | null | undefined;
  zelle: string | null | undefined;
  /** False on a database without Zelle yet: Venmo only. */
  zelleReady: boolean;
  saveLabel?: string;
  onSave: (venmo: string, zelle: string) => Promise<void>;
  /** Extra buttons next to Save (Skip for now, Cancel). */
  children?: ReactNode;
}) {
  const [v, setV] = useState(venmo ? `@${venmo}` : "");
  const [z, setZ] = useState(zelle ? zelleLabel(zelle) : "");
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!venmoLooksRight(v)) return setError("A Venmo username is 5 to 30 letters, numbers, - or _.");
    if (zelleReady && !zelleLooksRight(z)) return setError("For Zelle, use a US phone number (10 digits) or an email.");
    setState("saving");
    setError(null);
    try {
      await onSave(v, zelleReady ? z : "");
      setState("saved");
    } catch (err) {
      setError((err as Error).message);
      setState("idle");
    }
  };
  const edit = () => setState("idle");

  return (
    <form onSubmit={submit} noValidate>
      <DarkField label="Venmo username">
        <input
          className="field-dark"
          value={v}
          onChange={(e) => {
            setV(e.target.value);
            edit();
          }}
          placeholder="@username"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
        />
      </DarkField>
      {zelleReady && (
        <DarkField label="Zelle phone or email">
          <input
            className="field-dark"
            value={z}
            onChange={(e) => {
              setZ(e.target.value);
              edit();
            }}
            placeholder="(555) 123-4567 or you@mail.com"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            inputMode="email"
          />
        </DarkField>
      )}
      <p className="mb-3 text-xs text-white/75">
        Both optional. Everyone on your trips can see them, so they can pay you back. Only you can change them.
      </p>
      {error && (
        <p role="alert" className="mb-3 rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        {children}
        <Button type="submit" disabled={state === "saving"}>
          {state === "saving" ? "Saving..." : state === "saved" ? (
            <>
              <Check /> Saved
            </>
          ) : (
            saveLabel
          )}
        </Button>
      </div>
    </form>
  );
}

/** Your row in People opens this. */
export function PayInfoDialog({
  open,
  me,
  zelleReady,
  onSave,
  onClose,
}: {
  open: boolean;
  me: Traveler | null;
  zelleReady: boolean;
  onSave: (venmo: string, zelle: string) => Promise<void>;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title="How people pay you">
      {open && me && (
        <PayInfoForm
          venmo={me.venmo}
          zelle={me.zelle}
          zelleReady={zelleReady}
          onSave={async (v, z) => {
            await onSave(v, z);
            onClose();
          }}
        >
          <Button type="button" variant="light" onClick={onClose}>
            Cancel
          </Button>
        </PayInfoForm>
      )}
    </Dialog>
  );
}

/**
 * An Owner adds or fixes someone's Venmo, and their Zelle where the trip has Zelle (C20, Mike's call
 * 11/20), until that person sets their own.
 */
export function VenmoForDialog({
  person,
  zelleReady = false,
  onSave,
  onClose,
}: {
  person: Traveler | null;
  zelleReady?: boolean;
  /** Saves both; `zelle` is "" without Zelle. */
  onSave: (travelerId: string, venmo: string, zelle: string) => Promise<void>;
  onClose: () => void;
}) {
  const what = zelleReady ? "Venmo and Zelle" : "Venmo";
  return (
    <Dialog open={person !== null} onClose={onClose} title={person ? `${person.name}'s ${what}` : what}>
      {person && <VenmoForForm key={person.id} person={person} zelleReady={zelleReady} onSave={onSave} onClose={onClose} />}
    </Dialog>
  );
}

function VenmoForForm({
  person,
  zelleReady,
  onSave,
  onClose,
}: {
  person: Traveler;
  zelleReady: boolean;
  onSave: (travelerId: string, venmo: string, zelle: string) => Promise<void>;
  onClose: () => void;
}) {
  const [value, setValue] = useState(person.venmo ? `@${person.venmo}` : "");
  const [zelle, setZelle] = useState(person.zelle ? zelleLabel(person.zelle) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unchanged = cleanVenmo(value) === (person.venmo ?? null) && (!zelleReady || cleanZelle(zelle) === (person.zelle ?? null));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!venmoLooksRight(value)) return setError(VENMO_FORMAT);
    if (zelleReady && !zelleLooksRight(zelle)) return setError(ZELLE_FORMAT);
    setBusy(true);
    setError(null);
    try {
      await onSave(person.id, value, zelleReady ? zelle : "");
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} noValidate>
      <DarkField
        label={`${person.name}'s Venmo username`}
        hint={zelleReady ? undefined : `Once ${person.name} saves their own, only they can change it.`}
      >
        <input
          className="field-dark"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="@username"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          autoFocus
        />
      </DarkField>
      {zelleReady && (
        <DarkField
          label={`${person.name}'s Zelle phone or email`}
          hint={`Once ${person.name} saves their own Venmo or Zelle, only they can change them.`}
        >
          <input
            className="field-dark"
            value={zelle}
            onChange={(e) => setZelle(e.target.value)}
            placeholder="(555) 123-4567 or an email"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
          />
        </DarkField>
      )}
      {error && (
        <p role="alert" className="mb-3 rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="light" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || unchanged}>
          {busy ? "Saving..." : "Save"}
        </Button>
      </div>
    </form>
  );
}

/**
 * "Venmo @jordan-b · Zelle (555) 123-4567", with a lock once it's theirs. On light cards. The lock
 * is a button: tapping it says what it means (Mike's 11/19 review, where it seemed to do nothing).
 */
export function PayLine({ person, isMe = false }: { person: Traveler; isMe?: boolean }) {
  const [why, setWhy] = useState(false);
  if (!person.venmo && !person.zelle) return null;
  const parts = [person.venmo ? `Venmo @${person.venmo}` : null, person.zelle ? `Zelle ${zelleLabel(person.zelle)}` : null].filter(Boolean);
  return (
    <div className="min-w-0 text-xs text-muted-foreground" data-testid="pay-line">
      <p className="flex min-w-0 items-start gap-1">
        {person.pay_locked && (
          <button
            type="button"
            className="-m-1.5 shrink-0 rounded-full p-1.5 hover:bg-white/50"
            aria-label={isMe ? "Locked: only you can change this. What does that mean?" : `Locked: only ${person.name} can change this. What does that mean?`}
            aria-expanded={why}
            onClick={() => setWhy((w) => !w)}
          >
            <Lock className="size-3" aria-hidden />
          </button>
        )}
        <span className="min-w-0 break-words">{parts.join(" · ")}</span>
      </p>
      {why && (
        <p className="mt-1 rounded-lg bg-white/60 px-2 py-1 text-foreground" data-testid="pay-lock-why">
          {isMe
            ? "Locked to you: only you can change it, here or in your profile. Nobody else on the trip can. Your profile is also where you unlock it."
            : `Locked: ${person.name} set it, so only ${person.name} can change it. Owners can't.`}
        </p>
      )}
    </div>
  );
}

/** "Zelle (555) 123-4567 [Copy]" in Settle up: Zelle has no pay link, so copy it into your bank's app. */
export function ZelleCopy({ zelle }: { zelle: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(zelle).catch(() => window.prompt("Copy this for Zelle:", zelle));
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      }}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-white/30 px-3 text-sm text-white hover:bg-white/10"
      aria-label={`Copy Zelle ${zelleLabel(zelle)}`}
    >
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      {copied ? "Copied" : `Zelle ${zelleLabel(zelle)}`}
    </button>
  );
}
