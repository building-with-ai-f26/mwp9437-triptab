import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { CHECK_EVERY_MS, CHECK_GAP_MS, isNewBuild } from "../lib/staleBuild";
import { track } from "../lib/analytics";

/**
 * "A new version of TripTab is ready" (C57, Mike's call 11/24). A tab left open keeps running the
 * build it loaded: on 11/23 Mike's feedback note went the old way, with no email, until he
 * refreshed. So an open tab asks which build is live when it comes back into view and every few
 * minutes while it's on screen, and offers a reload when it's behind. It never reloads by itself,
 * which could throw away something half typed.
 */
export function NewVersionNote() {
  const [ready, setReady] = useState(false);
  const [later, setLater] = useState(false);

  useEffect(() => {
    let last = Date.now();
    let found = false;
    const check = async () => {
      if (found || document.visibilityState !== "visible" || Date.now() - last < CHECK_GAP_MS) return;
      last = Date.now();
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        if (isNewBuild(__BUILD_ID__, await res.json())) {
          found = true;
          setReady(true);
          track("new version offered", {});
        }
      } catch {
        // Offline or a hiccup: ask again next time.
      }
    };
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    const timer = window.setInterval(check, CHECK_EVERY_MS);
    return () => {
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
      window.clearInterval(timer);
    };
  }, []);

  if (!ready || later) return null;
  return (
    <div
      role="status"
      data-testid="new-version"
      className="fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-foreground/10 bg-[#f4f0ea] px-4 py-3 text-sm shadow-xl lg:bottom-4"
    >
      <RefreshCw className="size-4 shrink-0 text-primary" />
      <p className="min-w-0 flex-1 text-foreground">
        <span className="font-semibold">A new version of TripTab is ready.</span> Reload to get it.
      </p>
      <button
        type="button"
        onClick={() => {
          track("new version reloaded", {});
          window.location.reload();
        }}
        className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-primary px-4 font-semibold text-primary-foreground"
      >
        Reload
      </button>
      <button type="button" onClick={() => setLater(true)} className="inline-flex min-h-11 shrink-0 items-center px-1 text-xs text-muted-foreground">
        Later
      </button>
    </div>
  );
}
