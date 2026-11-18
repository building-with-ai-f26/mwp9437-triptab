// TripTab confirm-email (Mike's 11/18 call, C6). Two actions:
// - confirm {token}: the link from the email. Anyone holding the link can open it, signed in or
//   not, on any device; it works once, for 7 days, and marks the account's email confirmed
//   (app_metadata.email_check = 'confirmed', set here with the service role).
// - resend: signed in, with the email still pending: a fresh link, within the limits in
//   supabase/functions/_shared/account.ts.
// Deployed with verify_jwt off, because the link is opened by people who may not be signed in;
// resend checks the caller's token itself.
import { createClient } from "npm:@supabase/supabase-js@2";
import { TOKEN_DAYS, tokenHash } from "../_shared/account.ts";
import { sendConfirm } from "../_shared/confirm.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const fail = (status: number, code: string, error: string) => json({ code, error }, status);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail(405, "bad_request", "Use POST.");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail(400, "bad_request", "Bad request.");
  }
  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });

  if (body.action === "confirm") {
    const token = String(body.token ?? "");
    if (!/^[0-9a-f]{64}$/.test(token)) return fail(400, "bad_link", "This link isn't complete. Open it again from the email.");
    const { data: row } = await admin.from("email_checks").select("user_id, sent_at, confirmed_at").eq("token_hash", await tokenHash(token)).maybeSingle();
    const old = row && Date.now() - new Date(row.sent_at).getTime() > TOKEN_DAYS * 24 * 60 * 60 * 1000;
    if (!row || row.confirmed_at || old) return fail(410, "expired", "This link has run out or was already used. Send a new one from TripTab.");
    const { data: found } = await admin.auth.admin.getUserById(row.user_id);
    if (!found?.user) return fail(410, "expired", "This link has run out or was already used. Send a new one from TripTab.");
    const { error } = await admin.auth.admin.updateUserById(row.user_id, {
      app_metadata: { ...found.user.app_metadata, email_check: "confirmed" },
    });
    if (error) return fail(500, "error", "Couldn't confirm it just now. Try the link again.");
    await admin.from("email_checks").update({ confirmed_at: new Date().toISOString() }).eq("user_id", row.user_id);
    return json({ ok: true });
  }

  if (body.action === "resend") {
    const auth = req.headers.get("Authorization") ?? "";
    const { data: who } = await admin.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
    const user = who?.user;
    if (!user?.email) return fail(401, "signed_out", "Sign in first.");
    if (user.app_metadata?.email_check !== "pending") return json({ ok: true, already: true });
    const result = await sendConfirm(admin, { id: user.id, email: user.email, name: String(user.user_metadata?.name ?? "") }, req.headers.get("Origin"));
    if (result.sent) return json({ ok: true, sent: true });
    if (result.reason === "reserved") return json({ ok: true, sent: false, code: "reserved" });
    if (result.message) return fail(429, result.reason, result.message);
    return fail(503, result.reason, "Couldn't send it just now. Try again in a bit.");
  }

  return fail(400, "bad_request", "Bad request.");
});
