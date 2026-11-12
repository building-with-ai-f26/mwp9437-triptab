import { useState, type FormEvent } from "react";
import { Button, DarkField } from "./ui";
import { useAuth } from "../lib/auth";

/** Create an account or sign in, on dark glass. Used on the sign-in page and the join page. */
export function AuthForm({
  onDone,
  defaultName = "",
  intro,
}: {
  onDone: () => void;
  defaultName?: string;
  intro?: string;
}) {
  const { signUp, signIn } = useAuth();
  const [mode, setMode] = useState<"create" | "sign-in">("create");
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

  return (
    <form onSubmit={submit} noValidate>
      <h1 className="mb-1 font-display text-2xl font-bold italic text-white">
        {mode === "create" ? "Create your account" : "Welcome back"}
      </h1>
      <p className="mb-5 text-sm text-white/65">
        {intro ?? (mode === "create" ? "Takes ten seconds. No email to confirm." : "Sign in to see your trips.")}
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

      <p className="mt-4 text-center text-sm text-white/65">
        {mode === "create" ? "Already have an account? " : "New to TripTab? "}
        <button
          type="button"
          className="font-semibold text-white underline-offset-4 hover:underline"
          onClick={() => {
            setMode(mode === "create" ? "sign-in" : "create");
            setError(null);
          }}
        >
          {mode === "create" ? "Sign in" : "Create an account"}
        </button>
      </p>
    </form>
  );
}
