// Email-in (Mike's call, 11/20): the rules of a forwarded booking confirmation, kept apart from the
// Edge Function so the unit tests run them as is (app/src/lib/inboxRules.test.ts). Which trip an
// address belongs to, who sent it, and what part of the email goes to AI import.
import { FILE_TYPES, MAX_FILE_BYTES, MAX_TEXT_CHARS } from "../import-bookings/rules.ts";

/**
 * A trip's address is trip+<code>@triptab.org, the way Wanderlog gives each trip trips+<n>@wanderlog.com
 * (Mike's pointer, 11/20). Cloudflare Email Routing sends trip@triptab.org, +code and all, to the
 * triptab Worker.
 */
export const INBOX_DOMAIN = "triptab.org";
export const inboxAddress = (token: string) => `trip+${token}@${INBOX_DOMAIN}`;
/** Emails a trip takes in a day (New York time), whatever they hold. Import's own caps also apply. */
export const MAX_EMAILS_PER_TRIP_DAY = 20;
/** Bigger than this is turned away before anything reads it (the Worker checks it too). */
export const MAX_EMAIL_BYTES = 8_000_000;

/** The trip's code in an address like "trip+3f9a0b1c2d3e4f5a@triptab.org", or null. Any case. */
export function inboxToken(address: string | null | undefined): string | null {
  const m = String(address ?? "").trim().toLowerCase().match(/^<?trip\+([0-9a-f]{16})@([a-z0-9.-]+)>?$/);
  return m ? m[1] : null;
}

/** The bare address in a From header ("Mike <mike@x.com>" is "mike@x.com"), lower case, or null. */
export function senderAddress(from: string | null | undefined): string | null {
  const s = String(from ?? "").trim();
  const angle = s.match(/<([^<>\s]+@[^<>\s]+)>/);
  const bare = angle ? angle[1] : s.match(/[^\s<>"]+@[^\s<>"]+/)?.[0];
  return bare ? bare.toLowerCase() : null;
}

/**
 * Every address an account signs in with: its email, and each linked sign-in's (Google linked to an
 * email account, C19), so a booking forwarded from either is theirs.
 */
export function accountEmails(user: { email?: string | null; identities?: { identity_data?: { email?: unknown } | null }[] | null } | null | undefined): string[] {
  if (!user) return [];
  const all = [user.email, ...(user.identities ?? []).map((i) => i.identity_data?.email)];
  return [...new Set(all.filter((e): e is string => typeof e === "string" && e.includes("@")).map((e) => e.trim().toLowerCase()))];
}

/** A sender counts when the address matches one on the trip (an account's email or the email an Owner entered). */
export function isOnTrip(sender: string | null, emails: (string | null | undefined)[]): boolean {
  if (!sender) return false;
  return emails.some((e) => e && e.trim().toLowerCase() === sender);
}

/** HTML mail as plain lines: no tags, scripts or styles, common entities decoded, blank runs folded. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|table)>/gi, "\n")
    .replace(/<\/t[dh]>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface ParsedMail {
  subject?: string | null;
  text?: string | null;
  html?: string | null;
  attachments?: { mimeType?: string | null; filename?: string | null; content: ArrayBuffer | Uint8Array }[];
}

export interface ImportInput {
  text: string;
  file: { media_type: string; data: string } | null;
  subject: string | null;
}

const toBase64 = (bytes: Uint8Array): string => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

/**
 * What goes to import: the email's text (or its HTML as text), cut to import's limit, and its first
 * PDF (else its first photo) that import takes and that fits under 3 MB. Null when there's nothing to
 * read at all.
 */
export function importInput(mail: ParsedMail): ImportInput | null {
  const body = (mail.text && mail.text.trim()) || (mail.html ? htmlToText(mail.html) : "");
  const subject = mail.subject?.trim() ? mail.subject.trim().slice(0, 200) : null;
  const text = [subject ? `Subject: ${subject}` : "", body].filter(Boolean).join("\n\n").slice(0, MAX_TEXT_CHARS);
  const usable = (mail.attachments ?? [])
    .map((a) => ({ type: (a.mimeType ?? "").toLowerCase(), bytes: a.content instanceof Uint8Array ? a.content : new Uint8Array(a.content) }))
    .filter((a) => FILE_TYPES.includes(a.type) && a.bytes.length > 0 && a.bytes.length <= MAX_FILE_BYTES);
  const pick = usable.find((a) => a.type === "application/pdf") ?? usable[0];
  const file = pick ? { media_type: pick.type, data: toBase64(pick.bytes) } : null;
  if (!body && !file) return null;
  return { text, file, subject };
}

/**
 * Whether Cloudflare found the email really came from its From address: DMARC passed, in the first
 * Authentication-Results header, the one Cloudflare's mail servers (mx.cloudflare.net) prepend before
 * the Worker runs. The Worker passes it on as it reads it; repeats of the header (a sender can add
 * their own) come after the first, joined by ", ", and are never read. Comments don't count.
 */
export function dmarcPassed(results: string | null | undefined): boolean {
  // Comments in parentheses can hold commas and words like "dmarc=pass": drop them first (nested
  // ones too), so the only commas left are the ones joining repeated headers.
  let text = String(results ?? "");
  for (let prev = ""; prev !== text; ) [prev, text] = [text, text.replace(/\([^()]*\)/g, " ")];
  const first = text.split(",")[0];
  const [authserv, ...rest] = first.split(";").map((s) => s.trim());
  if (!/^mx\.cloudflare\.net(\s|$)/i.test(authserv ?? "")) return false;
  const dmarc = rest.find((s) => /^dmarc=/i.test(s));
  return Boolean(dmarc && /^dmarc=pass\b/i.test(dmarc));
}

/** Constant-time comparison for the Worker's shared secret. */
export function sameSecret(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
