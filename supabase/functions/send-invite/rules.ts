// The rules of invite emails that don't need the network: the rate limits, which address a link
// may point at, and the email itself. No imports, so the app's unit tests
// (app/src/lib/inviteRules.test.ts) run this same file.

// ---------- Rate limits, over the last 24 hours, counted from the invite_emails log ----------
// Resend's free plan sends 100 emails a day for the whole domain; invites keep 20 of those free
// for sign-in emails (password resets).
export const LIMITS = {
  /** Emails to one person on a trip: a nudge or two, never a stream. */
  perPerson: 3,
  /** Emails for one trip. */
  perTrip: 30,
  /** Emails one signed-in person sends, across all their trips. */
  perSender: 50,
  /** Every invite email TripTab sends. */
  total: 80,
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
const ALLOWED = new Set(["https://triptab.org", "http://localhost:5173"]);
/** This repo's pull request Previews on Cloudflare: <name>-triptab.<account>.workers.dev. */
const PREVIEW = /^https:\/\/[a-z0-9-]+-triptab\.[a-z0-9-]+\.workers\.dev$/;

/**
 * The site an invite links to. The caller's Origin header is used only when it is TripTab itself
 * (production, a local run or a Preview), so nobody can make TripTab email a link to their own site.
 */
export function pickAppUrl(origin: string | null | undefined): string {
  if (!origin) return DEFAULT_APP_URL;
  const o = origin.replace(/\/+$/, "").toLowerCase();
  return ALLOWED.has(o) || PREVIEW.test(o) ? o : DEFAULT_APP_URL;
}

// ---------- The email ----------
const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

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
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f4ede3;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#2b2118">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px">
<p style="margin:0 0 4px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#6b4a2b">TripTab</p>
<h1 style="margin:0 0 12px;font-family:Georgia,serif;font-style:italic;font-size:26px">${escapeHtml(p.tripName)}</h1>
<p style="margin:0 0 16px;font-size:14px;color:#5c4a3a">${escapeHtml(p.dates)}${escapeHtml(where)}</p>
<p style="margin:0 0 20px;font-size:16px;line-height:1.5">Hi ${escapeHtml(p.person)}, ${escapeHtml(p.inviter)} added you to the trip. TripTab is where the group plans it and splits what it costs.</p>
<p style="margin:0 0 24px"><a href="${escapeHtml(p.url)}" style="display:inline-block;background:#6b4a2b;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:999px">See the plan</a></p>
<p style="margin:0;font-size:13px;color:#5c4a3a">Reply to this email to reach ${escapeHtml(p.inviter)}.</p>
</div></body></html>`;
  return { subject, text, html };
}
