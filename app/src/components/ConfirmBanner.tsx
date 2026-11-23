import { useState } from "react";
import { MailCheck, X } from "lucide-react";
import { useAuth } from "../lib/auth";
import { CONFIRM_BANNER_HIDDEN as DISMISSED } from "../lib/firstVisit";

/**
 * The reminder until an email-and-password account opens its "Confirm your email" link (C6,
 * Mike's 11/18 call: use TripTab right away, with a reminder). It never blocks anything; it can be
 * hidden for this visit, and it is gone for good once the link is opened.
 */
export function ConfirmBanner() {
  const { user, emailPending, resendConfirm } = useAuth();
  const [hidden, setHidden] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISSED) === "1";
    } catch {
      return false;
    }
  });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; message: string } | null>(null);
  if (!emailPending || hidden) return null;

  return (
    <div role="status" className="glass-card-solid mx-4 mt-3 flex items-start gap-3 rounded-2xl !bg-[rgba(246,241,233,0.94)] px-4 py-3 text-sm text-foreground sm:mx-auto sm:max-w-4xl">
      <MailCheck className="mt-0.5 size-5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Confirm your email</p>
        <p className="text-foreground/80">
          We sent a link to <span className="break-all font-medium">{user?.email}</span>. It keeps password resets and invites reaching you.
        </p>
        {note && <p className={`mt-1 text-xs font-medium ${note.ok ? "text-green-900" : "text-red-900"}`}>{note.message}</p>}
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setNote(await resendConfirm());
            setBusy(false);
          }}
          className="mt-1 text-xs font-semibold underline underline-offset-4 disabled:opacity-60"
        >
          {busy ? "Sending..." : "Send it again"}
        </button>
      </div>
      <button
        type="button"
        aria-label="Hide this for now"
        className="-mr-1 grid size-9 shrink-0 place-items-center rounded-full text-foreground/70 hover:bg-white/50"
        onClick={() => {
          setHidden(true);
          try {
            sessionStorage.setItem(DISMISSED, "1");
          } catch {
            // storage can be unavailable; it stays hidden for this page only
          }
        }}
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
