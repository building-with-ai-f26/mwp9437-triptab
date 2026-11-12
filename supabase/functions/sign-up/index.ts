// TripTab sign-up: creates an email + password account that is already confirmed, so no
// email is sent (Supabase's built-in sender is rate-limited and only reaches the project
// team). The browser then signs in with the password. See Plan.md, "Sign-in method".
//
// The service-role key used here is provided by Supabase's Edge Function runtime as an
// environment variable. It never appears in the app, a file or a commit.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });

  if (error) {
    const taken = error.status === 422 || /already/i.test(error.message);
    return json(
      { error: taken ? "There's already an account with that email. Sign in instead." : "Couldn't create the account." },
      taken ? 409 : 400,
    );
  }
  return json({ ok: true, user_id: data.user?.id });
});
