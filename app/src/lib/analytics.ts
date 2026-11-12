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
  | "group link copied"
  | "group link opened"
  | "name claimed"
  | "plan confirmed"
  | "expense added"
  | "settle up viewed"
  | "opted out"
  | "opted in";

export function track(event: EventName, props: Record<string, unknown> = {}): void {
  run((ph) => ph.capture(event, props));
}

/** Ties events to the Supabase user id (never the email). */
export function identify(userId: string | null): void {
  run((ph) => (userId ? ph.identify(userId) : ph.reset()));
}
