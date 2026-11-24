/**
 * The Ask AI eval (T10). Runs the 10 made-up cases in ./cases through the deployed ask-ai function,
 * as a throwaway Owner on a throwaway trip (Plan with AI's fixture: Chamonix, then Barcelona, with
 * plans already on it), and scores each against five rules in code (src/lib/askEval.ts). Three are
 * refinements ("cheaper", "another cuisine", "higher end") sent with the options already shown.
 * Real calls, real cost: each is logged in ai_calls as a test run. Results go to journal/evals/.
 *
 *   npm run eval:ask                       all cases, label "run"
 *   EVAL_LABEL=baseline npm run eval:ask   name the run
 *   EVAL_ONLY=06,07 npm run eval:ask       only some cases
 *
 * It refuses to start when the run could cost more than $1, and prints the real cost at the end.
 */
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { key, signedIn, url } from "../../src/test/live";
import { ASK_RULE_LABEL, ASK_RULES, scoreAskCase, type AskCaseScore, type AskEvalCase, type AskOption } from "../../src/lib/askEval";
import { WORST_CASE_CALL_USD } from "../../../supabase/functions/ask-ai/rules.ts";

const MAX_RUN_USD = 1;
const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const label = (process.env.EVAL_LABEL ?? "run").replace(/[^a-z0-9-]/gi, "-");
const only = (process.env.EVAL_ONLY ?? "").split(",").map((s) => s.trim()).filter(Boolean);

const cases: AskEvalCase[] = readdirSync(here("./cases"))
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => JSON.parse(readFileSync(here(`./cases/${f}`), "utf8")) as AskEvalCase)
  .filter((c) => only.length === 0 || only.some((o) => c.id.startsWith(o)));

const STOPS = [
  { name: "Chamonix", start_date: "2027-02-05", end_date: "2027-02-07" },
  { name: "Barcelona", start_date: "2027-02-08", end_date: "2027-02-09" },
];
const PLANS = [
  { kind: "meal", title: "Fondue at La Caleche", day: "2027-02-05", part: "evening" },
  { kind: "activity", title: "Ski school", day: "2027-02-06", part: "morning", end_part: "day" },
  { kind: "activity", title: "Sagrada Familia tour", day: "2027-02-08", part: "day" },
];

interface Reply {
  options: AskOption[];
  note: string | null;
  dropped: number;
  usage: { cost_usd: number; searches: number; input_tokens: number; output_tokens: number; latency_ms: number };
}

it(`Ask AI eval: ${cases.length} cases`, async () => {
  const worst = cases.length * WORST_CASE_CALL_USD;
  if (worst > MAX_RUN_USD) throw new Error(`Refusing to start: ${cases.length} cases could cost up to $${worst.toFixed(2)}, over the $${MAX_RUN_USD} limit.`);
  expect(cases.length).toBeGreaterThan(0);

  const owner = await signedIn(`ask-${label}`.slice(0, 20), "Eval");
  const token = (await owner.auth.getSession()).data.session!.access_token;
  const call = async (body: unknown) => {
    const res = await fetch(`${url}/functions/v1/ask-ai`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  };
  const probe = await call({ probe: true });
  if (probe.body.ai_key_set !== true) throw new Error("ANTHROPIC_API_KEY isn't set in Supabase, so nothing was run and nothing was spent.");

  const { data: tripId } = await owner.rpc("create_trip", { p_name: "Eval: Ask AI", p_stops: STOPS, p_my_name: "Eval" });
  const { error: seedError } = await owner.from("items").insert(PLANS.map((p) => ({ trip_id: tripId, status: "planned", ...p })));
  if (seedError) throw new Error(`Couldn't set up the fixture trip: ${seedError.message}`);

  const rows: { c: AskEvalCase; score: AskCaseScore; reply: Reply | null; status: number }[] = [];
  let cost = 0;
  try {
    for (const c of cases) {
      const r = await call({ trip_id: tripId, request: c.request, refinements: c.refinements ?? [], shown: c.shown ?? [], count: c.count, use_tastes: true, test_run: true });
      const reply = r.status === 200 ? (r.body as unknown as Reply) : null;
      cost += reply?.usage.cost_usd ?? 0;
      const score = reply ? scoreAskCase(c, reply.options, PLANS.map((p) => p.title)) : { id: c.id, pass: Object.fromEntries(ASK_RULES.map((k) => [k, false])) as AskCaseScore["pass"], notes: [`HTTP ${r.status}: ${String(r.body.error ?? "")}`] };
      rows.push({ c, score, reply, status: r.status });
    }
  } finally {
    await owner.from("trips").delete().eq("id", tripId);
  }

  const passed = rows.filter((r) => ASK_RULES.every((k) => r.score.pass[k])).length;
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 13);
  const name = `ask-${label}-${stamp}`;
  const out = here("../../../journal/evals");
  mkdirSync(out, { recursive: true });
  const md = [
    `# Ask AI eval: ${label}`,
    "",
    `Run ${new Date().toISOString()} against the deployed ask-ai function on TripTab dev.`,
    "",
    `**${passed} of ${rows.length} cases passed all five rules. Cost of this run: $${cost.toFixed(4)} at list price, about $${(cost / Math.max(1, rows.length)).toFixed(4)} a turn.**`,
    "",
    "| Rule | Cases passed |",
    "| --- | --- |",
    ...ASK_RULES.map((k) => `| ${ASK_RULE_LABEL[k]} | ${rows.filter((r) => r.score.pass[k]).length} of ${rows.length} |`),
    "",
    "| Case | Group | Options | Prices | Reservations | Cost | Searches | Seconds | Result |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows.map(({ c, score, reply }) =>
      `| ${c.id} | ${c.group} | ${reply?.options.map((o) => o.title).join("; ") ?? "none"} | ${reply?.options.map((o) => o.price_level ?? "?").join(" ") ?? ""} | ${reply?.options.map((o) => (o.needs_reservation ? "yes" : "no")).join(" ") ?? ""} | $${(reply?.usage.cost_usd ?? 0).toFixed(4)} | ${reply?.usage.searches ?? 0} | ${((reply?.usage.latency_ms ?? 0) / 1000).toFixed(1)} | ${ASK_RULES.every((k) => score.pass[k]) ? "pass" : "fail"} |`,
    ),
    "",
    "## What failed",
    "",
    ...(rows.some((r) => r.score.notes.length) ? rows.flatMap((r) => r.score.notes.map((n) => `- ${r.c.id}: ${n}`)) : ["Nothing."]),
    "",
  ].join("\n");
  writeFileSync(`${out}/${name}.md`, md);
  writeFileSync(`${out}/${name}.json`, JSON.stringify(rows.map((r) => ({ id: r.c.id, status: r.status, pass: r.score.pass, notes: r.score.notes, options: r.reply?.options ?? [], usage: r.reply?.usage ?? null })), null, 2));
  console.log(md);
  expect(rows.length).toBe(cases.length);
}, 900_000);
