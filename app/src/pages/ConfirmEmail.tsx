import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Brand } from "../components/Brand";
import { PhotoFrame, Spinner } from "../components/ui";
import { LANDING_PHOTO } from "../lib/photos";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { track } from "../lib/analytics";

/**
 * Where the "Confirm your email" link lands (C6, Mike's 11/18 call). It works on any device, signed
 * in or not, once, for 7 days. The token leaves the address bar at once, so it can't be reused from
 * history.
 */
export default function ConfirmEmail() {
  const { user, ready, refreshUser } = useAuth();
  const [state, setState] = useState<"checking" | "done" | "failed">("checking");
  const [message, setMessage] = useState("");
  const started = useRef(false);

  useEffect(() => {
    if (!ready || started.current) return;
    started.current = true;
    const token = new URLSearchParams(window.location.search).get("t") ?? "";
    window.history.replaceState(null, "", window.location.pathname);
    supabase.functions.invoke("confirm-email", { body: { action: "confirm", token } }).then(async ({ error }) => {
      if (!error) {
        track("email confirmed");
        if (user) await refreshUser();
        setState("done");
        return;
      }
      let text = "This link has run out or was already used. Send a new one from TripTab.";
      try {
        const body = await (error as { context?: Response }).context?.json();
        if (body?.error) text = body.error;
      } catch {
        // keep the generic message
      }
      setMessage(text);
      setState("failed");
    });
  }, [ready, user, refreshUser]);

  return (
    <div className="relative flex min-h-dvh flex-col">
      <PhotoFrame src={LANDING_PHOTO} tone="landing" />
      <header className="relative z-10 px-4 py-4 sm:px-6 sm:py-5">
        <Brand light />
      </header>
      <main className="relative z-10 flex flex-1 items-start justify-center px-4 pb-10 pt-4 sm:items-center">
        <div className="glass-card-readable w-full max-w-sm rounded-3xl p-6">
          {state === "checking" && <Spinner label="Confirming your email" />}
          {state === "done" && (
            <>
              <h1 className="mb-1 font-display text-2xl font-bold italic text-white">Email confirmed</h1>
              <p className="mb-5 text-sm text-white/80">Thanks. Password resets and invites will reach you here.</p>
              <Link
                to={user ? "/trips" : "/sign-in?mode=sign-in"}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-white px-5 text-sm font-semibold text-foreground"
              >
                {user ? "Open my trips" : "Sign in"}
              </Link>
            </>
          )}
          {state === "failed" && (
            <>
              <h1 className="mb-1 font-display text-2xl font-bold italic text-white">That link didn't work</h1>
              <p className="mb-5 text-sm text-white/80">{message}</p>
              <Link
                to={user ? "/trips" : "/sign-in?mode=sign-in"}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-white px-5 text-sm font-semibold text-foreground"
              >
                {user ? "Go to my trips" : "Sign in"}
              </Link>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
