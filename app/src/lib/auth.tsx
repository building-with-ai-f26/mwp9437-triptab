import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { isConfigured, supabase } from "./supabase";
import { identify, track } from "./analytics";

interface AuthState {
  user: User | null;
  ready: boolean;
  signUp: (name: string, email: string, password: string) => Promise<string | null>;
  signIn: (email: string, password: string) => Promise<string | null>;
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

  useEffect(() => {
    if (!isConfigured) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      identify(data.session?.user.id ?? null);
      setReady(true);
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

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user: session?.user ?? null, ready, signUp, signIn, signOut }}>
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
