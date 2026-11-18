import { useState, type FormEvent } from "react";
import { Button, DarkField } from "./ui";
import { useAuth } from "../lib/auth";

/**
 * Create an account or sign in, on dark glass. Used on the sign-in page and the join page.
 * The two are separate, labeled tabs at the top (11/16 walkthrough: the old small link at the
 * bottom was easy to miss, so people with an account tried to create a second one).
 * Where the project has Google sign-in turned on, "Continue with Google" sits above both; it
 * signs in or creates the account in one step, and comes back to `googleReturn`.
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
  const { signUp, signIn, googleEnabled, signInWithGoogle } = useAuth();
  const [mode, setMode] = useState<"create" | "sign-in">(initialMode);
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const err = mode === "create" ? await signUp(name, email, password) : await signIn(email, password);
    setBusy(false);
    if (err) setError(err);
    else onDone();
  };

  const valid = email.includes("@") && password.length >= 8 && (mode === "sign-in" || name.trim().length > 0);

  const google = async () => {
    setBusy(true);
    setError(null);
    const err = await signInWithGoogle(googleReturn ?? `${window.location.pathname}${window.location.search}`);
    if (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      {googleEnabled && (
        <>
          <Button type="button" variant="light" className="mb-3 w-full" onClick={google} disabled={busy}>
            Continue with Google
          </Button>
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
              setError(null);
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
        {mode === "create" ? "Create your account" : "Welcome back"}
      </h1>
      <p className="mb-5 text-sm text-white/80">
        {intro ?? (mode === "create" ? "New here? Takes ten seconds. No email to confirm." : "Sign in to see your trips.")}
      </p>

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

      {error && (
        <p role="alert" className="mb-3 rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      )}

      <Button type="submit" className="mt-2 w-full" disabled={!valid || busy}>
        {busy ? "One moment..." : mode === "create" ? "Create account" : "Sign in"}
      </Button>

      <p className="mt-4 text-center text-sm text-white/70">
        {mode === "create" ? "Already have an account? " : "New to TripTab? "}
        <button
          type="button"
          className="font-semibold text-white underline underline-offset-4"
          onClick={() => {
            setMode(mode === "create" ? "sign-in" : "create");
            setError(null);
          }}
        >
          {mode === "create" ? "Sign in instead" : "Create an account instead"}
        </button>
      </p>
    </form>
  );
}
