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
 *
 * Since the 11/22 audit the same goes for the one-time values an address can carry for a moment:
 * the sign-in code Google sends back (?code=), the confirm-your-email token (?t=) and the
 * password-reset token (?token_hash=). Each works once and is spent on arrival, but PostHog's first
 * page view can fire before the page takes it out of the address, and eight sign-in codes had
 * reached PostHog that way. Names typed on the join page (?name=) are left out too. And a property's
 * name is scrubbed as well as its value: heatmap data is filed under the page's address.
 */
const LINK = /(\/|%2F)join(\/|%2F)[A-Za-z0-9_-]{8,}/gi;
const KEYS = "code|t|token_hash|token|name";
const ONE_TIME = new RegExp(`([?&#])(${KEYS})(=)[^&#\\s"']+`, "gi");
/** The same inside a URL-encoded address (a link within a link): the value runs to the next encoded & or #. */
const ONE_TIME_ENCODED = new RegExp(`(%3F|%26)(${KEYS})(%3D)(?:(?!%26|%23)[^&#\\s"'])+`, "gi");
const HAS_SECRET = new RegExp(`${LINK.source}|${ONE_TIME.source}|${ONE_TIME_ENCODED.source}`, "i");
const hide = (_m: string, sep: string, key: string, eq: string) => `${sep}${key}${eq}[hidden]`;
export const scrubLinks = (s: string): string =>
  s.replace(LINK, (_m, a: string, b: string) => `${a}join${b}[link]`).replace(ONE_TIME, hide).replace(ONE_TIME_ENCODED, hide);

/**
 * Emails and phone numbers stay out of PostHog too (security audit, 11/22; the privacy page says
 * "never your email"). The app shows them on screen in places: the address you're signed in as, a
 * person's contact for an Owner, a Zelle number, a trip's own address. Replays run every piece of
 * on-screen text through hidePersonal, so the rest of the screen stays readable; clicked elements'
 * text goes through it as well, and an email is taken out of anything else an event carries.
 */
const EMAIL = /[A-Za-z0-9._%+-]+(@|%40)[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+/g;
const PHONE = /[+(]?\d[\d\s().-]{7,}\d/g;
export const hideEmails = (s: string): string => (s.includes("@") || /%40/i.test(s) ? s.replace(EMAIL, "[email]") : s);
/** A run of digits is a phone number at 10 digits or more, which leaves dates, times and prices alone. */
export const hidePersonal = (s: string): string =>
  hideEmails(s).replace(PHONE, (m) => (m.replace(/\D/g, "").length >= 10 ? "[number]" : m));
const TEXT_KEYS = new Set(["$el_text", "text"]);

/** `allText`: every string is treated as on-screen text (an error's message can quote anything). */
function scrubDeep(v: unknown, key = "", allText = false): unknown {
  if (typeof v === "string") {
    const s = HAS_SECRET.test(v) ? scrubLinks(v) : v;
    return allText || TEXT_KEYS.has(key) ? hidePersonal(s) : hideEmails(s);
  }
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) v[i] = scrubDeep(v[i], key, allText);
    return v;
  }
  if (v && typeof v === "object" && !(v instanceof Date)) {
    const o = v as Record<string, unknown>;
    for (const k of Object.keys(o)) {
      const value = scrubDeep(o[k], k, allText);
      if (HAS_SECRET.test(k)) {
        delete o[k];
        o[scrubLinks(k)] = value;
      } else o[k] = value;
    }
  }
  return v;
}

/**
 * PostHog's before_send: the same event with every group link token and one-time code taken out.
 * Errors (C48, 11/23) go through it like every other event, and more strictly: an error's message
 * and stack can quote whatever was on screen, so phone numbers come out of all of it too.
 */
export function scrubEvent(event: CaptureResult | null): CaptureResult | null {
  if (!event) return event;
  scrubDeep(event.properties, "", event.event === "$exception");
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
      // Clicks are recorded by the element's text and tag, never its attributes (security audit,
      // 11/22): a label or an address on a button can hold an email, a Zelle number or a Venmo link.
      mask_all_element_attributes: true,
      // In replays, typed text is hidden, and emails and phone numbers are taken out of everything
      // shown on screen (hidePersonal, above); the rest of the screen stays readable.
      session_recording: { maskAllInputs: true, maskTextSelector: "*", maskTextFn: hidePersonal },
      // TripTab uses no feature flags, and the request that fetches them carries the address a
      // visitor first landed on as it was, past both hooks below (security audit, 11/22: a one-time
      // code went out that way). The request still loads PostHog's settings; it just asks for no flags.
      advanced_disable_feature_flags: true,
      // Errors the app runs into (C48, Mike's call 11/23): uncaught errors and failed promises, so a
      // crash is something we can see. They pass through before_send below like everything else.
      capture_exceptions: { capture_unhandled_errors: true, capture_unhandled_rejections: true, capture_console_errors: false },
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
  | "landing start"
  | "landing section opened"
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
  | "trip settings opened"
  | "plans repeated"
  | "plan split"
  | "payment scheduled"
  | "payment marked"
  | "add opened"
  | "add picked"
  | "group link copied"
  | "group link texted"
  | "group link shared"
  | "invite opened"
  | "invite emailed"
  | "group link opened"
  | "name claimed"
  | "plan confirmed"
  | "confirm opened"
  | "own cost logged"
  | "trip extended"
  | "ai import"
  | "ai plan"
  | "expense added"
  | "settle up viewed"
  | "money list opened"
  | "tour started"
  | "help opened"
  | "guide opened"
  | "feedback sent"
  | "new version offered"
  | "new version reloaded"
  | "tour finished"
  | "tour skipped"
  | "payment recorded"
  | "payment removed"
  | "venmo added"
  | "pay info saved"
  | "profile saved"
  | "preferences saved"
  | "pay info skipped"
  | "ai help opened"
  | "import opened"
  | "plan merged"
  | "forward address code sent"
  | "forward address confirmed"
  | "foreign cost"
  | "fx settled"
  | "cost to come"
  | "inbox review opened"
  | "inbox reviewed"
  | "inbox dismissed"
  | "inbox held read"
  | "trip described"
  | "described plans reviewed"
  | "described questions parked"
  | "confirm email resent"
  | "email confirmed"
  | "opted out"
  | "plan voted"
  | "plan vote removed"
  | "opted in";

export function track(event: EventName, props: Record<string, unknown> = {}): void {
  run((ph) => ph.capture(event, props));
}

/** An error the app caught itself (the screen that replaces a crashed page), sent like any other. */
export function reportError(error: unknown, where: string): void {
  run((ph) => ph.captureException(error, { where }));
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
