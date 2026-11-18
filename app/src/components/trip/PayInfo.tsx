import { useState, type FormEvent, type ReactNode } from "react";
import { Check, Copy, Lock } from "lucide-react";
import { Button, DarkField, Dialog } from "../ui";
import { cleanVenmo, venmoLooksRight, zelleLabel, zelleLooksRight } from "../../lib/pay";
import type { Traveler } from "../../lib/model";

/**
 * How people pay you (Mike's notes, 11/18): your Venmo and your Zelle phone or email, one form,
 * reached from your row in People, from Settle up, and when you join a trip. Once you save your
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

/** An Owner adds or fixes someone's Venmo, until that person sets their own. */
export function VenmoForDialog({
  person,
  onSave,
  onClose,
}: {
  person: Traveler | null;
  onSave: (travelerId: string, handle: string) => Promise<void>;
  onClose: () => void;
}) {
  return (
    <Dialog open={person !== null} onClose={onClose} title={person ? `${person.name}'s Venmo` : "Venmo"}>
      {person && <VenmoForForm key={person.id} person={person} onSave={onSave} onClose={onClose} />}
    </Dialog>
  );
}

function VenmoForForm({
  person,
  onSave,
  onClose,
}: {
  person: Traveler;
  onSave: (travelerId: string, handle: string) => Promise<void>;
  onClose: () => void;
}) {
  const [value, setValue] = useState(person.venmo ? `@${person.venmo}` : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!venmoLooksRight(value)) return setError("A Venmo username is 5 to 30 letters, numbers, - or _.");
    setBusy(true);
    setError(null);
    try {
      await onSave(person.id, value);
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} noValidate>
      <DarkField label={`${person.name}'s Venmo username`} hint={`Once ${person.name} saves their own, only they can change it.`}>
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
      {error && (
        <p role="alert" className="mb-3 rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="light" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || cleanVenmo(value) === (person.venmo ?? null)}>
          {busy ? "Saving..." : "Save"}
        </Button>
      </div>
    </form>
  );
}

/** "Venmo @jordan-b · Zelle (555) 123-4567", with a lock once it's theirs. On light cards. */
export function PayLine({ person }: { person: Traveler }) {
  if (!person.venmo && !person.zelle) return null;
  const parts = [person.venmo ? `Venmo @${person.venmo}` : null, person.zelle ? `Zelle ${zelleLabel(person.zelle)}` : null].filter(Boolean);
  return (
    <p className="flex min-w-0 items-start gap-1 text-xs text-muted-foreground" data-testid="pay-line">
      {person.pay_locked && (
        <>
          <Lock className="mt-0.5 size-3 shrink-0" aria-hidden />
          <span className="sr-only">Set by {person.name}: </span>
        </>
      )}
      <span className="min-w-0 break-words">{parts.join(" · ")}</span>
    </p>
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
