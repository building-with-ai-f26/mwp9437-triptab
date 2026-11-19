import type { PostHog } from "posthog-js";

const key = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const host = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || "https://us.i.posthog.com";

let client: PostHog | null = null;
const queue: ((ph: PostHog) => void)[] = [];

/**
 * Starts PostHog when app/.env.local has a project key; without one, tracking is a no-op.
 * The library loads on demand so the app's first screen stays light.
 */
export function startAnalytics(): void {
  if (!key || client) return;
  import("posthog-js").then(({ default: posthog }) => {
    posthog.init(key, {
      api_host: host,
      capture_pageview: "history_change",
      capture_pageleave: true,
      person_profiles: "identified_only",
      session_recording: { maskAllInputs: true },
    });
    client = posthog;
    tagTestRun(posthog);
    queue.splice(0).forEach((fn) => fn(posthog));
  });
}

function run(fn: (ph: PostHog) => void) {
  if (!key) return;
  if (client) fn(client);
  else queue.push(fn);
}

export type EventName =
  | "signed up"
  | "signed in"
  | "trip created"
  | "person added"
  | "plan added"
  | "plan updated"
  | "plan status changed"
  | "plan moved"
  | "plan move undone"
  | "week view opened"
  | "action item added"
  | "action item done"
  | "pdf opened"
  | "calendar downloaded"
  | "group link copied"
  | "invite emailed"
  | "group link opened"
  | "name claimed"
  | "plan confirmed"
  | "own cost logged"
  | "trip extended"
  | "ai import"
  | "ai plan"
  | "expense added"
  | "settle up viewed"
  | "payment recorded"
  | "payment removed"
  | "venmo added"
  | "pay info saved"
  | "pay info skipped"
  | "ai help opened"
  | "trip described"
  | "described plans reviewed"
  | "described questions parked"
  | "confirm email resent"
  | "email confirmed"
  | "opted out"
  | "opted in";

export function track(event: EventName, props: Record<string, unknown> = {}): void {
  run((ph) => ph.capture(event, props));
}

/**
 * Automated click-throughs (e2e/) set this flag, so their events carry test_run and the PostHog
 * dashboard can leave them out of real usage.
 */
function tagTestRun(ph: PostHog) {
  try {
    if (localStorage.getItem("triptab.test_run") === "1") ph.register({ test_run: true });
  } catch {
    // storage can be unavailable; then nothing is tagged
  }
}

let identifiedAs: string | null = null;

/**
 * Ties events to the Supabase user id (never the email). Only an actual sign-out resets PostHog:
 * resetting on every signed-out page load would give a visitor a new anonymous id each time and
 * break the landing-to-sign-up funnel.
 */
export function identify(userId: string | null): void {
  run((ph) => {
    if (userId && userId !== identifiedAs) {
      ph.identify(userId);
      identifiedAs = userId;
    } else if (!userId && identifiedAs) {
      ph.reset();
      identifiedAs = null;
      tagTestRun(ph);
    }
  });
}
