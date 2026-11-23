// TripTab Plan with AI: an Owner asks for ideas, optionally saying what the group would like, and
// this function asks Claude to suggest real places for the trip's empty slots. Nothing is saved
// here: the app shows the ideas for review, and the Owner keeps or drops each; kept ones are added
// as Suggested. It never moves, replaces or repeats a plan already on the trip.
//
// Same guard rails as import-bookings: signed in, an Owner on the trip, request within limits, the
// key is set, today's caps (app-wide spend and this person's AI requests, both from ai_calls). One
// call to Claude Haiku 5.5 at low effort with at most 3 web searches, 60 seconds, one automatic
// retry. Every call is logged to ai_calls (feature "plan") with its tokens and list-price cost; the
// request text itself is never logged or stored.
import Anthropic from "npm:@anthropic-ai/sdk@^1.9.0";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  capDecision, checkSuggestions, costUsd, EFFORT, emptySlots, MAX_REQUEST_CHARS, MAX_SEARCHES, MAX_TOKENS, MODEL, nyDayStart,
  readCap, SUGGEST_TOOL, SYSTEM_PROMPT, tastesLine, TIMEOUT_MS, type PlanRow, type TasteCounts, type Usage,
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
  if (!user) return fail(401, "signed_out", "Sign in to plan with AI.");

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
  if (me?.role !== "owner") return fail(403, "not_owner", "Only the trip's owners can plan with AI.");

  const request = typeof body.request === "string" ? body.request.trim() : "";
  if (request.length > MAX_REQUEST_CHARS) return fail(413, "too_large", `Keep it under ${MAX_REQUEST_CHARS.toLocaleString("en-US")} characters.`);
  if (!apiKey) return fail(503, "not_set_up", "Plan with AI isn't set up yet. Add plans by hand for now.");

  const testRun = body.test_run === true;
  const log = (result: string, usage: Usage | null, ms: number | null, plans: number | null) =>
    admin.from("ai_calls").insert({
      trip_id: tripId, user_id: user.id, feature: "plan", model: MODEL, effort: EFFORT, input_kind: "text",
      input_chars: request.length, input_tokens: usage?.input_tokens ?? 0, output_tokens: usage?.output_tokens ?? 0,
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
    asCaller.from("items").select("kind, title, day, part, end_day, end_part, status").eq("trip_id", tripId).order("day"),
  ]);
  if (!trip) return fail(404, "bad_request", "That trip wasn't found.");
  const plans = (items ?? []) as (PlanRow & { title: string; status: string })[];
  const empty = emptySlots(trip, plans);
  if (empty.length === 0) return fail(422, "no_slots", "Every slot on the trip already has a plan. Clear one first, or add ideas by hand.");

  // The group's tastes from their profiles, as counts with no names (C51). A database without
  // profiles yet, or a trip where nobody has answered, leaves the line out.
  const { data: tasteCounts, error: tasteError } = await admin.rpc("trip_taste_counts", { p_trip: tripId });
  const tastes = tasteError ? null : tastesLine(tasteCounts as TasteCounts | null);

  const context = [
    `Trip: ${trip.name}, ${trip.start_date} to ${trip.end_date}.`,
    `Stops (where the group is each day): ${(stops ?? []).map((s) => `${s.name} ${s.start_date} to ${s.end_date}`).join("; ")}.`,
    `Plans already on the trip: ${plans.length ? plans.map((p) => `${p.day} ${p.part}${p.end_day && p.end_day > p.day ? ` to ${p.end_day}` : ""}: ${p.title} (${p.kind}, ${p.status})`).join("; ") : "none"}.`,
    `Empty slots: ${empty.join(", ")}.`,
    ...(tastes ? [tastes] : []),
  ].join("\n");
  const prompt = `${context}\n\n<group_request>\n${(request || "No request: suggest a few good ideas for the empty slots.").replaceAll("</group_request>", "")}\n</group_request>\n\nSuggest plans for the empty slots.`;

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
          system: SYSTEM_PROMPT,
          tools: [
            { type: "web_search_20250305", name: "web_search", max_uses: MAX_SEARCHES },
            SUGGEST_TOOL as unknown as Anthropic.Tool,
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
        if (block.type === "tool_use" && block.name === SUGGEST_TOOL.name) proposed = block.input;
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
    if (error instanceof Anthropic.RateLimitError) return fail(429, "busy", "Plan with AI is busy right now. Try again in a minute.");
    if (error instanceof Anthropic.APIError && (error.status === 402 || error.type === "billing_error" || /credit|spend limit|usage limit/i.test(error.message))) {
      return fail(429, "credit_used", "TripTab's AI credit for the month is used up. Add plans by hand; it comes back when the credit resets.");
    }
    if (error instanceof Anthropic.APIError) {
      console.error("claude api error", error.status, error.type);
      return fail(502, "error", "The AI couldn't do that. Try again, or add plans by hand.");
    }
    console.error("plan error", error instanceof Error ? error.name : "unknown");
    return fail(500, "error", "Something went wrong. Nothing was saved; try again.");
  }

  const ms = Date.now() - started;
  if (refused) {
    await log("refused", usage, ms, null);
    return fail(422, "refused", "The AI declined that request. Add plans by hand.");
  }
  const checked = proposed === undefined ? null : checkSuggestions(proposed, empty, searchUrls);
  if (!checked) {
    await log(proposed === undefined ? "no_plans" : "invalid_output", usage, ms, 0);
    return fail(422, "no_plans", "The AI couldn't come up with ideas for that. Try saying what the group would like, or add plans by hand.");
  }
  const { data: row } = await log(checked.suggestions.length ? "ok" : "no_plans", usage, ms, checked.suggestions.length);
  return json({
    suggestions: checked.suggestions,
    note: checked.note,
    dropped: checked.dropped,
    call_id: row?.id ?? null,
    usage: { ...usage, cost_usd: costUsd(usage), latency_ms: ms, model: MODEL, effort: EFFORT },
  });
});
