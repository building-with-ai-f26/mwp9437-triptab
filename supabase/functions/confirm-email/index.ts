// TripTab confirm-email (Mike's 11/18 call, C6). Two actions:
// - confirm {token}: the link from the email. Anyone holding the link can open it, signed in or
//   not, on any device; it works once, for 7 days, and marks the account's email confirmed
//   (app_metadata.email_check = 'confirmed', set here with the service role).
// - resend: signed in, with the email still pending: a fresh link, within the limits in
//   supabase/functions/_shared/account.ts.
// - forward_add {email} and forward_confirm {id, code}: Also forward from (C31, Mike's call 11/21),
//   another address an account forwards bookings from, confirmed by a 6-digit code sent there. Signed
//   in. On TripTab dev only, a reserved test address (example.com), which can't get mail, has its code
//   handed back instead, so the tests run; production never does that.
// Deployed with verify_jwt off, because the link is opened by people who may not be signed in;
// resend and the forward actions check the caller's token themselves.
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildForwardCodeEmail, codeHash, forwardCodeDecision, forwardSendDecision, isReservedEmail, newCode, normalAddress, pickAppUrl,
  TOKEN_DAYS, tokenHash, type EventRow,
} from "../_shared/account.ts";
import { sendConfirm } from "../_shared/confirm.ts";

const DEV_PROJECT = "iivseqkvixmvcpldarqy";
const FROM = "TripTab <no-reply@triptab.org>";

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

  if (body.action === "forward_add" || body.action === "forward_confirm") {
    const auth = req.headers.get("Authorization") ?? "";
    const { data: who } = await admin.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
    const user = who?.user;
    if (!user) return fail(401, "signed_out", "Sign in first.");
    const dev = url.includes(DEV_PROJECT);

    if (body.action === "forward_confirm") {
      const id = String(body.id ?? "");
      const code = String(body.code ?? "").replace(/\D/g, "");
      if (!/^[0-9a-f-]{36}$/.test(id) || code.length !== 6) return fail(400, "wrong_code", "Type the 6 digits from the email.");
      const { data: row } = await admin
        .from("forward_addresses").select("id, code_hash, code_sent_at, tries, confirmed_at").eq("id", id).eq("user_id", user.id).maybeSingle();
      if (!row) return fail(404, "not_found", "That address isn't on your account. Add it again.");
      const refused = forwardCodeDecision(row, await codeHash(row.id, code));
      if (refused) {
        if (refused.code === "wrong_code") await admin.from("forward_addresses").update({ tries: row.tries + 1 }).eq("id", row.id);
        return fail(400, refused.code, refused.message);
      }
      if (!row.confirmed_at) {
        await admin.from("forward_addresses").update({ confirmed_at: new Date().toISOString(), code_hash: null }).eq("id", row.id);
      }
      return json({ ok: true, confirmed: true });
    }

    // forward_add: a new code for an address (a new one, or one still waiting for its code).
    const email = normalAddress(body.email);
    if (!email) return fail(400, "bad_email", "Type an email address, like you@gmail.com.");
    const own = [user.email, ...(user.identities ?? []).map((i) => i.identity_data?.email)]
      .filter((e): e is string => typeof e === "string").map((e) => e.trim().toLowerCase());
    if (own.includes(email)) return fail(400, "already_yours", "That's already the address you sign in with, so it works now.");
    const testOnly = isReservedEmail(email);
    if (testOnly && !dev) return fail(400, "bad_email", "That address can't get email. Type one you use.");

    const { data: mine } = await admin.from("forward_addresses").select("id, email, confirmed_at").eq("user_id", user.id);
    const existing = (mine ?? []).find((r) => r.email === email);
    if (existing?.confirmed_at) return json({ ok: true, id: existing.id, confirmed: true });
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: lastDay, error: eventsError } = await admin
      .from("account_events").select("kind, user_id, ip_hash").in("kind", ["confirm_sent", "forward_code_sent"]).gte("created_at", since);
    if (eventsError) return fail(500, "error", "Couldn't send it just now. Try again in a bit.");
    const refused = forwardSendDecision((lastDay ?? []) as EventRow[], user.id, (mine ?? []).filter((r) => r.email !== email).length);
    if (refused) return fail(429, refused.code, refused.message);

    const apiKey = Deno.env.get("RESEND_API_KEY") ?? "";
    if (!apiKey && !testOnly) return fail(503, "not_set_up", "TripTab can't send codes yet. Try again later.");
    const { data: row, error: saveError } = await admin
      .from("forward_addresses")
      .upsert({ user_id: user.id, email, tries: 0, confirmed_at: null, code_sent_at: new Date().toISOString() }, { onConflict: "user_id,email" })
      .select("id").single();
    if (saveError || !row) return fail(500, "error", "Couldn't save that address just now. Try again.");
    const code = newCode();
    await admin.from("forward_addresses").update({ code_hash: await codeHash(row.id, code) }).eq("id", row.id);

    if (testOnly) return json({ ok: true, id: row.id, sent: false, dev_code: code });
    const mail = buildForwardCodeEmail({
      name: String(user.user_metadata?.name ?? "") || "there",
      code,
      address: email,
      url: `${pickAppUrl(req.headers.get("Origin"), dev)}/trips`,
    });
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [email], ...mail }),
    });
    if (!res.ok) {
      console.error("resend error", res.status);
      return fail(503, "error", "Couldn't send the code just now. Try again in a bit.");
    }
    await admin.from("account_events").insert({ kind: "forward_code_sent", user_id: user.id });
    return json({ ok: true, id: row.id, sent: true });
  }

  return fail(400, "bad_request", "Bad request.");
});
