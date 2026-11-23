// TripTab send-feedback (Mike's call, 11/23). Send feedback in Help calls this: it saves the note as
// the caller (send_feedback in the database checks it and keeps the limit of 10 a person a day),
// then emails it to the person who builds TripTab, with Reply-To set to the sender. On TripTab dev
// it saves but never emails, so the tests don't fill Mike's inbox. A note that saved but couldn't be
// emailed still counts as sent: it's in the table either way.
// Signed-in callers only (the default verify_jwt).
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildFeedbackEmail, FEEDBACK_TO, type FeedbackKind } from "../_shared/feedback.ts";

const DEV_PROJECT = "iivseqkvixmvcpldarqy";
const FROM = "TripTab <no-reply@triptab.org>";
const KINDS = ["bug", "idea", "other"];

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

  const url = Deno.env.get("SUPABASE_URL")!;
  const auth = req.headers.get("Authorization") ?? "";
  const asCaller = createClient(url, req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: who } = await asCaller.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
  const user = who?.user;
  if (!user) return fail(401, "signed_out", "Sign in first.");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail(400, "bad_request", "Bad request.");
  }
  const kind = String(body.kind ?? "");
  const message = typeof body.message === "string" ? body.message : "";
  const page = typeof body.page === "string" ? body.page : null;
  if (!KINDS.includes(kind)) return fail(400, "bad_request", "Pick what kind of feedback this is.");

  // Saved as the caller, so the database's own checks and daily limit decide.
  const { error } = await asCaller.rpc("send_feedback", { p_kind: kind, p_message: message, p_page: page });
  if (error) {
    if (error.code === "54000" || error.code === "22023") return fail(400, error.code === "54000" ? "limit" : "bad_request", error.message);
    console.error("send_feedback failed", error.code);
    return fail(500, "error", "Couldn't send that. Try again in a moment.");
  }

  const apiKey = Deno.env.get("RESEND_API_KEY") ?? "";
  if (url.includes(DEV_PROJECT) || !apiKey) return json({ ok: true, emailed: false });
  const mail = buildFeedbackEmail({
    kind: kind as FeedbackKind,
    message: message.trim().slice(0, 2000),
    page: page ? page.trim().slice(0, 200) : null,
    name: String(user.user_metadata?.name ?? ""),
    email: user.email ?? null,
  });
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to: [Deno.env.get("FEEDBACK_TO") || FEEDBACK_TO],
        ...(user.email ? { reply_to: user.email } : {}),
        ...mail,
      }),
    });
    if (!res.ok) console.error("resend error", res.status);
    return json({ ok: true, emailed: res.ok });
  } catch {
    console.error("resend unreachable");
    return json({ ok: true, emailed: false });
  }
});
