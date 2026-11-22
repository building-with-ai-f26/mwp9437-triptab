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
// From someone who isn't on the trip (C36, Mike's call 11/21): not bounced and not read. It's held on
// the trip, its address shown, until an Owner taps Read it (read_held, below) or That's me (that
// address counts as theirs from then on), at most MAX_HELD_PER_TRIP_DAY a trip a day. Only what
// import would read is kept meanwhile (inbox_held, service role only), for HELD_DAYS at most.
//
// On TripTab dev only, a signed-in Owner of the trip may post a made-up email instead of the Worker
// (test_run), so the click-throughs and tests can run without a real mailbox; production never
// takes that path. With check_sender, that test also runs the real sender check (who it's from,
// including Also forward from addresses, C31); only the Worker's secret and DMARC are skipped. Anyone signed in may ask whether email-in is ready ({ probe: true }): on
// production, that's once Mike has set INBOX_SECRET (checked by name, never read out).
import Anthropic from "npm:@anthropic-ai/sdk@^1.9.0";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import PostalMime from "npm:postal-mime@2.4.4";
import {
  capDecision, checkProposals, costUsd, EFFORT, MAX_SEARCHES, MAX_TOKENS, MODEL, nyDayStart, PROPOSE_TOOL, readCap,
  SYSTEM_PROMPT, TIMEOUT_MS, type Usage,
} from "../import-bookings/rules.ts";
import {
  accountEmails, dmarcPassed, HELD_DAYS, importInput, inboxToken, isOnTrip, maskedAddress, MAX_EMAIL_BYTES, MAX_EMAILS_PER_TRIP_DAY,
  MAX_HELD_PER_TRIP_DAY, sameSecret, senderAddress, type ImportInput,
} from "./rules.ts";

const DEV_PROJECT = "iivseqkvixmvcpldarqy";
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
  let checkSender = false;
  let testUser: string | null = null;
  let raw: ArrayBuffer;
  let envelopeTo = req.headers.get("x-envelope-to");
  if (fromWorker) {
    raw = await req.arrayBuffer();
  } else {
    const auth = req.headers.get("Authorization") ?? "";
    const { data: who } = await admin.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
    if (!who?.user) return done(401, "not_allowed");
    let body: { to?: unknown; raw?: unknown; probe?: unknown; check_sender?: unknown; action?: unknown; item_id?: unknown; mine?: unknown };
    try {
      body = await req.json();
    } catch {
      return done(400, "bad_request");
    }
    // Ready: the Worker can hand mail on (production), or the test path is open (dev).
    if (body.probe === true) return json({ ready: secret.length > 0 || dev });
    // An Owner reads a held email (C36), on production too.
    if (body.action === "read_held") return await readHeld(admin, who.user, body.item_id, body.mine === true, dev);
    if (!dev) return done(401, "not_allowed");
    if (typeof body.raw !== "string") return done(400, "bad_request");
    raw = new TextEncoder().encode(body.raw).buffer as ArrayBuffer;
    envelopeTo = String(body.to ?? "");
    testRun = true;
    checkSender = body.check_sender === true;
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
  // Also forward from (C31): each account's confirmed extra addresses count as its own.
  const userIds = accounts.map((a) => a.user_id);
  const { data: extra } = userIds.length
    ? await admin.from("forward_addresses").select("user_id, email").in("user_id", userIds).not("confirmed_at", "is", null)
    : { data: [] as { user_id: string; email: string }[] };
  for (const a of accounts) a.emails.push(...(extra ?? []).filter((x) => x.user_id === a.user_id).map((x) => String(x.email)));
  const match =
    accounts.find((a) => isOnTrip(sender, a.emails)) ??
    (people ?? []).map((p) => ({ id: p.id as string, user_id: (p.user_id as string | null) ?? null, email: p.email as string | null })).find((p) => isOnTrip(sender, [p.email]));
  if (testRun && !checkSender) {
    // A dev test stands in for a sender: it has to be an Owner of this trip.
    const me = (people ?? []).find((p) => p.user_id === testUser);
    if (me?.role !== "owner") return done(403, "not_owner");
  }
  const standIn = testRun && !checkSender;
  // Nobody on the trip has this address: held for an Owner, not read (C36).
  const held = !standIn && !match;
  const fromTraveler = standIn ? ((people ?? []).find((p) => p.user_id === testUser)?.id as string) : (match?.id ?? null);
  // Its AI call counts toward the sender's own daily imports, or the trip's creator's when they have no account.
  const { data: trip } = await admin.from("trips").select("created_by").eq("id", tripId).single();
  const billedTo = standIn ? testUser! : (match?.user_id ?? (trip?.created_by as string));

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
    admin.from("inbox_items").insert({ trip_id: tripId, from_traveler: fromTraveler, from_address: held ? sender : null, subject, ...row });

  if (held) {
    // With no address to show the Owner, there's nothing to hold it under.
    if (!sender) return refuse("not_on_trip", null);
    // Held emails past their days go first, so nothing waits longer than HELD_DAYS.
    await clearOldHeld(admin);
    const { count: heldToday } = await admin
      .from("inbox_items").select("id", { count: "exact", head: true }).eq("trip_id", tripId).not("from_address", "is", null).gte("received_at", nyDayStart());
    if ((heldToday ?? 0) >= MAX_HELD_PER_TRIP_DAY) {
      console.log(`inbox refused: held_capped, from ${maskedAddress(sender)}`);
      return json({ code: "held_capped", from: sender }, 429);
    }
    if (!input) {
      await keep({ status: "failed", note: "That email had nothing to read." });
      return done(200, "empty");
    }
    const { data: item, error } = await keep({ status: "held" }).select("id").single();
    if (error || !item) return done(500, "error");
    const { error: heldError } = await admin.from("inbox_held").insert({ item_id: item.id, input });
    if (heldError) {
      await admin.from("inbox_items").update({ status: "failed", note: "That email couldn't be kept to read." }).eq("id", item.id);
      return done(500, "error");
    }
    console.log(`inbox held: from ${maskedAddress(sender)}`);
    return done(200, "held");
  }

  if (!input) {
    await keep({ status: "failed", note: "That email had nothing to read." });
    return done(200, "empty");
  }
  const read = await readEmail(admin, { tripId, input, billedTo, testRun, keep });
  return done(read.status, read.code);
});

/** Held emails past HELD_DAYS: what was kept to read goes, and the email says so on the trip. */
async function clearOldHeld(admin: SupabaseClient) {
  const before = new Date(Date.now() - HELD_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: old } = await admin.from("inbox_held").delete().lt("created_at", before).select("item_id");
  if (old?.length) {
    await admin
      .from("inbox_items").update({ status: "failed", note: `Not read within ${HELD_DAYS} days, so it was cleared.` })
      .in("id", old.map((o) => o.item_id)).eq("status", "held");
  }
}

/**
 * An Owner of the trip taps Read it (or That's me, mine) on a held email (C36). The held copy is
 * taken first, so two taps can't read it twice; That's me adds the address to the tapper's account
 * as confirmed (it came through Cloudflare's DMARC check, and it only lets that address's forwards
 * into trips they're on); then the AI reads it, billed to the tapper, as any forward is.
 */
async function readHeld(
  admin: SupabaseClient,
  user: { id: string; email?: string | null; identities?: { identity_data?: { email?: unknown } | null }[] | null },
  itemId: unknown,
  mine: boolean,
  dev: boolean,
): Promise<Response> {
  const id = String(itemId ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id)) return done(400, "bad_request");
  const { data: item } = await admin.from("inbox_items").select("id, trip_id, status, from_address").eq("id", id).maybeSingle();
  if (!item) return done(404, "not_found");
  const { data: me } = await admin.from("travelers").select("id, role").eq("trip_id", item.trip_id).eq("user_id", user.id).maybeSingle();
  if (me?.role !== "owner") return done(403, "not_owner");
  if (item.status !== "held") return done(409, "not_held");
  const { data: taken } = await admin.from("inbox_held").delete().eq("item_id", id).select("input");
  if (!taken?.length) return done(409, "not_held");
  const input = taken[0].input as ImportInput;
  const address = String(item.from_address ?? "");
  if (mine && address && !accountEmails(user).includes(address)) {
    await admin
      .from("forward_addresses")
      .upsert({ user_id: user.id, email: address, confirmed_at: new Date().toISOString(), code_hash: null, tries: 0 }, { onConflict: "user_id,email" });
  }
  const read = await readEmail(admin, {
    tripId: item.trip_id as string,
    input,
    billedTo: user.id,
    testRun: dev,
    keep: (row) => admin.from("inbox_items").update({ ...row, ...(mine ? { from_traveler: me.id } : {}) }).eq("id", id),
  });
  return done(read.status, read.code);
}


/**
 * Reads one email with AI import and keeps what it found: the same model, prompt, tool, checks,
 * caps and cost log for a forward from someone on the trip and for an Owner's Read it on a held one
 * (C36). `keep` writes the result onto the email's inbox item.
 */
async function readEmail(
  admin: SupabaseClient,
  o: { tripId: string; input: ImportInput; billedTo: string; testRun: boolean; keep: (row: Record<string, unknown>) => PromiseLike<unknown> },
): Promise<{ status: number; code: string }> {
  const { tripId, input, billedTo, testRun, keep } = o;
  const { data: trip } = await admin.from("trips").select("name, start_date, end_date").eq("id", tripId).single();
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
  if (!apiKey) {
    await keep({ status: "failed", note: "AI import isn't set up yet." });
    return { status: 200, code: "not_set_up" };
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

  // Added up in the database (security audit, 11/22): fetched as rows, the API hands back 1,000 at
  // most, so a day with more rows than that stopped counting. ai_spend_today also holds the list of
  // results that count as a call that reached the Claude API.
  const { data: today, error: capError } = await admin.rpc("ai_spend_today", { p_since: nyDayStart(), p_user: billedTo }).single<{ spent: number; mine: number }>();
  if (capError || !today) return { status: 500, code: "error" };
  const spent = Number(today.spent);
  const mine = Number(today.mine);
  const blocked = capDecision(cap, spent, mine);
  if (blocked) {
    await log(blocked.code, null, null, null);
    await keep({ status: "failed", note: blocked.message });
    return { status: 200, code: blocked.code };
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
    return { status: 200, code: "error" };
  }

  const ms = Date.now() - started;
  if (refused) {
    await log("refused", usage, ms, null);
    await keep({ status: "failed", note: "The AI declined to read that email." });
    return { status: 200, code: "refused" };
  }
  const checked = proposed === undefined ? null : checkProposals(proposed, searchUrls, input.file ? "" : input.text);
  const { data: call } = await log(checked?.plans.length ? "ok" : proposed === undefined ? "no_plans" : checked ? "no_plans" : "invalid_output", usage, ms, checked?.plans.length ?? 0);
  if (!checked || checked.plans.length === 0) {
    await keep({ status: "failed", note: "No plans found in that email.", call_id: call?.id ?? null });
    return { status: 200, code: "no_plans" };
  }
  await keep({ status: "new", plans: checked.plans, note: checked.note?.slice(0, 500) ?? null, call_id: call?.id ?? null });
  return { status: 200, code: "ok" };
}
