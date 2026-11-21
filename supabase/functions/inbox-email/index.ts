// Email-in (Mike's call, 11/20): a booking confirmation forwarded to a trip's own address
// (trip+<code>@triptab.org) reaches this function from the triptab Worker's email handler, which
// Cloudflare Email Routing calls. The raw email comes in the body; nothing is stored but who it came
// from on the trip, its subject, and what AI import proposed, which wait on the trip for an Owner to
// review. Nothing becomes a plan here.
//
// Order of checks, cheapest first: the Worker's shared secret (INBOX_SECRET, an Edge Function
// secret Mike sets; never in the app or a file), the size, the address (a trip's token), the sender
// (Cloudflare found that DMARC passed, so the From address is real, and it's someone on that trip),
// the trip's emails today, the AI key and today's caps. Then one call to the
// Claude API, the same model, prompt, tool and checks as import-bookings, logged to ai_calls.
//
// On TripTab dev only, a signed-in Owner of the trip may post a made-up email instead of the Worker
// (test_run), so the click-throughs and tests can run without a real mailbox; production never
// takes that path. Anyone signed in may ask whether email-in is ready ({ probe: true }): on
// production, that's once Mike has set INBOX_SECRET (checked by name, never read out).
import Anthropic from "npm:@anthropic-ai/sdk@^1.9.0";
import { createClient } from "npm:@supabase/supabase-js@2";
import PostalMime from "npm:postal-mime@2.4.4";
import {
  capDecision, checkProposals, costUsd, EFFORT, MAX_SEARCHES, MAX_TOKENS, MODEL, nyDayStart, PROPOSE_TOOL, readCap,
  SYSTEM_PROMPT, TIMEOUT_MS, type Usage,
} from "../import-bookings/rules.ts";
import {
  accountEmails, dmarcPassed, importInput, inboxToken, isOnTrip, maskedAddress, MAX_EMAIL_BYTES, MAX_EMAILS_PER_TRIP_DAY, sameSecret, senderAddress,
} from "./rules.ts";

const DEV_PROJECT = "iivseqkvixmvcpldarqy";
const REAL = ["ok", "no_plans", "refused", "invalid_output", "timeout", "error"];
// The app asks from the browser whether email-in is ready, so the probe answers across origins.
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
// The Worker only needs to know whether to bounce the email; the reason is for the logs.
const done = (status: number, code: string) => json({ code }, status);
// A refused sender (C31, Mike's call 11/21): the Worker's bounce names the address the email came
// from (a bounce goes back only to that address), and the logs say why, with the address masked.
const refuse = (code: string, sender: string | null) => {
  console.log(`inbox refused: ${code}, from ${maskedAddress(sender)}`);
  return json({ code, from: sender }, 403);
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return done(405, "bad_request");
  const url = Deno.env.get("SUPABASE_URL")!;
  const dev = url.includes(DEV_PROJECT);
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });

  // Who's calling: the Worker with the shared secret, or (dev only) an Owner testing.
  const secret = Deno.env.get("INBOX_SECRET") ?? "";
  const fromWorker = sameSecret(req.headers.get("x-inbox-secret") ?? "", secret);
  let testRun = false;
  let testUser: string | null = null;
  let raw: ArrayBuffer;
  let envelopeTo = req.headers.get("x-envelope-to");
  if (fromWorker) {
    raw = await req.arrayBuffer();
  } else {
    const auth = req.headers.get("Authorization") ?? "";
    const { data: who } = await admin.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
    if (!who?.user) return done(401, "not_allowed");
    let body: { to?: unknown; raw?: unknown; probe?: unknown };
    try {
      body = await req.json();
    } catch {
      return done(400, "bad_request");
    }
    // Ready: the Worker can hand mail on (production), or the test path is open (dev).
    if (body.probe === true) return json({ ready: secret.length > 0 || dev });
    if (!dev) return done(401, "not_allowed");
    if (typeof body.raw !== "string") return done(400, "bad_request");
    raw = new TextEncoder().encode(body.raw).buffer as ArrayBuffer;
    envelopeTo = String(body.to ?? "");
    testRun = true;
    testUser = who.user.id;
  }
  if (raw.byteLength > MAX_EMAIL_BYTES) return done(413, "too_large");

  const token = inboxToken(envelopeTo);
  if (!token) return done(404, "no_such_address");
  const { data: inbox } = await admin.from("trip_inboxes").select("trip_id").eq("token", token).maybeSingle();
  if (!inbox) return done(404, "no_such_address");
  const tripId = inbox.trip_id as string;

  let mail: Awaited<ReturnType<typeof PostalMime.parse>>;
  try {
    mail = await PostalMime.parse(raw);
  } catch {
    return done(400, "unreadable");
  }

  // A From address can be forged: Cloudflare's own check (DMARC) says whether this one was.
  const sender = senderAddress(mail.from?.address ?? null);
  if (!testRun && !dmarcPassed(req.headers.get("x-auth-results"))) return refuse("not_verified", sender);

  // The sender has to be on the trip: their account's email, or the email an Owner entered for them.
  const { data: people } = await admin.from("travelers").select("id, user_id, email, role").eq("trip_id", tripId);
  const accounts = await Promise.all(
    (people ?? []).filter((p) => p.user_id).map(async (p) => ({ id: p.id as string, user_id: p.user_id as string, emails: accountEmails((await admin.auth.admin.getUserById(p.user_id)).data.user) })),
  );
  const match =
    accounts.find((a) => isOnTrip(sender, a.emails)) ??
    (people ?? []).map((p) => ({ id: p.id as string, user_id: (p.user_id as string | null) ?? null, email: p.email as string | null })).find((p) => isOnTrip(sender, [p.email]));
  if (testRun) {
    // A dev test stands in for a sender: it has to be an Owner of this trip.
    const me = (people ?? []).find((p) => p.user_id === testUser);
    if (me?.role !== "owner") return done(403, "not_owner");
  } else if (!match) {
    return refuse("not_on_trip", sender);
  }
  const fromTraveler = testRun ? ((people ?? []).find((p) => p.user_id === testUser)?.id as string) : match!.id;
  // Its AI call counts toward the sender's own daily imports, or the trip's creator's when they have no account.
  const { data: trip } = await admin.from("trips").select("name, start_date, end_date, created_by").eq("id", tripId).single();
  const billedTo = testRun ? testUser! : (match!.user_id ?? (trip?.created_by as string));

  const { count: todayCount } = await admin
    .from("inbox_items").select("id", { count: "exact", head: true }).eq("trip_id", tripId).gte("received_at", nyDayStart());
  if ((todayCount ?? 0) >= MAX_EMAILS_PER_TRIP_DAY) return done(429, "trip_capped");

  const input = importInput({
    subject: mail.subject ?? null,
    text: mail.text ?? null,
    html: mail.html ?? null,
    attachments: (mail.attachments ?? []).map((a) => ({ mimeType: a.mimeType, filename: a.filename, content: a.content as ArrayBuffer })),
  });
  // The subject is kept even when nothing else in the email can be read, so the Owner knows which one it was.
  const subject = mail.subject?.trim() ? mail.subject.trim().slice(0, 200) : null;
  const keep = (row: Record<string, unknown>) =>
    admin.from("inbox_items").insert({ trip_id: tripId, from_traveler: fromTraveler, subject, ...row });
  if (!input) {
    await keep({ status: "failed", note: "That email had nothing to read." });
    return done(200, "empty");
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
  if (!apiKey) {
    await keep({ status: "failed", note: "AI import isn't set up yet." });
    return done(200, "not_set_up");
  }
  const cap = readCap(Deno.env.get("AI_DAILY_CAP_USD"));
  const inputKind = input.file ? (input.file.media_type === "application/pdf" ? "pdf" : "image") : "text";
  const log = (result: string, usage: Usage | null, ms: number | null, plans: number | null) =>
    admin.from("ai_calls").insert({
      trip_id: tripId, user_id: billedTo, feature: "import_email", model: MODEL, effort: EFFORT, input_kind: inputKind,
      input_chars: input.text.length, input_tokens: usage?.input_tokens ?? 0, output_tokens: usage?.output_tokens ?? 0,
      cache_read_tokens: usage?.cache_read_tokens ?? 0, cache_write_tokens: usage?.cache_write_tokens ?? 0,
      searches: usage?.searches ?? 0, cost_usd: usage ? costUsd(usage) : 0, latency_ms: ms, result, plans_proposed: plans, test_run: testRun,
    }).select("id").single();

  const { data: today, error: capError } = await admin.from("ai_calls").select("cost_usd, user_id, result").gte("created_at", nyDayStart());
  if (capError) return done(500, "error");
  const spent = (today ?? []).reduce((s, r) => s + Number(r.cost_usd), 0);
  const mine = (today ?? []).filter((r) => r.user_id === billedTo && REAL.includes(r.result)).length;
  const blocked = capDecision(cap, spent, mine);
  if (blocked) {
    await log(blocked.code, null, null, null);
    await keep({ status: "failed", note: blocked.message });
    return done(200, blocked.code);
  }

  const { data: stops } = await admin.from("stops").select("name, start_date, end_date").eq("trip_id", tripId).order("position");
  const context =
    `Trip: ${trip?.name ?? "a group trip"}, ${trip?.start_date} to ${trip?.end_date}.` +
    (stops?.length ? ` Stops: ${stops.map((s) => `${s.name} (${s.start_date} to ${s.end_date})`).join("; ")}.` : "") +
    ` Today is ${new Date().toISOString().slice(0, 10)}.`;
  const content: Anthropic.ContentBlockParam[] = [];
  if (input.file?.media_type === "application/pdf") {
    content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: input.file.data } });
  } else if (input.file) {
    content.push({ type: "image", source: { type: "base64", media_type: input.file.media_type as "image/png", data: input.file.data } });
  }
  content.push({
    type: "text",
    text: `${context}\n\nThe traveler forwarded this email${input.file ? " and its attached file" : ""}.\n<traveler_input>\n${input.text.replaceAll("</traveler_input>", "")}\n</traveler_input>\n\nPropose the plans found in the traveler's input.`,
  });

  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: TIMEOUT_MS });
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  const usage: Usage = { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, searches: 0 };
  const searchUrls: string[] = [];
  const messages: Anthropic.MessageParam[] = [{ role: "user", content }];
  const started = Date.now();
  let proposed: unknown = undefined;
  let refused = false;
  try {
    for (let turn = 0; turn < 3; turn++) {
      const response = await client.messages.create(
        {
          model: MODEL,
          max_tokens: MAX_TOKENS,
          output_config: { effort: EFFORT },
          system: SYSTEM_PROMPT,
          tools: [{ type: "web_search_20250305", name: "web_search", max_uses: MAX_SEARCHES }, PROPOSE_TOOL as unknown as Anthropic.Tool],
          messages,
        },
        { signal },
      );
      usage.input_tokens += response.usage.input_tokens;
      usage.output_tokens += response.usage.output_tokens;
      usage.cache_read_tokens += response.usage.cache_read_input_tokens ?? 0;
      usage.cache_write_tokens += response.usage.cache_creation_input_tokens ?? 0;
      usage.searches += response.usage.server_tool_use?.web_search_requests ?? 0;
      for (const block of response.content) {
        if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
          for (const r of block.content) if (r.type === "web_search_result") searchUrls.push(r.url);
        }
        if (block.type === "tool_use" && block.name === PROPOSE_TOOL.name) proposed = block.input;
      }
      if (response.stop_reason === "refusal") refused = true;
      if (response.stop_reason !== "pause_turn" || proposed !== undefined) break;
      messages.push({ role: "assistant", content: response.content });
    }
  } catch (error) {
    const timedOut = signal.aborted || error instanceof Anthropic.APIConnectionTimeoutError;
    await log(timedOut ? "timeout" : "error", usage, Date.now() - started, null);
    await keep({ status: "failed", note: timedOut ? "Reading that email took too long." : "The AI couldn't read that email." });
    console.error("inbox import error", error instanceof Error ? error.name : "unknown");
    return done(200, "error");
  }

  const ms = Date.now() - started;
  if (refused) {
    await log("refused", usage, ms, null);
    await keep({ status: "failed", note: "The AI declined to read that email." });
    return done(200, "refused");
  }
  const checked = proposed === undefined ? null : checkProposals(proposed, searchUrls, input.file ? "" : input.text);
  const { data: call } = await log(checked?.plans.length ? "ok" : proposed === undefined ? "no_plans" : checked ? "no_plans" : "invalid_output", usage, ms, checked?.plans.length ?? 0);
  if (!checked || checked.plans.length === 0) {
    await keep({ status: "failed", note: "No plans found in that email.", call_id: call?.id ?? null });
    return done(200, "no_plans");
  }
  await keep({ status: "new", plans: checked.plans, note: checked.note?.slice(0, 500) ?? null, call_id: call?.id ?? null });
  return done(200, "ok");
});
