import type { CaptureResult, PostHog } from "posthog-js";

const key = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const host = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || "https://us.i.posthog.com";

/**
 * A group link works like a key to its trip: whoever joins through one gets the link's role (Owner
 * by default, Mike's 11/16 call). So its token never goes to PostHog (security audit, 11/19). Page
 * addresses carry /join/[link] instead, and anything else an event holds is scrubbed the same way,
 * plain or URL-encoded (a text-message link, a clicked element's address, a replay's page). In
 * replays, the link's own elements are also left out whole (`ph-no-capture` in People), since
 * PostHog compresses page snapshots before they reach this hook.
 */
const LINK = /(\/|%2F)join(\/|%2F)[A-Za-z0-9_-]{8,}/gi;
const HAS_LINK = new RegExp(LINK.source, "i");
export const scrubLinks = (s: string): string => s.replace(LINK, (_m, a: string, b: string) => `${a}join${b}[link]`);

function scrubDeep(v: unknown): unknown {
  if (typeof v === "string") return HAS_LINK.test(v) ? scrubLinks(v) : v;
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) v[i] = scrubDeep(v[i]);
    return v;
  }
  if (v && typeof v === "object" && !(v instanceof Date)) {
    const o = v as Record<string, unknown>;
    for (const k of Object.keys(o)) o[k] = scrubDeep(o[k]);
  }
  return v;
}

/** PostHog's before_send: the same event with every group link token taken out. */
export function scrubEvent(event: CaptureResult | null): CaptureResult | null {
  if (!event) return event;
  scrubDeep(event.properties);
  if (event.$set) scrubDeep(event.$set);
  if (event.$set_once) scrubDeep(event.$set_once);
  return event;
}

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
      get_current_url: scrubLinks,
      before_send: scrubEvent,
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
  | "google linked"
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
  | "group link texted"
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
  | "money list opened"
  | "tour started"
  | "tour finished"
  | "tour skipped"
  | "payment recorded"
  | "payment removed"
  | "venmo added"
  | "pay info saved"
  | "pay info skipped"
  | "ai help opened"
  | "import opened"
  | "inbox review opened"
  | "inbox reviewed"
  | "inbox dismissed"
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
