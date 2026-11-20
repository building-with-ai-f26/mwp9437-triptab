// TripTab invite emails (Build 3, Mike's 11/18 call: TripTab emails invites itself from triptab.org).
// An Owner taps Email next to someone added by name and email who hasn't joined yet; this function
// sends them their personal link (the group link with ?as=<their spot>) through Resend, from
// invites@triptab.org, with the Owner's own email as the reply-to.
//
// Order of checks, cheapest first: signed in, an Owner on the trip, the person is on the trip, not
// joined yet and has an email, the group link is on, the key is set, then the rate limits counted
// from invite_emails (per person, per trip, per sender, overall; supabase/functions/send-invite/rules.ts).
// Every send, and every capped one, is logged there; the email address and the message are not.
//
// RESEND_API_KEY is an Edge Function secret, typed in by Mike. It never appears in the app, a file
// or a commit.
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildInvite, inviteDecision, pickAppUrl, resendFailure, type SentRow } from "./rules.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const fail = (status: number, code: string, error: string) => json({ code, error }, status);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FROM = "TripTab <invites@triptab.org>";
/** TripTab dev: its invite links may go back to a local run or a Preview. */
const DEV_PROJECT = "iivseqkvixmvcpldarqy";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const short = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, label: `${MONTHS[m - 1]} ${d}` };
};
const dateRange = (a: string, b: string) => {
  const s = short(a), e = short(b);
  return s.y === e.y ? `${s.label} to ${e.label}, ${e.y}` : `${s.label}, ${s.y} to ${e.label}, ${e.y}`;
};

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
  if (!user) return fail(401, "signed_out", "Sign in to send invites.");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail(400, "bad_request", "Bad request.");
  }
  const tripId = String(body.trip_id ?? "");
  const travelerId = String(body.traveler_id ?? "");
  if (!UUID.test(tripId) || !UUID.test(travelerId)) return fail(400, "bad_request", "Which trip, and who?");

  // Asked as the caller, so row-level security answers: a stranger gets nothing back at all.
  const { data: me } = await asCaller.from("travelers").select("id, name, role").eq("trip_id", tripId).eq("user_id", user.id).maybeSingle();
  if (me?.role !== "owner") return fail(403, "not_owner", "Only the trip's owners can send invites.");

  const [{ data: person }, { data: contacts }, { data: link }, { data: trip }, { data: stops }] = await Promise.all([
    asCaller.from("travelers").select("id, name, user_id").eq("id", travelerId).eq("trip_id", tripId).maybeSingle(),
    asCaller.rpc("trip_contacts", { p_trip: tripId }),
    asCaller.from("trip_links").select("token, enabled").eq("trip_id", tripId).maybeSingle(),
    asCaller.from("trips").select("name, start_date, end_date").eq("id", tripId).single(),
    asCaller.from("stops").select("name").eq("trip_id", tripId).order("position"),
  ]);
  if (!person) return fail(404, "not_on_trip", "That person isn't on this trip.");
  if (person.user_id) return fail(409, "already_joined", `${person.name} has already joined.`);
  const email = ((contacts ?? []) as { traveler_id: string; email: string | null }[]).find((c) => c.traveler_id === travelerId)?.email?.trim();
  if (!email) return fail(400, "no_email", `Add an email for ${person.name} first.`);
  if (!link?.enabled) return fail(409, "link_off", "Turn the group link on to send invites.");

  const apiKey = Deno.env.get("RESEND_API_KEY") ?? "";
  if (!apiKey) return fail(503, "not_set_up", "Invite emails aren't set up yet. Send it from your own email for now.");

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
  const log = (result: string) => admin.from("invite_emails").insert({ trip_id: tripId, traveler_id: travelerId, sent_by: user.id, result });

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: sent, error: countError } = await admin.from("invite_emails").select("trip_id, traveler_id, sent_by").eq("result", "sent").gte("created_at", since);
  if (countError) return fail(500, "error", "Couldn't check today's invite limits, so nothing was sent. Try again.");
  const blocked = inviteDecision((sent ?? []) as SentRow[], tripId, travelerId, user.id);
  if (blocked) {
    await log(blocked.code);
    return fail(429, blocked.code, blocked.message);
  }

  const invite = buildInvite({
    inviter: me.name,
    person: person.name,
    tripName: trip?.name ?? "your trip",
    dates: trip ? dateRange(trip.start_date, trip.end_date) : "",
    stops: (stops ?? []).map((s) => s.name),
    url: `${pickAppUrl(req.headers.get("Origin"), url.includes(DEV_PROJECT))}/join/${link.token}?as=${travelerId}`,
  });
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [email], reply_to: user.email ? [user.email] : undefined, ...invite }),
  });
  if (!res.ok) {
    await log("error");
    // Resend's error name is a fixed word (validation_error); its message can hold the address, so it isn't logged.
    const name = await res
      .json()
      .then((b: { name?: unknown }) => (typeof b?.name === "string" ? b.name : null))
      .catch(() => null);
    console.error("resend error", res.status, name);
    const f = resendFailure(res.status, name);
    return fail(f.status, f.code, f.error);
  }
  await log("sent");
  return json({ ok: true, to: person.name });
});
