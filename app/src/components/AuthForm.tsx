import { useState, type FormEvent } from "react";
import { Button, DarkField } from "./ui";
import { useAuth } from "../lib/auth";

/** This device last signed in with email, so the email form opens straight away next time. */
const EMAIL_PREF = "triptab.sign_in_with_email";
const readEmailPref = () => {
  try {
    return localStorage.getItem(EMAIL_PREF) === "1";
  } catch {
    return false;
  }
};
const writeEmailPref = (on: boolean) => {
  try {
    if (on) localStorage.setItem(EMAIL_PREF, "1");
    else localStorage.removeItem(EMAIL_PREF);
  } catch {
    // storage can be unavailable; the form just starts with Google next time
  }
};

/** Google's sign-in button, light theme (Google's branding rules: white, a thin gray edge, the four-color G). */
function GoogleButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-12 w-full items-center justify-center gap-3 rounded-full border border-[#747775] bg-white px-5 text-[15px] font-semibold text-[#1f1f1f] shadow-sm transition-colors hover:bg-[#f2f2f2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-60"
    >
      <svg viewBox="0 0 48 48" className="size-5 shrink-0" aria-hidden="true">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
      </svg>
      Continue with Google
    </button>
  );
}

/**
 * Create an account or sign in, on dark glass. Used on the sign-in page and the join page.
 * The two are separate, labeled tabs at the top (11/16 walkthrough: the old small link at the
 * bottom was easy to miss, so people with an account tried to create a second one).
 * Where the project has Google sign-in turned on, Google comes first (Mike's 11/18 call: easier than
 * typing and confirming an email): "Continue with Google" signs in or creates the account in one step
 * and comes back to `googleReturn`, and the email form waits behind "Use email and a password instead"
 * (open from the start on a device that last signed in that way).
 */
export function AuthForm({
  onDone,
  defaultName = "",
  intro,
  initialMode = "create",
  googleReturn,
}: {
  onDone: () => void;
  defaultName?: string;
  intro?: string;
  initialMode?: "create" | "sign-in";
  /** Where Google sends you back to on this site; defaults to this page. */
  googleReturn?: string;
}) {
  const { signUp, signIn, googleEnabled, signInOptionsKnown, signInWithGoogle, sendPasswordReset } = useAuth();
  const [withEmail, setWithEmail] = useState(readEmailPref);
  const [mode, setMode] = useState<"create" | "sign-in">(initialMode);
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // "Forgot password?": the sign-in form turns into a one-field form that emails a reset link.
  const [resetting, setResetting] = useState(false);
  const [resetSentTo, setResetSentTo] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    if (resetting) {
      const err = await sendPasswordReset(email);
      setBusy(false);
      if (err) setError(err);
      else setResetSentTo(email.trim());
      return;
    }
    const err = mode === "create" ? await signUp(name, email, password) : await signIn(email, password);
    setBusy(false);
    if (err) return setError(err);
    writeEmailPref(true);
    onDone();
  };

  const valid = resetting
    ? email.includes("@")
    : email.includes("@") && password.length >= 8 && (mode === "sign-in" || name.trim().length > 0);
  const backToSignIn = () => {
    setResetting(false);
    setResetSentTo(null);
    setError(null);
  };

  const google = async () => {
    setBusy(true);
    setError(null);
    writeEmailPref(false);
    const err = await signInWithGoogle(googleReturn ?? `${window.location.pathname}${window.location.search}`);
    if (err) {
      setError(err);
      setBusy(false);
    }
  };

  // Until we know whether Google is on, hold the space rather than flash the email fields.
  if (!signInOptionsKnown) return <div className="h-48" aria-busy="true" />;

  if (googleEnabled && !withEmail) {
    return (
      <div>
        <h1 className="mb-1 font-display text-2xl font-bold italic text-white">{mode === "create" ? "Create your account" : "Welcome back"}</h1>
        <p className="mb-5 text-sm text-white/80">
          {intro ?? (mode === "create" ? "One tap with Google and you're in. No password to remember." : "Sign in to see your trips.")}
        </p>
        <GoogleButton onClick={google} disabled={busy} />
        <p className="mt-2 text-center text-xs text-white/70">New or returning, it's the same button.</p>
        {error && (
          <p role="alert" className="mt-3 rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        )}
        <p className="mt-5 border-t border-white/10 pt-4 text-center">
          <button
            type="button"
            className="text-sm font-semibold text-white underline underline-offset-4"
            onClick={() => {
              setWithEmail(true);
              setError(null);
            }}
          >
            Use email and a password instead
          </button>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      {googleEnabled && (
        <>
          <div className="mb-3">
            <GoogleButton onClick={google} disabled={busy} />
          </div>
          <p className="mb-4 text-center text-xs text-white/70">or use your email</p>
        </>
      )}
      <div role="tablist" aria-label="Create an account or sign in" className="mb-5 grid grid-cols-2 gap-1 rounded-full bg-white/10 p-1">
        {(
          [
            ["create", "Create account"],
            ["sign-in", "Sign in"],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => {
              setMode(m);
              backToSignIn();
            }}
            className={`min-h-10 rounded-full px-3 text-sm font-semibold transition-colors ${
              mode === m ? "bg-white text-foreground shadow" : "text-white/80 hover:bg-white/10 hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <h1 className="mb-1 font-display text-2xl font-bold italic text-white">
        {resetting ? "Reset your password" : mode === "create" ? "Create your account" : "Welcome back"}
      </h1>
      <p className="mb-5 text-sm text-white/80">
        {resetting
          ? "We'll email you a link to set a new one. It works on any device."
          : (intro ?? (mode === "create" ? "New here? Takes ten seconds, and you can start right away." : "Sign in to see your trips."))}
      </p>

      {resetSentTo ? (
        <>
          <p role="status" className="mb-4 rounded-2xl bg-white/10 px-3 py-3 text-sm text-white/90">
            If there's a TripTab account for <strong>{resetSentTo}</strong>, a reset link is on its way. Open it on any device
            within an hour. Nothing there? Check your spam folder.
          </p>
          <Button type="button" variant="light" className="w-full" onClick={backToSignIn}>
            Back to sign in
          </Button>
        </>
      ) : (
        <>

      {mode === "create" && (
        <DarkField label="Your name">
          <input className="field-dark" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
        </DarkField>
      )}
      <DarkField label="Email">
        <input
          className="field-dark"
          type="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
      </DarkField>
      {!resetting && (
        <DarkField label="Password" hint={mode === "create" ? "At least 8 characters." : undefined}>
          <input
            className="field-dark"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "create" ? "new-password" : "current-password"}
            minLength={8}
            required
          />
        </DarkField>
      )}
      {mode === "sign-in" && !resetting && (
        <p className="-mt-2 mb-3 text-right">
          <button
            type="button"
            className="text-sm font-semibold text-white underline-offset-4 hover:underline"
            onClick={() => {
              setResetting(true);
              setError(null);
            }}
          >
            Forgot password?
          </button>
        </p>
      )}

      {error && (
        <p role="alert" className="mb-3 rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      )}

      <Button type="submit" className="mt-2 w-full" disabled={!valid || busy}>
        {busy ? "One moment..." : resetting ? "Email me a reset link" : mode === "create" ? "Create account" : "Sign in"}
      </Button>

      <p className="mt-4 text-center text-sm text-white/70">
        {resetting ? "Remembered it? " : mode === "create" ? "Already have an account? " : "New to TripTab? "}
        <button
          type="button"
          className="font-semibold text-white underline underline-offset-4"
          onClick={() => {
            if (resetting) return backToSignIn();
            setMode(mode === "create" ? "sign-in" : "create");
            setError(null);
          }}
        >
          {resetting ? "Back to sign in" : mode === "create" ? "Sign in instead" : "Create an account instead"}
        </button>
      </p>
        </>
      )}
    </form>
  );
}
