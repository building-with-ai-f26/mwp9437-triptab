import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { Brand } from "../components/Brand";
import { Button, DarkField, PhotoFrame, Spinner } from "../components/ui";
import { LANDING_PHOTO } from "../lib/photos";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";

/**
 * Where a password-reset email lands. The link carries a one-time token (`token_hash`, from the
 * Supabase email template), which signs you in here on any device, then you pick a new password
 * and go to your trips. A used or expired link says so and points back to "Forgot password?".
 */
export default function ResetPassword() {
  const { user, ready, setNewPassword } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<"checking" | "ready" | "expired">("checking");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checked = useRef(false);

  useEffect(() => {
    if (!ready || checked.current) return;
    checked.current = true;
    const params = new URLSearchParams(window.location.search);
    const tokenHash = params.get("token_hash");
    // Take the token out of the address straight away, so it can't be reused from history.
    if (tokenHash) window.history.replaceState(null, "", window.location.pathname);
    if (tokenHash && params.get("type") === "recovery") {
      supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" }).then(({ error: e }) => setState(e ? "expired" : "ready"));
    } else {
      // Signed in already (a link that used the default template's code, or a returning session).
      setState(user ? "ready" : "expired");
    }
  }, [ready, user]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const err = await setNewPassword(password);
    setBusy(false);
    if (err) setError(err);
    else navigate("/trips", { replace: true });
  };

  return (
    <div className="relative flex min-h-dvh flex-col">
      <PhotoFrame src={LANDING_PHOTO} tone="landing" />
      <header className="relative z-10 px-4 py-4 sm:px-6 sm:py-5">
        <Brand light />
      </header>
      <main className="relative z-10 flex flex-1 items-start justify-center px-4 pb-10 pt-4 sm:items-center">
        <div className="glass-card-readable w-full max-w-sm rounded-3xl p-6">
          {state === "checking" && <Spinner label="Checking your link" />}

          {state === "expired" && (
            <>
              <h1 className="mb-1 font-display text-2xl font-bold italic text-white">This link has run out</h1>
              <p className="mb-5 text-sm text-white/80">
                Reset links work once, for an hour. Ask for a new one from Sign in, then Forgot password?
              </p>
              <Link
                to="/sign-in?mode=sign-in"
                className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-white px-5 text-sm font-semibold text-foreground"
              >
                Go to sign in
              </Link>
            </>
          )}

          {state === "ready" && (
            <form onSubmit={submit} noValidate>
              <h1 className="mb-1 font-display text-2xl font-bold italic text-white">Pick a new password</h1>
              <p className="mb-5 text-sm text-white/80">
                {user?.email ? `For ${user.email}. ` : ""}You'll stay signed in on this device.
              </p>
              <DarkField label="New password" hint="At least 8 characters.">
                <input
                  className="field-dark"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  required
                  autoFocus
                />
              </DarkField>
              {error && (
                <p role="alert" className="mb-3 rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-200">
                  {error}
                </p>
              )}
              <Button type="submit" className="mt-2 w-full" disabled={password.length < 8 || busy}>
                {busy ? "One moment..." : "Save and open my trips"}
              </Button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
