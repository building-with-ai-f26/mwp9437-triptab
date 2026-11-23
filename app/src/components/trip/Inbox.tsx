import { useEffect, useState } from "react";
import { Check, Copy, Mail, RefreshCw } from "lucide-react";
import { Button } from "../ui";
import type { InboxItem } from "../../lib/inbox";
import type { Traveler } from "../../lib/model";

/** "Nov 20, 3:05 PM": when an email came in. */
const whenIn = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/**
 * Emails forwarded to the trip's address that wait for an Owner (email-in, Mike's call 11/20): each
 * one's plans open on import's review, and nothing is on the trip until they're saved there. An email
 * that couldn't be read says why and can be dismissed. One from an address nobody on the trip has is
 * held unread (C36, Mike's call 11/21) until an Owner taps Read it, or That's me to trust the address.
 */
export function InboxBanner({
  items,
  travelers,
  onReview,
  onDismiss,
  onReadHeld,
}: {
  items: InboxItem[];
  travelers: Traveler[];
  onReview: (item: InboxItem) => void;
  onDismiss: (item: InboxItem) => Promise<void>;
  onReadHeld: (item: InboxItem, mine: boolean) => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (items.length === 0) return null;
  const waiting = items.filter((i) => i.status === "new" || i.status === "held").length;
  const act = async (id: string, fn: () => Promise<void>) => {
    setBusy(id);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <section aria-labelledby="inbox-title" data-testid="inbox" className="glass-card-solid mb-4 rounded-2xl px-4 py-3 text-sm">
      <h3 id="inbox-title" className="flex items-center gap-2 font-display font-semibold text-foreground">
        <Mail className="size-4 shrink-0" />
        {waiting === 0
          ? "An email couldn't be read"
          : waiting === 1
            ? "A booking came in by email"
            : `${waiting} bookings came in by email`}
      </h3>
      <ul className="mt-2 divide-y divide-foreground/10">
        {items.map((it) => {
          const who = travelers.find((t) => t.id === it.from_traveler)?.name ?? it.from_address ?? "Someone on the trip";
          const count = it.plans.length;
          const isHeld = it.status === "held";
          return (
            <li key={it.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2" data-testid="inbox-item" data-status={it.status}>
              <div className="min-w-0 flex-1 basis-48">
                <p className="break-words font-medium text-foreground">{it.subject ?? "An email"}</p>
                <p className="break-words text-xs text-muted-foreground">
                  From {who}, {whenIn(it.received_at)}.{" "}
                  {isHeld
                    ? "That address isn't on this trip, so it hasn't been read. Read it if it's a booking for the trip."
                    : it.status === "failed"
                      ? (it.note ?? "Nothing in it could be read.")
                      : `${count} ${count === 1 ? "plan" : "plans"} to review.`}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button size="sm" variant="ghost" disabled={busy === it.id} onClick={() => act(it.id, () => onDismiss(it))}>
                  Dismiss
                </Button>
                {isHeld && (
                  <>
                    <Button
                      size="sm"
                      variant="glass"
                      disabled={busy === it.id}
                      title={`Count ${it.from_address ?? "this address"} as yours, and read this email`}
                      onClick={() => act(it.id, () => onReadHeld(it, true))}
                    >
                      That's me
                    </Button>
                    <Button size="sm" disabled={busy === it.id} onClick={() => act(it.id, () => onReadHeld(it, false))}>
                      {busy === it.id ? "Reading..." : "Read it"}
                    </Button>
                  </>
                )}
                {it.status === "new" && (
                  <Button size="sm" onClick={() => onReview(it)}>
                    Review
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {error && (
        <p role="alert" className="mt-2 rounded-xl bg-destructive/10 px-3 py-2 text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}

/**
 * The trip's own address, on import's first screen (dark): forward a confirmation there instead of
 * pasting it. Shown once email-in is ready; the address is made the first time it's shown.
 */
export function ForwardAddress({
  ready,
  getAddress,
  resetAddress,
}: {
  /** Asks whether email-in takes mail yet; until it says so, nothing shows. */
  ready: () => Promise<boolean>;
  getAddress: () => Promise<string>;
  resetAddress: () => Promise<string>;
}) {
  const [address, setAddress] = useState<string | null>(null);
  const [off, setOff] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    ready()
      .then((ok) => (ok ? getAddress() : null))
      .then((a) => {
        if (!live) return;
        if (a) setAddress(a);
        else setOff(true);
      })
      .catch(() => live && setOff(true));
    return () => {
      live = false;
    };
  }, [ready, getAddress]);

  if (off || !address) return null;
  return (
    <div className="mb-3 rounded-xl border border-white/20 bg-white/5 px-3 py-2.5 text-sm text-white/85" data-testid="forward-address">
      <p className="flex items-center gap-2 font-semibold text-white">
        <Mail className="size-4 shrink-0" /> Or forward it to this trip
      </p>
      <p className="mt-1 text-xs text-white/70">
        Send booking emails here. From the email you use for TripTab (or one under Also forward from on your profile) they're read right
        away; from any other address, they wait for an Owner to read them. Nothing is saved until an Owner reviews it.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <code className="min-w-0 break-all rounded-lg bg-black/25 px-2 py-1 text-[13px] text-white" data-testid="forward-address-text">
          {address}
        </code>
        <Button
          type="button"
          size="sm"
          variant="light"
          onClick={() => {
            navigator.clipboard?.writeText(address).catch(() => window.prompt("Copy the trip's address:", address));
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1800);
          }}
        >
          {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
        </Button>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs text-white/70 underline underline-offset-4 hover:text-white disabled:opacity-60"
          disabled={busy}
          onClick={async () => {
            if (!window.confirm("Make a new address? The old one stops taking email right away.")) return;
            setBusy(true);
            setError(null);
            try {
              setAddress(await resetAddress());
            } catch (e) {
              setError((e as Error).message);
            }
            setBusy(false);
          }}
        >
          <RefreshCw className="size-3" /> New address
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-200">
          {error}
        </p>
      )}
    </div>
  );
}
