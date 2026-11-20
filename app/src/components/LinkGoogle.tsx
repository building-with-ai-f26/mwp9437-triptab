import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "./ui";
import { useAuth } from "../lib/auth";

/** Why linking failed, from the address Google's round trip came back to (Supabase puts it there). */
function linkError(): string | null {
  const params = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const code = params.get("error_code") ?? hash.get("error_code");
  const text = params.get("error_description") ?? hash.get("error_description");
  if (!code && !text) return null;
  if (code === "identity_already_exists" || /already linked|already exists/i.test(text ?? "")) {
    return "That Google account already has its own TripTab account, so it can't join this one.";
  }
  if (code === "manual_linking_disabled" || /manual linking/i.test(text ?? "")) return "Linking Google isn't turned on yet. Try again later.";
  return "Google didn't finish linking. Try again.";
}

/**
 * Link Google to an email account (C19, Mike's call 11/20): Mike signed up with one address and
 * Google used another, which made a second account. Linked, Google signs in to this one. Shown on
 * My Trips where Google sign-in is on and this account doesn't have it yet.
 */
export function LinkGoogle() {
  const { user, googleEnabled, hasGoogle, linkGoogle } = useAuth();
  const [error, setError] = useState<string | null>(() => linkError());
  const [busy, setBusy] = useState(false);
  const justLinked = hasGoogle && new URLSearchParams(window.location.search).get("linked") === "google";

  if (!user || !googleEnabled) return null;
  if (justLinked) {
    return (
      <p className="glass-card-solid mt-6 flex items-center gap-2 rounded-2xl px-4 py-3 text-sm text-foreground" role="status" data-testid="google-linked">
        <Check className="size-4 shrink-0 text-green-700" /> Google is linked. You can sign in with Google or your email; it's the same account.
      </p>
    );
  }
  if (hasGoogle) return null;
  return (
    <section className="glass-card-solid mt-6 rounded-2xl px-4 py-3 text-sm" aria-labelledby="link-google-title" data-testid="link-google">
      <h2 id="link-google-title" className="font-display font-semibold text-foreground">
        Sign in with Google too
      </h2>
      <p className="mt-1 text-muted-foreground">
        You're signed in as <span className="break-all font-medium text-foreground">{user.email}</span>. Link your Google account and it
        signs in here, even if its address is different, instead of starting a second account.
      </p>
      {error && (
        <p role="alert" className="mt-2 rounded-xl bg-destructive/10 px-3 py-2 text-destructive">
          {error}
        </p>
      )}
      <Button
        className="mt-3"
        size="sm"
        variant="glass"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const err = await linkGoogle("/trips?linked=google");
          if (err) {
            setError(err);
            setBusy(false);
          }
        }}
      >
        {busy ? "Opening Google..." : "Link Google"}
      </Button>
    </section>
  );
}
