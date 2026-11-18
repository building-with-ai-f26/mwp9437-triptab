import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { arrivedFromOAuth, isConfigured, supabase, supabaseKey, supabaseUrl } from "./supabase";
import { identify, track } from "./analytics";

interface AuthState {
  user: User | null;
  ready: boolean;
  signUp: (name: string, email: string, password: string) => Promise<string | null>;
  signIn: (email: string, password: string) => Promise<string | null>;
  /** Whether this project has Google sign-in turned on (Supabase, Sign In / Providers). */
  googleEnabled: boolean;
  /** Leaves for Google; the browser comes back to `returnPath` on this site, signed in. */
  signInWithGoogle: (returnPath: string) => Promise<string | null>;
  /** Emails a link to /reset-password. Says nothing about whether the account exists. */
  sendPasswordReset: (email: string) => Promise<string | null>;
  /** Sets a new password for whoever is signed in (after a reset link, the person it was sent to). */
  setNewPassword: (password: string) => Promise<string | null>;
  /**
   * An email-and-password account whose "Confirm your email" link hasn't been opened yet (C6,
   * 11/18). Set only by the server; Google sign-ins and older accounts are never pending.
   */
  emailPending: boolean;
  /** Emails a fresh confirmation link; the answer is a line to show. */
  resendConfirm: () => Promise<{ ok: boolean; message: string }>;
  /** Re-reads the account from the server, after the link was opened (on this device or another). */
  refreshUser: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/** The display name someone signed up with. */
export function nameOf(user: User | null): string {
  const n = user?.user_metadata?.name;
  return typeof n === "string" && n.trim() ? n.trim() : (user?.email?.split("@")[0] ?? "");
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!isConfigured);
  const [googleEnabled, setGoogleEnabled] = useState(false);

  // Google sign-in shows only where it is turned on, so a project without it never shows a dead button.
  useEffect(() => {
    if (!isConfigured) return;
    fetch(`${supabaseUrl}/auth/v1/settings`, { headers: { apikey: supabaseKey } })
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => setGoogleEnabled(Boolean(s?.external?.google)))
      .catch(() => setGoogleEnabled(false));
  }, []);

  useEffect(() => {
    if (!isConfigured) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      identify(data.session?.user.id ?? null);
      setReady(true);
      // Back from Google: count it like any sign-in, or as a sign-up when the account is brand new.
      const u = data.session?.user;
      if (arrivedFromOAuth && u) {
        const isNew = Date.now() - new Date(u.created_at).getTime() < 2 * 60_000;
        track(isNew ? "signed up" : "signed in", { method: "google" });
      }
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      identify(s?.user.id ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) return error.message === "Invalid login credentials" ? "That email and password don't match." : error.message;
    track("signed in");
    return null;
  };

  /**
   * Accounts are created by the `sign-up` Edge Function, which marks the email confirmed so no
   * email is sent (see Plan.md, "Sign-in method"); then we sign in with the password.
   */
  const signUp = async (name: string, email: string, password: string) => {
    const { data, error } = await supabase.functions.invoke("sign-up", {
      body: { name: name.trim(), email: email.trim(), password },
    });
    if (error) {
      let message = "Couldn't create the account. Try again.";
      try {
        const body = await (error as { context?: Response }).context?.json();
        if (body?.error) message = body.error;
      } catch {
        // keep the generic message
      }
      return message;
    }
    if (!data?.ok) return "Couldn't create the account. Try again.";
    const err = await signIn(email, password);
    if (!err) track("signed up");
    return err;
  };

  const signInWithGoogle = async (returnPath: string) => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}${returnPath}` },
    });
    return error ? "Couldn't reach Google. Try again, or use your email." : null;
  };

  const sendPasswordReset = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (!error) return null;
    if (error.status === 429 || /rate limit/i.test(error.message)) return "Too many reset emails just now. Try again in an hour.";
    return "Couldn't send the email. Check the address and try again.";
  };

  const setNewPassword = async (password: string) => {
    if (password.length < 8 || password.length > 72) return "Use a password of 8 to 72 characters.";
    const { error } = await supabase.auth.updateUser({ password });
    if (!error) return null;
    if (/different from the old/i.test(error.message)) return "That's your current password. Pick a new one.";
    return "Couldn't save the new password. Ask for a new reset link and try again.";
  };

  const resendConfirm = async () => {
    const { data, error } = await supabase.functions.invoke("confirm-email", { body: { action: "resend" } });
    if (error) {
      let message = "Couldn't send it just now. Try again in a bit.";
      try {
        const body = await (error as { context?: Response }).context?.json();
        if (body?.error) message = body.error;
      } catch {
        // keep the generic message
      }
      return { ok: false, message };
    }
    if (data?.already) return { ok: true, message: "Your email is already confirmed." };
    if (data?.code === "reserved") return { ok: false, message: "That address can't get email. Sign up with a real one to confirm it." };
    track("confirm email resent");
    return { ok: true, message: "Sent. Check your inbox, and your spam folder." };
  };

  const refreshUser = async () => {
    await supabase.auth.refreshSession();
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        user: session?.user ?? null,
        ready,
        signUp,
        signIn,
        googleEnabled,
        signInWithGoogle,
        sendPasswordReset,
        setNewPassword,
        emailPending: session?.user?.app_metadata?.email_check === "pending",
        resendConfirm,
        refreshUser,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
