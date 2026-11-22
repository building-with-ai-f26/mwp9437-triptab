import { useCallback, useEffect, useState } from "react";
import { Check, Mail, X } from "lucide-react";
import { Button } from "./ui";
import { useAuth } from "../lib/auth";
import { addForwardAddress, confirmForwardAddress, myForwardAddresses, removeForwardAddress, type ForwardFrom as Address } from "../lib/api";
import { track } from "../lib/analytics";

/**
 * Also forward from (C31, Mike's call 11/21): two flight confirmations forwarded from his personal
 * Gmail bounced, because only the address he signs in with counted. Here an account adds more
 * addresses to forward bookings from, each confirmed by a 6-digit code emailed to it. Shown on My
 * Trips, under Link Google.
 */
export function ForwardFrom() {
  const { user } = useAuth();
  const [list, setList] = useState<Address[] | null>(null);
  const [email, setEmail] = useState("");
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(() => {
    myForwardAddresses()
      .then(setList)
      .catch(() => setList([]));
  }, []);
  useEffect(() => {
    if (user) load();
  }, [user, load]);

  if (!user || list == null) return null;

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    setNote(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
  };

  const send = (address: string) =>
    run(`send:${address}`, async () => {
      const r = await addForwardAddress(address);
      // A test address on TripTab dev can't get mail: its code comes back for the tests to type.
      if (r.devCode) setCodes((c) => ({ ...c, [r.id]: c[r.id] ?? "" }));
      setNote(r.confirmed ? `${address} already works.` : `We sent a 6-digit code to ${address}. It works for 30 minutes.`);
      track("forward address code sent");
      setEmail("");
      load();
    });

  return (
    <section className="glass-card-solid mt-4 rounded-2xl px-4 py-3 text-sm" aria-labelledby="forward-from-title" data-testid="forward-from">
      <h2 id="forward-from-title" className="flex items-center gap-2 font-display font-semibold text-foreground">
        <Mail className="size-4 shrink-0" /> Also forward from
      </h2>
      <p className="mt-1 text-muted-foreground">
        Bookings you forward to a trip from <span className="break-all font-medium text-foreground">{user.email}</span> are read right
        away; from another address, they wait for an Owner to read them. Add an address you forward from, like a personal Gmail, and
        its forwards are read right away too. We'll email it a code to check it's yours.
      </p>
      {list.length > 0 && (
        <ul className="mt-2 divide-y divide-foreground/10" data-testid="forward-list">
          {list.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2" data-testid="forward-item">
              <span className="min-w-0 flex-1 basis-40 break-all font-medium text-foreground">
                {a.email}
                {a.confirmed_at ? (
                  <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-green-800">
                    <Check className="size-3.5" /> Works
                  </span>
                ) : (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">Waiting for its code</span>
                )}
              </span>
              {!a.confirmed_at && (
                <form
                  className="flex items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(`code:${a.id}`, async () => {
                      await confirmForwardAddress(a.id, codes[a.id] ?? "");
                      setNote(`${a.email} works now: bookings you forward from it reach your trips.`);
                      track("forward address confirmed");
                      load();
                    });
                  }}
                >
                  <input
                    className="field w-28 text-center tracking-widest"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="Code"
                    aria-label={`Code for ${a.email}`}
                    value={codes[a.id] ?? ""}
                    onChange={(e) => setCodes((c) => ({ ...c, [a.id]: e.target.value.replace(/\D/g, "") }))}
                  />
                  <Button size="sm" type="submit" disabled={busy != null || (codes[a.id] ?? "").length !== 6}>
                    Confirm
                  </Button>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-60"
                    disabled={busy != null}
                    onClick={() => send(a.email)}
                  >
                    New code
                  </button>
                </form>
              )}
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Remove ${a.email}`}
                disabled={busy != null}
                onClick={() => run(`remove:${a.id}`, async () => {
                  await removeForwardAddress(a.id);
                  load();
                })}
              >
                <X /> Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      {list.length < 3 && (
        <form
          className="mt-3 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (email.trim()) send(email.trim());
          }}
        >
          <input
            className="field min-w-0 flex-1 basis-48"
            type="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="you@gmail.com"
            aria-label="Another address you forward from"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button size="sm" type="submit" variant="glass" disabled={busy != null || !email.trim()}>
            {busy?.startsWith("send:") ? "Sending..." : "Send a code"}
          </Button>
        </form>
      )}
      {note && (
        <p role="status" className="mt-2 text-muted-foreground" data-testid="forward-note">
          {note}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 rounded-xl bg-destructive/10 px-3 py-2 text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
