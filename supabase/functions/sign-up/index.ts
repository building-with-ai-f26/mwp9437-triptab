// TripTab sign-up: creates an email + password account you can use right away, then emails a
// "Confirm your email" link from no-reply@triptab.org (Mike's 11/18 call, C6: no waiting on the
// email; a reminder in the app until the link is opened). The account carries
// app_metadata.email_check = 'pending', which only this service-role code can set. Sign-ups are
// rate-limited per caller address (hashed) and in all (supabase/functions/_shared/account.ts).
//
// The service-role key and RESEND_API_KEY are provided by Supabase's Edge Function runtime. They
// never appear in the app, a file or a commit.
import { createClient } from "npm:@supabase/supabase-js@2";
import { ipHashOf, signUpDecision, type EventRow } from "../_shared/account.ts";
import { sendConfirm } from "../_shared/confirm.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// TripTab dev runs the test suites all day; its sign-up limits are far roomier.
const DEV_PROJECT = "iivseqkvixmvcpldarqy";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);

  let body: { name?: unknown; email?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Bad request." }, 400);
  }

  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  if (!name || name.length > 60) return json({ error: "Add your name (up to 60 characters)." }, 400);
  if (!EMAIL.test(email) || email.length > 254) return json({ error: "That email doesn't look right." }, 400);
  if (password.length < 8 || password.length > 72) return json({ error: "Use a password of 8 to 72 characters." }, 400);

  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Rate limit, before anything is made.
  const ipHash = await ipHashOf(req.headers.get("x-forwarded-for"));
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: lastHour, error: countError } = await admin.from("account_events").select("kind, user_id, ip_hash").eq("kind", "sign_up").gte("created_at", since);
  if (countError) return json({ error: "Couldn't create the account. Try again." }, 500);
  const refused = signUpDecision((lastHour ?? []) as EventRow[], ipHash, url.includes(DEV_PROJECT));
  if (refused) return json({ error: refused.message, code: refused.code }, 429);

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
    app_metadata: { email_check: "pending" },
  });

  if (error) {
    const taken = error.status === 422 || /already/i.test(error.message);
    return json(
      { error: taken ? "There's already an account with that email. Sign in instead." : "Couldn't create the account." },
      taken ? 409 : 400,
    );
  }
  await admin.from("account_events").insert({ kind: "sign_up", user_id: data.user.id, ip_hash: ipHash });

  // The account works either way; a failed send just means the reminder offers Send it again.
  const confirm = await sendConfirm(admin, { id: data.user.id, email, name }, req.headers.get("Origin"));
  return json({ ok: true, user_id: data.user?.id, confirm: confirm.sent ? "sent" : confirm.reason });
});
