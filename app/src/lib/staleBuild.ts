/**
 * A tab opened before a deploy still runs the old build, and the old build's page files (TripPage-*.js)
 * are gone after it: opening a trip then fails ("'text/html' is not a valid JavaScript MIME type", seen in
 * PostHog in Mike's 11/19 review). Vite reports that as `vite:preloadError`; reloading picks up the new
 * build. Once a minute at most, so a file that is really missing shows its error instead of looping.
 */
export const RELOADED_KEY = "triptab.reloaded_for_build";

export function shouldReload(now: number, last: string | null): boolean {
  const at = Number(last ?? 0);
  return !Number.isFinite(at) || now - at > 60_000;
}

export function reloadOnStaleBuild(): void {
  window.addEventListener("vite:preloadError", (event) => {
    let last: string | null = null;
    try {
      last = sessionStorage.getItem(RELOADED_KEY);
    } catch {
      // No storage (a private window): reload anyway, once, as below.
    }
    if (!shouldReload(Date.now(), last)) return;
    try {
      sessionStorage.setItem(RELOADED_KEY, String(Date.now()));
    } catch {
      // Ignore: the reload still helps.
    }
    event.preventDefault();
    window.location.reload();
  });
}
