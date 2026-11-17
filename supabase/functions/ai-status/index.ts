// TripTab AI status: says whether the two secrets AI import needs exist, by name only.
// It answers true or false for each name and never reads out, logs or returns a value.
// The caller has to be signed in: the function checks the session itself, because Supabase's
// own gate also lets the public (publishable) key through.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const NAMES = ["ANTHROPIC_API_KEY", "AI_DAILY_CAP_USD"];
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const auth = req.headers.get("Authorization") ?? "";
  const asCaller = createClient(Deno.env.get("SUPABASE_URL")!, req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data } = await asCaller.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
  if (!data?.user) return json({ error: "Sign in first." }, 401);
  const exists = Object.fromEntries(NAMES.map((name) => [name, (Deno.env.get(name) ?? "").length > 0]));
  return json({ exists });
});
