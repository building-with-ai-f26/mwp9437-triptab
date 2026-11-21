// Rules shared by sign-up and confirm-email that don't need the network: sign-up rate limits,
// confirm-email limits, which addresses are never emailed, which site a link may point at, the
// token's hash, and the email itself. Its only import is the email layout (also import-free), so
// the app's unit tests (app/src/lib/accountRules.test.ts) run this same file.
import { emailHtml } from "./email.ts";

// ---------- Rate limits ----------
// Sign-ups, per caller address and in all, over the last hour. Roomy on production, since a group
// often joins from one café's Wi-Fi; far roomier on TripTab dev, which runs the test suites (about
// 30 throwaway sign-ups each) many times an hour.
export const SIGNUP_LIMITS = { prod: { perIp: 20, total: 200 }, dev: { perIp: 1000, total: 5000 } } as const;
// Confirm-your-email sends, per person and in all, over the last 24 hours. Resend's free plan
// sends 100 a day for triptab.org: invites keep 65, these 20, and password resets the rest.
export const CONFIRM_LIMITS = { perUser: 3, total: 20 } as const;

export interface EventRow {
  kind: string;
  user_id: string | null;
  ip_hash: string | null;
}

export type Refusal = { code: string; message: string };

export function signUpDecision(lastHour: EventRow[], ipHash: string, dev: boolean): Refusal | null {
  const lim = dev ? SIGNUP_LIMITS.dev : SIGNUP_LIMITS.prod;
  const signUps = lastHour.filter((r) => r.kind === "sign_up");
  if (signUps.filter((r) => r.ip_hash === ipHash).length >= lim.perIp) {
    return { code: "capped_ip", message: "Lots of accounts were just made from here. Try again in an hour, or continue with Google." };
  }
  if (signUps.length >= lim.total) {
    return { code: "capped_total", message: "TripTab is getting a lot of sign-ups right now. Try again in a little while, or continue with Google." };
  }
  return null;
}

/** Emails that count toward the day's total: confirm-your-email links and Also forward from codes (C31). */
const ACCOUNT_SENDS = ["confirm_sent", "forward_code_sent"];

export function confirmSendDecision(lastDay: EventRow[], userId: string): Refusal | null {
  const sends = lastDay.filter((r) => r.kind === "confirm_sent");
  if (sends.filter((r) => r.user_id === userId).length >= CONFIRM_LIMITS.perUser) {
    return { code: "capped_user", message: "We've sent you 3 links today. Check your spam folder, or try again tomorrow." };
  }
  if (lastDay.filter((r) => ACCOUNT_SENDS.includes(r.kind)).length >= CONFIRM_LIMITS.total) {
    return { code: "capped_total", message: "TripTab has sent all its confirmation emails for today. Try again tomorrow." };
  }
  return null;
}

// ---------- Also forward from (C31, Mike's call 11/21) ----------
// More addresses an account forwards bookings from, each confirmed by a 6-digit code sent there.
export const FORWARD_LIMITS = { addresses: 3, codesPerUser: 3, minutes: 30, tries: 5 } as const;

/** An address as typed, ready to compare and keep: trimmed, lower case, or null if it isn't one. */
export function normalAddress(raw: unknown): string | null {
  const s = String(raw ?? "").trim().toLowerCase();
  return s.length >= 6 && s.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s) ? s : null;
}

/** Whether another code may go out: per person today, the day's total (shared with confirm links), and how many addresses they have. */
export function forwardSendDecision(lastDay: EventRow[], userId: string, otherAddresses: number): Refusal | null {
  if (otherAddresses >= FORWARD_LIMITS.addresses) {
    return { code: "too_many", message: `You can forward from ${FORWARD_LIMITS.addresses} more addresses at most. Remove one first.` };
  }
  if (lastDay.filter((r) => r.kind === "forward_code_sent" && r.user_id === userId).length >= FORWARD_LIMITS.codesPerUser) {
    return { code: "capped_user", message: `We've sent you ${FORWARD_LIMITS.codesPerUser} codes today. Check that address's spam folder, or try again tomorrow.` };
  }
  if (lastDay.filter((r) => ACCOUNT_SENDS.includes(r.kind)).length >= CONFIRM_LIMITS.total) {
    return { code: "capped_total", message: "TripTab has sent all the codes it can today. Try again tomorrow." };
  }
  return null;
}

/** A 6-digit code, random. */
export function newCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return String(n).padStart(6, "0");
}

/** A code's hash, tied to its address's row, so a code for one address never works for another. */
export const codeHash = (rowId: string, code: string) => tokenHash(`forward:${rowId}:${code}`);

/** Why a typed code doesn't confirm the address, or null when it does. */
export function forwardCodeDecision(
  row: { code_hash: string | null; code_sent_at: string | null; tries: number; confirmed_at: string | null },
  typedHash: string,
  now = Date.now(),
): Refusal | null {
  if (row.confirmed_at) return null;
  if (!row.code_hash || !row.code_sent_at || now - new Date(row.code_sent_at).getTime() > FORWARD_LIMITS.minutes * 60 * 1000) {
    return { code: "expired", message: "That code has run out. Send a new one." };
  }
  if (row.tries >= FORWARD_LIMITS.tries) return { code: "too_many_tries", message: "Too many wrong tries. Send a new code." };
  if (typedHash !== row.code_hash) return { code: "wrong_code", message: "That code doesn't match. Check the latest email and try again." };
  return null;
}

export function buildForwardCodeEmail(p: { name: string; code: string; address: string; url: string }): { subject: string; text: string; html: string } {
  const subject = `${p.code} is your TripTab code`;
  const text = [
    `Hi ${p.name},`,
    "",
    `Your code is ${p.code}. Type it in TripTab to forward bookings from ${p.address} to your trips.`,
    "",
    `It works for ${FORWARD_LIMITS.minutes} minutes. Didn't ask for it? Ignore this email: nothing changes.`,
  ].join("\n");
  const html = emailHtml({
    preview: `Your code is ${p.code}.`,
    label: "Your TripTab account",
    title: `Your code: ${p.code}`,
    paragraphs: [`Hi ${p.name}, type this code in TripTab, under Also forward from, to forward bookings from ${p.address} to your trips.`],
    button: { text: "Open TripTab", url: p.url },
    footnote: `It works for ${FORWARD_LIMITS.minutes} minutes. Didn't ask for it? Ignore this email: nothing changes.`,
  });
  return { subject, text, html };
}

// ---------- Addresses never emailed ----------
// Reserved for examples and testing (RFC 2606 and 6761): nobody can receive mail there, so sending
// would only bounce and count against the day's emails. The test suites sign up with these.
export function isReservedEmail(email: string): boolean {
  const domain = email.trim().toLowerCase().split("@")[1] ?? "";
  return /(^|\.)example\.(com|net|org)$/.test(domain) || /\.(test|invalid|example|localhost)$/.test(domain);
}

// ---------- Where a link in an email may point ----------
export const DEFAULT_APP_URL = "https://triptab.org";
const ALLOWED_ON_DEV = new Set(["http://localhost:5173"]);
/** This repo's pull request Previews on Cloudflare: <name>-triptab.<account>.workers.dev. */
const PREVIEW = /^https:\/\/[a-z0-9-]+-triptab\.[a-z0-9-]+\.workers\.dev$/;

/**
 * The site a link in an email opens. Production always links to triptab.org (11/18: a test email
 * sent from a local run linked to localhost, which only works on that machine). TripTab dev, which
 * local runs and pull request Previews use, links back to where the request came from, if that's
 * a local run or a Preview. Nobody can make TripTab email a link to their own site.
 */
export function pickAppUrl(origin: string | null | undefined, dev = false): string {
  if (!origin || !dev) return DEFAULT_APP_URL;
  const o = origin.replace(/\/+$/, "").toLowerCase();
  return ALLOWED_ON_DEV.has(o) || PREVIEW.test(o) ? o : DEFAULT_APP_URL;
}

// ---------- The token ----------
/** A one-time token: 32 random bytes as hex. Only its hash is stored. */
export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function tokenHash(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The caller's address, hashed, so the rate limit never stores an IP. */
export async function ipHashOf(forwardedFor: string | null): Promise<string> {
  const ip = (forwardedFor ?? "").split(",")[0].trim() || "unknown";
  return (await tokenHash(`triptab-ip:${ip}`)).slice(0, 32);
}

// ---------- The email ----------
export function buildConfirmEmail(p: { name: string; url: string }): { subject: string; text: string; html: string } {
  const subject = "Confirm your email for TripTab";
  const text = [
    `Hi ${p.name},`,
    "",
    "Tap the link to confirm this is your email. You can already use TripTab; this keeps password resets and invites reaching you.",
    "",
    p.url,
    "",
    "Didn't make a TripTab account? Ignore this email.",
  ].join("\n");
  const html = emailHtml({
    preview: "One tap to confirm this is your email.",
    label: "Your TripTab account",
    title: "Confirm your email",
    paragraphs: [`Hi ${p.name}, tap below to confirm this is your email.`, "You can already use TripTab. This keeps password resets and invites reaching you."],
    button: { text: "Confirm my email", url: p.url },
    footnote: `Didn't make a TripTab account? Ignore this email. The link works for ${TOKEN_DAYS} days.`,
  });
  return { subject, text, html };
}

/** How long a link works. */
export const TOKEN_DAYS = 7;
