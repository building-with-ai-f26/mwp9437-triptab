// TripTab "Describe your trip": on Start a trip, a signed-in person types, pastes or dictates what's
// already planned, and this function asks Claude to set the trip up from it: a name and stops, the
// plans they mention, and up to five follow-up questions. Nothing is saved here: the app fills the
// Start a trip form with the name and stops for the person to check, and once the trip exists the
// plans open on import's review screen and the questions become to-dos.
//
// Order of checks, cheapest first: signed in, input within limits, the key is set, today's caps
// (the same daily spend cap and 20 AI calls a person a day as import and Plan with AI). Only then
// one call to the Claude API (Claude Haiku 5.5, low effort, no web search, capped output, 60
// seconds, at most one automatic retry). Every call is logged to ai_calls (feature "describe", no
// trip yet) with its tokens and list-price cost; the description itself is never logged or stored.
//
// ANTHROPIC_API_KEY and AI_DAILY_CAP_USD are Edge Function secrets, read on every call. They never
// appear in the app, a file or a commit.
import Anthropic from "npm:@anthropic-ai/sdk@^1.9.0";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  capDecision, checkDescribe, costUsd, DESCRIBE_TOOL, EFFORT, MAX_DESCRIBE_CHARS, MAX_TOKENS, MODEL, nyDayStart, readCap,
  SYSTEM_PROMPT, TIMEOUT_MS, type Usage,
} from "./rules.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const fail = (status: number, code: string, error: string) => json({ code, error }, status);

const DATE = /^\d{4}-\d{2}-\d{2}$/;

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
  if (!user) return fail(401, "signed_out", "Sign in to set up a trip.");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail(400, "bad_request", "Bad request.");
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
  const cap = readCap(Deno.env.get("AI_DAILY_CAP_USD"));
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });

  // A status check for setup: says whether the key is set, never anything about a secret's value.
  if (body.probe === true) return json({ ai_key_set: apiKey.length > 0 });

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return fail(400, "empty", "Describe the trip first.");
  if (text.length > MAX_DESCRIBE_CHARS) {
    return fail(413, "too_large", `Keep it under ${MAX_DESCRIBE_CHARS.toLocaleString("en-US")} characters. Start with the dates and places; add bookings later with AI help.`);
  }
  if (!apiKey) return fail(503, "not_set_up", "Describing a trip isn't set up yet. Fill in the form for now.");

  const testRun = body.test_run === true;
  // The eval pins "today", so its dates don't drift with the calendar. Nothing else can.
  const today = testRun && typeof body.today === "string" && DATE.test(body.today) ? body.today : new Date().toISOString().slice(0, 10);
  const log = (result: string, usage: Usage | null, ms: number | null, plans: number | null) =>
    admin.from("ai_calls").insert({
      trip_id: null, user_id: user.id, feature: "describe", model: MODEL, effort: EFFORT, input_kind: "text",
      input_chars: text.length, input_tokens: usage?.input_tokens ?? 0, output_tokens: usage?.output_tokens ?? 0,
      cache_read_tokens: usage?.cache_read_tokens ?? 0, cache_write_tokens: usage?.cache_write_tokens ?? 0,
      searches: 0, cost_usd: usage ? costUsd(usage) : 0, latency_ms: ms, result, plans_proposed: plans, test_run: testRun,
    }).select("id").single();

  // Runaway protection: today's spend across the whole app, and this person's AI calls today.
  // Added up in the database (security audit, 11/22): fetched as rows, the API hands back 1,000 at
  // most, so a day with more rows than that stopped counting. ai_spend_today also holds the list of
  // results that count as a call that reached the Claude API.
  const { data: todayRows, error: capError } = await admin.rpc("ai_spend_today", { p_since: nyDayStart(), p_user: user.id }).single<{ spent: number; mine: number }>();
  if (capError || !todayRows) return fail(500, "error", "Couldn't check today's AI budget, so nothing was sent. Try again.");
  const spent = Number(todayRows.spent);
  const mine = Number(todayRows.mine);
  const blocked = capDecision(cap, spent, mine);
  if (blocked) {
    await log(blocked.code, null, null, null);
    return fail(429, blocked.code, blocked.message);
  }

  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: TIMEOUT_MS });
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  const usage: Usage = { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, searches: 0 };
  const started = Date.now();
  let proposed: unknown = undefined;
  let refused = false;
  try {
    const response = await client.messages.create(
      {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        output_config: { effort: EFFORT },
        system: SYSTEM_PROMPT,
        // Not a forced tool choice: Haiku 5.5 thinks by default, and forcing a tool doesn't mix with
        // thinking. The prompt asks for the one call, as import's does; strict keeps its shape.
        tools: [DESCRIBE_TOOL as unknown as Anthropic.Tool],
        messages: [
          {
            role: "user",
            content: `Today is ${today}.\n\n<traveler_description>\n${text.replaceAll("</traveler_description>", "")}\n</traveler_description>\n\nSet up the trip from the traveler's description by calling set_up_trip once.`,
          },
        ],
      },
      { signal },
    );
    usage.input_tokens = response.usage.input_tokens;
    usage.output_tokens = response.usage.output_tokens;
    usage.cache_read_tokens = response.usage.cache_read_input_tokens ?? 0;
    usage.cache_write_tokens = response.usage.cache_creation_input_tokens ?? 0;
    for (const block of response.content) if (block.type === "tool_use" && block.name === DESCRIBE_TOOL.name) proposed = block.input;
    if (response.stop_reason === "refusal") refused = true;
  } catch (error) {
    const ms = Date.now() - started;
    const timedOut = signal.aborted || error instanceof Anthropic.APIConnectionTimeoutError;
    await log(timedOut ? "timeout" : "error", usage, ms, null);
    if (timedOut) return fail(504, "timeout", "That took too long, so it was stopped. Try a shorter description, or fill in the form.");
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      return fail(503, "not_set_up", "TripTab's AI key isn't working. Fill in the form, and let Mike know.");
    }
    if (error instanceof Anthropic.RateLimitError) return fail(429, "busy", "The AI is busy right now. Try again in a minute.");
    if (error instanceof Anthropic.APIError && (error.status === 402 || error.type === "billing_error" || /credit|spend limit|usage limit/i.test(error.message))) {
      return fail(429, "credit_used", "TripTab's AI credit for the month is used up. Fill in the form; this comes back when the credit resets.");
    }
    if (error instanceof Anthropic.APIError) {
      console.error("claude api error", error.status, error.type);
      return fail(502, "error", "The AI couldn't read that. Try again, or fill in the form.");
    }
    console.error("describe error", error instanceof Error ? error.name : "unknown");
    return fail(500, "error", "Something went wrong. Nothing was saved; try again.");
  }

  const ms = Date.now() - started;
  if (refused) {
    await log("refused", usage, ms, null);
    return fail(422, "refused", "The AI declined to read that. Fill in the form.");
  }
  const checked = proposed === undefined ? null : checkDescribe(proposed, text, today);
  if (!checked) {
    // No stops at all is the model saying "not a trip" (eval case 08), logged like import's "nothing
    // found"; stops that came back and failed the checks are invalid output.
    const stops = proposed && typeof proposed === "object" ? (proposed as { trip?: { stops?: unknown } }).trip?.stops : null;
    await log(Array.isArray(stops) && stops.length > 0 ? "invalid_output" : "no_plans", usage, ms, 0);
    const note = proposed && typeof proposed === "object" ? (proposed as { note?: unknown }).note : null;
    return fail(422, "no_trip", typeof note === "string" && note.trim() ? note.trim().slice(0, 300) : "TripTab couldn't find the places and dates in that. Say where you're going and when, or fill in the form.");
  }
  const { data: row } = await log("ok", usage, ms, checked.plans.length);
  return json({
    ...checked,
    call_id: row?.id ?? null,
    usage: { ...usage, cost_usd: costUsd(usage), latency_ms: ms, model: MODEL, effort: EFFORT },
  });
});
