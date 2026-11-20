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
  readonly raw: ReadableStream<Uint8Array>;
  readonly rawSize: number;
  setReject(reason: string): void;
}

const MAX_EMAIL_BYTES = 8_000_000;

/** What the sender's mail program tells them when the email can't be taken. */
const BOUNCE: Record<number, string> = {
  403: "Only people on the trip can send it bookings. Forward it from the email address you use for TripTab.",
  404: "There's no TripTab trip at that address. Copy the address again from the trip's People panel.",
  413: "That email is too big for TripTab (8 MB at most).",
  429: "That trip has taken in all the emails it can today. Try again tomorrow, or add the booking in the app.",
};

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },

  async email(message: IncomingEmail, env: Env): Promise<void> {
    if (message.rawSize > MAX_EMAIL_BYTES) return message.setReject(BOUNCE[413]);
    if (!env.INBOX_SECRET || !env.INBOX_URL) return message.setReject("TripTab's email inbox isn't set up yet. Add the booking in the app for now.");
    const raw = await new Response(message.raw).arrayBuffer();
    const res = await fetch(env.INBOX_URL, {
      method: "POST",
      headers: { "x-inbox-secret": env.INBOX_SECRET, "x-envelope-to": message.to, "content-type": "message/rfc822" },
      body: raw,
    });
    if (BOUNCE[res.status]) return message.setReject(BOUNCE[res.status]);
    // Anything else was taken: plans to review, or a note on the trip saying why there were none.
  },
};
