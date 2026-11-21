// The triptab Worker. Pages and files are static (the "assets" in wrangler.jsonc answer every web
// request before this code runs), so fetch only passes a request on to them. What it adds is email:
// Cloudflare Email Routing hands mail sent to trip+<code>@triptab.org here (Mike's call, 11/20,
// forwarding booking confirmations to a trip), and this passes the raw email on to the inbox-email
// Edge Function with a shared secret. The function does the rest; nothing is read or kept here.
//
// INBOX_SECRET is a Worker secret Mike sets in Cloudflare (and the same value in Supabase). It never
// appears in a file, a commit or the app.

interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  INBOX_URL: string;
  INBOX_SECRET?: string;
}

interface IncomingEmail {
  readonly to: string;
  readonly from: string;
  readonly headers: Headers;
  readonly raw: ReadableStream<Uint8Array>;
  readonly rawSize: number;
  setReject(reason: string): void;
}

import { bounceFor, type InboxAnswer } from "./bounce";

const MAX_EMAIL_BYTES = 8_000_000;

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },

  async email(message: IncomingEmail, env: Env): Promise<void> {
    if (message.rawSize > MAX_EMAIL_BYTES) return message.setReject(bounceFor(413, null)!);
    if (!env.INBOX_SECRET || !env.INBOX_URL) return message.setReject("TripTab's email inbox isn't set up yet. Add the booking in the app for now.");
    const raw = await new Response(message.raw).arrayBuffer();
    const res = await fetch(env.INBOX_URL, {
      method: "POST",
      headers: {
        "x-inbox-secret": env.INBOX_SECRET,
        "x-envelope-to": message.to,
        // Cloudflare's own check of the sender (SPF, DKIM, DMARC), the first Authentication-Results
        // header it prepends. The function takes mail only when DMARC passed, so a forged From is
        // turned away (Cloudflare's email handler docs, "Authentication results").
        "x-auth-results": message.headers.get("authentication-results") ?? "",
        "content-type": "message/rfc822",
      },
      body: raw,
    });
    const answer = (await res.json().catch(() => null)) as InboxAnswer | null;
    const bounce = bounceFor(res.status, answer);
    if (bounce) return message.setReject(bounce);
    // Anything else was taken: plans to review, or a note on the trip saying why there were none.
  },
};
