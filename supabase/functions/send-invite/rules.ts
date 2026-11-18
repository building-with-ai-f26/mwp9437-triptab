// The rules of invite emails that don't need the network: the rate limits, which address a link
// may point at, and the email itself. Its only import is the shared email layout (import-free), so
// the app's unit tests (app/src/lib/inviteRules.test.ts) run this same file.
import { emailHtml } from "../_shared/email.ts";

// ---------- Rate limits, over the last 24 hours, counted from the invite_emails log ----------
// Resend's free plan sends 100 emails a day for the whole domain: invites take up to 65, leaving
// 20 for confirm-your-email links (supabase/functions/_shared/account.ts) and the rest for
// password resets.
export const LIMITS = {
  /** Emails to one person on a trip: a nudge or two, never a stream. */
  perPerson: 3,
  /** Emails for one trip. */
  perTrip: 30,
  /** Emails one signed-in person sends, across all their trips. */
  perSender: 50,
  /** Every invite email TripTab sends. */
  total: 65,
} as const;

export interface SentRow {
  trip_id: string | null;
  traveler_id: string | null;
  sent_by: string;
}

export type Blocked = { code: "capped_person" | "capped_trip" | "capped_sender" | "capped_total"; message: string };

/** Whether one more invite may go out, given the invites actually sent in the last 24 hours. */
export function inviteDecision(sent: SentRow[], tripId: string, travelerId: string, senderId: string): Blocked | null {
  if (sent.filter((r) => r.traveler_id === travelerId).length >= LIMITS.perPerson) {
    return { code: "capped_person", message: `They've had ${LIMITS.perPerson} invite emails today. Try again tomorrow, or text them the link.` };
  }
  if (sent.filter((r) => r.trip_id === tripId).length >= LIMITS.perTrip) {
    return { code: "capped_trip", message: "This trip has sent all its invite emails for today. Copy the link and send it yourself." };
  }
  if (sent.filter((r) => r.sent_by === senderId).length >= LIMITS.perSender) {
    return { code: "capped_sender", message: "You've sent all your invite emails for today. Copy the link and send it yourself." };
  }
  if (sent.length >= LIMITS.total) {
    return { code: "capped_total", message: "TripTab has sent all its invite emails for today. Copy the link and send it yourself." };
  }
  return null;
}

// ---------- Where a link in an email may point ----------
export const DEFAULT_APP_URL = "https://triptab.org";
const ALLOWED_ON_DEV = new Set(["http://localhost:5173"]);
/** This repo's pull request Previews on Cloudflare: <name>-triptab.<account>.workers.dev. */
const PREVIEW = /^https:\/\/[a-z0-9-]+-triptab\.[a-z0-9-]+\.workers\.dev$/;

/**
 * The site an invite links to. Production always links to triptab.org. TripTab dev, which local
 * runs and Previews use, links back to a local run or a Preview when that's where the Owner is, so
 * nobody can make TripTab email a link to their own site.
 */
export function pickAppUrl(origin: string | null | undefined, dev = false): string {
  if (!origin || !dev) return DEFAULT_APP_URL;
  const o = origin.replace(/\/+$/, "").toLowerCase();
  return ALLOWED_ON_DEV.has(o) || PREVIEW.test(o) ? o : DEFAULT_APP_URL;
}

export interface InviteParts {
  inviter: string;
  person: string;
  tripName: string;
  dates: string;
  stops: string[];
  url: string;
}

/** Subject, plain text and HTML for one invite. Names come from people, so the HTML escapes them. */
export function buildInvite(p: InviteParts): { subject: string; text: string; html: string } {
  const where = p.stops.length ? ` · ${p.stops.join(", ")}` : "";
  const subject = `${p.inviter} added you to ${p.tripName} on TripTab`;
  const text = [
    `Hi ${p.person},`,
    "",
    `${p.inviter} added you to ${p.tripName} (${p.dates}${where}) on TripTab, where the group plans the trip and splits what it costs.`,
    "",
    `See the plan and claim your spot: ${p.url}`,
    "",
    "Reply to this email to reach " + p.inviter + ".",
  ].join("\n");
  const html = emailHtml({
    preview: `${p.inviter} added you to ${p.tripName}.`,
    label: "You're invited",
    title: p.tripName,
    meta: `${p.dates}${where}`.replace(/^ · /, ""),
    paragraphs: [`Hi ${p.person}, ${p.inviter} added you to the trip. TripTab is where the group plans it and splits what it costs.`],
    button: { text: "See the plan", url: p.url },
    footnote: `Reply to this email to reach ${p.inviter}.`,
  });
  return { subject, text, html };
}
