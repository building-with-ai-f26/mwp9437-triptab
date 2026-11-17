// TripTab AI import: an Owner pastes a confirmation, a receipt, flight numbers or a summary (or
// attaches a PDF or photo), and this function asks Claude to propose plans from it. Nothing is
// saved here: the app shows the proposals for review, and the Owner keeps, edits or drops each.
//
// Order of checks, cheapest first: signed in, an Owner on the trip, input within limits, the key
// is set, today's caps. Only then one call to the Claude API (Claude Haiku 5.5, low effort,
// capped output, 60 seconds, at most one automatic retry). Every call is logged to ai_calls with
// its tokens and list-price cost; the input text itself is never logged or stored.
//
// ANTHROPIC_API_KEY and AI_DAILY_CAP_USD are Edge Function secrets, read on every call. They
// never appear in the app, a file or a commit.
import Anthropic from "npm:@anthropic-ai/sdk@^1.9.0";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  capDecision, checkProposals, costUsd, EFFORT, FILE_TYPES, MAX_FILE_BYTES, MAX_SEARCHES, MAX_TEXT_CHARS, MAX_TOKENS, MODEL,
  nyDayStart, PROPOSE_TOOL, readCap, SYSTEM_PROMPT, TIMEOUT_MS, type Usage,
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
/** Calls that reached the Claude API (they count toward a person's daily imports). */
const REAL = ["ok", "no_plans", "refused", "invalid_output", "timeout", "error"];

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
  if (!user) return fail(401, "signed_out", "Sign in to import bookings.");

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

  const tripId = String(body.trip_id ?? "");
  if (!UUID.test(tripId)) return fail(400, "bad_request", "Which trip?");
  // Asked as the caller, so row-level security answers: a stranger gets no row at all.
  const { data: me } = await asCaller.from("travelers").select("role").eq("trip_id", tripId).eq("user_id", user.id).maybeSingle();
  if (me?.role !== "owner") return fail(403, "not_owner", "Only the trip's owners can import bookings.");

  const text = typeof body.text === "string" ? body.text.trim() : "";
  const file = body.file && typeof body.file === "object" ? (body.file as { media_type?: unknown; data?: unknown }) : null;
  const fileType = file ? String(file.media_type ?? "") : "";
  const fileData = file ? String(file.data ?? "") : "";
  if (!text && !file) return fail(400, "empty", "Paste something or attach a file first.");
  if (file && (!FILE_TYPES.includes(fileType) || !/^[A-Za-z0-9+/]+=*$/.test(fileData))) {
    return fail(400, "bad_file", "Attach a PDF, or a photo or screenshot (PNG, JPEG, WebP or GIF).");
  }
  if (text.length > MAX_TEXT_CHARS || fileData.length * 0.75 > MAX_FILE_BYTES) {
    return fail(413, "too_large", `That's too much for one import. Keep pasted text under ${MAX_TEXT_CHARS.toLocaleString("en-US")} characters and files under 3 MB, or import it in parts.`);
  }
  if (!apiKey) return fail(503, "not_set_up", "AI import isn't set up yet. Add the plan by hand for now.");

  const inputKind = file ? (fileType === "application/pdf" ? "pdf" : "image") : "text";
  const testRun = body.test_run === true;
  const log = (result: string, usage: Usage | null, ms: number | null, plans: number | null) =>
    admin.from("ai_calls").insert({
      trip_id: tripId, user_id: user.id, feature: "import", model: MODEL, effort: EFFORT, input_kind: inputKind,
      input_chars: text.length, input_tokens: usage?.input_tokens ?? 0, output_tokens: usage?.output_tokens ?? 0,
      cache_read_tokens: usage?.cache_read_tokens ?? 0, cache_write_tokens: usage?.cache_write_tokens ?? 0,
      searches: usage?.searches ?? 0, cost_usd: usage ? costUsd(usage) : 0, latency_ms: ms, result, plans_proposed: plans, test_run: testRun,
    }).select("id").single();

  // Runaway protection: today's spend across the whole app, and this person's imports today.
  const { data: today, error: capError } = await admin.from("ai_calls").select("cost_usd, user_id, result").gte("created_at", nyDayStart());
  if (capError) return fail(500, "error", "Couldn't check today's AI budget, so nothing was sent. Try again.");
  const spent = (today ?? []).reduce((s, r) => s + Number(r.cost_usd), 0);
  const mine = (today ?? []).filter((r) => r.user_id === user.id && REAL.includes(r.result)).length;
  const blocked = capDecision(cap, spent, mine);
  if (blocked) {
    await log(blocked.code, null, null, null);
    return fail(429, blocked.code, blocked.message);
  }

  const [{ data: trip }, { data: stops }] = await Promise.all([
    asCaller.from("trips").select("name, start_date, end_date").eq("id", tripId).single(),
    asCaller.from("stops").select("name, start_date, end_date").eq("trip_id", tripId).order("position"),
  ]);
  const context =
    `Trip: ${trip?.name ?? "a group trip"}, ${trip?.start_date} to ${trip?.end_date}.` +
    (stops?.length ? ` Stops: ${stops.map((s) => `${s.name} (${s.start_date} to ${s.end_date})`).join("; ")}.` : "") +
    ` Today is ${new Date().toISOString().slice(0, 10)}.`;
  const content: Anthropic.ContentBlockParam[] = [];
  if (file && fileType === "application/pdf") {
    content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: fileData } });
  } else if (file) {
    content.push({ type: "image", source: { type: "base64", media_type: fileType as "image/png", data: fileData } });
  }
  content.push({
    type: "text",
    text: `${context}\n\n${file ? "The attached file is the traveler's input." : ""}${
      text ? `\n<traveler_input>\n${text.replaceAll("</traveler_input>", "")}\n</traveler_input>` : ""
    }\n\nPropose the plans found in the traveler's input.`,
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
    // One request; a paused search turn is sent back to finish, twice at most.
    for (let turn = 0; turn < 3; turn++) {
      const response = await client.messages.create(
        {
          model: MODEL,
          max_tokens: MAX_TOKENS,
          output_config: { effort: EFFORT },
          system: SYSTEM_PROMPT,
          tools: [
            { type: "web_search_20250305", name: "web_search", max_uses: MAX_SEARCHES },
            PROPOSE_TOOL as unknown as Anthropic.Tool,
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
        if (block.type === "tool_use" && block.name === PROPOSE_TOOL.name) proposed = block.input;
      }
      if (response.stop_reason === "refusal") refused = true;
      if (response.stop_reason !== "pause_turn" || proposed !== undefined) break;
      messages.push({ role: "assistant", content: response.content });
    }
  } catch (error) {
    const ms = Date.now() - started;
    const timedOut = signal.aborted || error instanceof Anthropic.APIConnectionTimeoutError;
    await log(timedOut ? "timeout" : "error", usage, ms, null);
    if (timedOut) return fail(504, "timeout", "That took too long, so it was stopped. Try a shorter piece, or add the plan by hand.");
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      return fail(503, "not_set_up", "TripTab's AI key isn't working. Add the plan by hand, and let Mike know.");
    }
    if (error instanceof Anthropic.RateLimitError) {
      return fail(429, "busy", "AI import is busy right now. Try again in a minute.");
    }
    if (error instanceof Anthropic.APIError && (error.status === 402 || error.type === "billing_error" || /credit|spend limit|usage limit/i.test(error.message))) {
      return fail(429, "credit_used", "TripTab's AI credit for the month is used up. Add the plan by hand; imports come back when the credit resets.");
    }
    if (error instanceof Anthropic.APIError) {
      console.error("claude api error", error.status, error.type);
      return fail(502, "error", "The AI couldn't read that. Try again, or add the plan by hand.");
    }
    console.error("import error", error instanceof Error ? error.name : "unknown");
    return fail(500, "error", "Something went wrong. Nothing was saved; try again.");
  }

  const ms = Date.now() - started;
  const cost = costUsd(usage);
  if (refused) {
    await log("refused", usage, ms, null);
    return fail(422, "refused", "The AI declined to read that. Add the plan by hand.");
  }
  const checked = proposed === undefined ? null : checkProposals(proposed, searchUrls);
  if (!checked) {
    await log(proposed === undefined ? "no_plans" : "invalid_output", usage, ms, 0);
    return fail(422, "no_plans", "The AI couldn't find plans in that. Try pasting the confirmation itself, or add the plan by hand.");
  }
  const { data: row } = await log(checked.plans.length ? "ok" : "no_plans", usage, ms, checked.plans.length);
  return json({
    plans: checked.plans,
    note: checked.note,
    call_id: row?.id ?? null,
    usage: { ...usage, cost_usd: cost, latency_ms: ms, model: MODEL, effort: EFFORT },
  });
});
