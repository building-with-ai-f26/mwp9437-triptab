// TripTab Ask AI (T10, Mike's C59, C60 and C64; the 11/24 pod's version): one person on a trip asks
// for ideas and gets a few options to pick from (three by default), each with why it fits, a price
// range, the best time, whether to book ahead and the page it was found on. A Refine your request box
// sends the ask again with what's been shown, so the next options move that way. Nothing is saved
// here: the app keeps the conversation for the person who asked (ask_turns, theirs alone), and an
// option they pick is added as Suggested.
//
// Same guard rails as Plan with AI: signed in, an Owner on the trip, request within limits, the key
// set, today's caps from ai_calls. One call to Claude Haiku 5.5 at low effort with at most 3 web
// searches. Every turn is logged to ai_calls (feature "ask"); the ask's text is not logged there.
import Anthropic from "npm:@anthropic-ai/sdk@^1.9.0";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  ASK_SYSTEM_PROMPT, ASK_TOOL, askPrompt, capDecision, checkOptions, costUsd, EFFORT, MAX_REFINEMENTS, MAX_REQUEST_CHARS, MAX_SEARCHES,
  MAX_TOKENS, MODEL, nyDayStart, optionCount, readCap, tastesFor, TIMEOUT_MS, type TasteCounts, type Usage,
} from "./rules.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const fail = (status: number, code: string, error: string) => json({ code, error }, status);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  if (!user) return fail(401, "signed_out", "Sign in to ask AI.");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail(400, "bad_request", "Bad request.");
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
  const cap = readCap(Deno.env.get("AI_DAILY_CAP_USD"));
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
  if (body.probe === true) return json({ ai_key_set: apiKey.length > 0 });

  const tripId = String(body.trip_id ?? "");
  if (!UUID.test(tripId)) return fail(400, "bad_request", "Which trip?");
  const { data: me } = await asCaller.from("travelers").select("role").eq("trip_id", tripId).eq("user_id", user.id).maybeSingle();
  if (me?.role !== "owner") return fail(403, "not_owner", "Only the trip's owners can ask AI.");

  const request = typeof body.request === "string" ? body.request.trim() : "";
  const refinements = Array.isArray(body.refinements) ? body.refinements.filter((r): r is string => typeof r === "string" && r.trim().length > 0).map((r) => r.trim()) : [];
  const shown = Array.isArray(body.shown) ? body.shown.filter((r): r is string => typeof r === "string").map((r) => r.slice(0, 140)).slice(-24) : [];
  if (!request) return fail(400, "bad_request", "Say what you'd like ideas for.");
  if (request.length > MAX_REQUEST_CHARS || refinements.some((r) => r.length > MAX_REQUEST_CHARS)) {
    return fail(413, "too_large", `Keep it under ${MAX_REQUEST_CHARS.toLocaleString("en-US")} characters.`);
  }
  if (refinements.length > MAX_REFINEMENTS) return fail(413, "too_large", "Start a new ask: this one has been refined a lot.");
  const count = optionCount(body.count);
  // Consider group preferences (C64: on unless turned off); C53 still keeps fewer than 3 answers out.
  const useTastes = body.use_tastes !== false;
  if (!apiKey) return fail(503, "not_set_up", "Ask AI isn't set up yet. Add plans by hand for now.");

  const testRun = body.test_run === true;
  const log = (result: string, usage: Usage | null, ms: number | null, plans: number | null) =>
    admin.from("ai_calls").insert({
      trip_id: tripId, user_id: user.id, feature: "ask", model: MODEL, effort: EFFORT, input_kind: "text",
      input_chars: request.length + refinements.reduce((n, r) => n + r.length, 0), input_tokens: usage?.input_tokens ?? 0, output_tokens: usage?.output_tokens ?? 0,
      cache_read_tokens: usage?.cache_read_tokens ?? 0, cache_write_tokens: usage?.cache_write_tokens ?? 0,
      searches: usage?.searches ?? 0, cost_usd: usage ? costUsd(usage) : 0, latency_ms: ms, result, plans_proposed: plans, test_run: testRun,
    }).select("id").single();

  // Added up in the database (security audit, 11/22): fetched as rows, the API hands back 1,000 at
  // most, so a day with more rows than that stopped counting. ai_spend_today also holds the list of
  // results that count as a call that reached the Claude API.
  const { data: today, error: capError } = await admin.rpc("ai_spend_today", { p_since: nyDayStart(), p_user: user.id }).single<{ spent: number; mine: number }>();
  if (capError || !today) return fail(500, "error", "Couldn't check today's AI budget, so nothing was sent. Try again.");
  const spent = Number(today.spent);
  const mine = Number(today.mine);
  const blocked = capDecision(cap, spent, mine);
  if (blocked) {
    await log(blocked.code, null, null, null);
    return fail(429, blocked.code, blocked.message);
  }

  const [{ data: trip }, { data: stops }, { data: items }] = await Promise.all([
    asCaller.from("trips").select("name, start_date, end_date").eq("id", tripId).single(),
    asCaller.from("stops").select("name, start_date, end_date").eq("trip_id", tripId).order("position"),
    asCaller.from("items").select("kind, title, day, part, status").eq("trip_id", tripId).order("day"),
  ]);
  if (!trip) return fail(404, "bad_request", "That trip wasn't found.");
  const plans = (items ?? []) as { kind: string; title: string; day: string; part: string; status: string }[];

  // The group's tastes as counts with no names (C51), only with the toggle on and 3 or more answers (C53).
  let tastes: string | null = null;
  let tasteAnswers = 0;
  if (useTastes) {
    const { data: tasteCounts, error: tasteError } = await admin.rpc("trip_taste_counts", { p_trip: tripId });
    if (!tasteError) {
      tastes = tastesFor(useTastes, tasteCounts as TasteCounts | null);
      tasteAnswers = Number((tasteCounts as TasteCounts | null)?.answered ?? 0);
    }
  }

  const context = [
    `Trip: ${trip.name}, ${trip.start_date} to ${trip.end_date}.`,
    `Stops (where the group is each day): ${(stops ?? []).map((s) => `${s.name} ${s.start_date} to ${s.end_date}`).join("; ")}.`,
    `Plans already on the trip: ${plans.length ? plans.map((p) => `${p.day} ${p.part}: ${p.title} (${p.kind}, ${p.status})`).join("; ") : "none"}.`,
    ...(tastes ? [tastes] : []),
  ].join("\n");
  const prompt = askPrompt(context, request, refinements, shown, count);

  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: TIMEOUT_MS });
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  const usage: Usage = { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, searches: 0 };
  const searchUrls: string[] = [];
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt }];
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
          system: ASK_SYSTEM_PROMPT,
          tools: [
            { type: "web_search_20250305", name: "web_search", max_uses: MAX_SEARCHES },
            ASK_TOOL as unknown as Anthropic.Tool,
          ],
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
        if (block.type === "tool_use" && block.name === ASK_TOOL.name) proposed = block.input;
      }
      if (response.stop_reason === "refusal") refused = true;
      if (response.stop_reason !== "pause_turn" || proposed !== undefined) break;
      messages.push({ role: "assistant", content: response.content });
    }
  } catch (error) {
    const ms = Date.now() - started;
    const timedOut = signal.aborted || error instanceof Anthropic.APIConnectionTimeoutError;
    await log(timedOut ? "timeout" : "error", usage, ms, null);
    if (timedOut) return fail(504, "timeout", "That took too long, so it was stopped. Try again, or add plans by hand.");
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      return fail(503, "not_set_up", "TripTab's AI key isn't working. Add plans by hand, and let Mike know.");
    }
    if (error instanceof Anthropic.RateLimitError) return fail(429, "busy", "Ask AI is busy right now. Try again in a minute.");
    if (error instanceof Anthropic.APIError && (error.status === 402 || error.type === "billing_error" || /credit|spend limit|usage limit/i.test(error.message))) {
      return fail(429, "credit_used", "TripTab's AI credit for the month is used up. Add plans by hand; it comes back when the credit resets.");
    }
    if (error instanceof Anthropic.APIError) {
      console.error("claude api error", error.status, error.type);
      return fail(502, "error", "The AI couldn't do that. Try again, or add plans by hand.");
    }
    console.error("ask error", error instanceof Error ? error.name : "unknown");
    return fail(500, "error", "Something went wrong. Nothing was saved; try again.");
  }

  const ms = Date.now() - started;
  if (refused) {
    await log("refused", usage, ms, null);
    return fail(422, "refused", "The AI declined that request. Add plans by hand.");
  }
  const taken = [...plans.map((p) => p.title), ...shown.map((t) => t.replace(/\s*\(\${1,4}\)$/, ""))];
  const checked = proposed === undefined ? null : checkOptions(proposed, searchUrls, taken, count);
  if (!checked) {
    await log(proposed === undefined ? "no_plans" : "invalid_output", usage, ms, 0);
    return fail(422, "no_plans", "The AI couldn't come up with options for that. Try saying it another way, or add a plan by hand.");
  }
  const { data: row } = await log(checked.options.length ? "ok" : "no_plans", usage, ms, checked.options.length);
  return json({
    options: checked.options,
    note: checked.note,
    dropped: checked.dropped,
    tastes_used: Boolean(tastes),
    taste_answers: tasteAnswers,
    call_id: row?.id ?? null,
    usage: { ...usage, cost_usd: costUsd(usage), latency_ms: ms, model: MODEL, effort: EFFORT },
  });
});
