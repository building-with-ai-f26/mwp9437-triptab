/**
 * The Plan with AI eval (Build 4). Runs the 12 cases in ./cases (10, and 2 on the group's tastes since C51) through the deployed plan-with-ai
 * function, as a throwaway Owner on a throwaway trip with some plans already on it, and scores
 * each against four rubric rules in code (src/lib/planEval.ts). Real calls, real cost: each is
 * logged in ai_calls as test_run. Results are saved to journal/evals/.
 *
 *   npm run eval:plan                       all 10 cases, label "run"
 *   EVAL_LABEL=baseline npm run eval:plan   name the run
 *   EVAL_ONLY=02,07 npm run eval:plan       only the cases whose id starts with 02 or 07
 *
 * It refuses to start when the run could cost more than $1, and prints the real cost at the end.
 */
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { key, signedIn, url } from "../../src/test/live";
import { PLAN_RULE_LABEL, PLAN_RULES, scorePlanCase, summarizePlan, type PlanCaseScore, type PlanEvalCase, type PlanIdea } from "../../src/lib/planEval";
import { emptySlots, WORST_CASE_CALL_USD, type PlanRow } from "../../../supabase/functions/plan-with-ai/rules.ts";

const MAX_RUN_USD = 1;
const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const label = (process.env.EVAL_LABEL ?? "run").replace(/[^a-z0-9-]/gi, "-");
const only = (process.env.EVAL_ONLY ?? "").split(",").map((s) => s.trim()).filter(Boolean);

const cases: PlanEvalCase[] = readdirSync(here("./cases"))
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => JSON.parse(readFileSync(here(`./cases/${f}`), "utf8")) as PlanEvalCase)
  .filter((c) => only.length === 0 || only.some((o) => c.id.startsWith(o)));

// The fixture trip: Chamonix Fri 2/5 to Sun 2/7, Barcelona Mon 2/8 to Tue 2/9, with six slots taken.
const TRIP = { start_date: "2027-02-05", end_date: "2027-02-09" };
const STOPS = [
  { name: "Chamonix", start_date: "2027-02-05", end_date: "2027-02-07" },
  { name: "Barcelona", start_date: "2027-02-08", end_date: "2027-02-09" },
];
const PLANS: (PlanRow & { title: string })[] = [
  { kind: "flight", title: "UA 57 to Geneva", day: "2027-02-05", part: "morning", end_day: null, end_part: null },
  { kind: "meal", title: "Fondue at La Caleche", day: "2027-02-05", part: "evening", end_day: null, end_part: null },
  { kind: "activity", title: "Ski school", day: "2027-02-06", part: "morning", end_day: null, end_part: "day" },
  { kind: "stay", title: "Chamonix Airbnb", day: "2027-02-05", part: "night", end_day: "2027-02-08", end_part: null },
  { kind: "activity", title: "Sagrada Familia tour", day: "2027-02-08", part: "day", end_day: null, end_part: null },
  { kind: "flight", title: "Flight home", day: "2027-02-09", part: "evening", end_day: null, end_part: null },
];
const EMPTY = emptySlots(TRIP, PLANS);
const stopOn = (day: string) => STOPS.find((s) => day >= s.start_date && day <= s.end_date)?.name ?? "";

interface Reply {
  suggestions: PlanIdea[];
  note: string | null;
  dropped: number;
  usage: { cost_usd: number; searches: number; input_tokens: number; output_tokens: number; latency_ms: number; model: string; effort: string };
}

it(`Plan with AI eval: ${cases.length} cases`, async () => {
  const worst = cases.length * WORST_CASE_CALL_USD;
  if (worst > MAX_RUN_USD) throw new Error(`Refusing to start: ${cases.length} cases could cost up to $${worst.toFixed(2)}, over the $${MAX_RUN_USD} limit for one run.`);
  expect(cases.length).toBeGreaterThan(0);

  const owner = await signedIn(`plan-${label}`.slice(0, 20), "Eval");
  const token = (await owner.auth.getSession()).data.session!.access_token;
  const call = async (body: unknown) => {
    const res = await fetch(`${url}/functions/v1/plan-with-ai`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  };
  const probe = await call({ probe: true });
  if (probe.body.ai_key_set !== true) throw new Error("ANTHROPIC_API_KEY isn't set in Supabase, so nothing was run and nothing was spent.");

  const { data: tripId } = await owner.rpc("create_trip", { p_name: "Eval: Plan with AI", p_stops: STOPS, p_my_name: "Eval" });
  const { error: seedError } = await owner.from("items").insert(PLANS.map((p) => ({ trip_id: tripId, status: "planned", ...p })));
  if (seedError) throw new Error(`Couldn't set up the fixture trip: ${seedError.message}`);

  const rows: { c: PlanEvalCase; status: number; error: string | null; reply: Reply | null; score: PlanCaseScore }[] = [];
  let cost = 0;
  try {
    for (const c of cases) {
      // The group's tastes come from profiles (C51): this case's are ticked first, privately, and
      // cleared again for the next case. A database without profiles yet fails the case plainly.
      const picks = await owner.rpc("save_my_prefs", { p_cuisines: c.tastes?.cuisines ?? [], p_activities: c.tastes?.activities ?? [], p_shared: false });
      if (c.tastes && picks.error) throw new Error(`Couldn't set the tastes for ${c.id}: ${picks.error.message}`);
      const r = await call({ trip_id: tripId, request: c.request, test_run: true });
      const reply = r.status === 200 ? (r.body as unknown as Reply) : null;
      // "No ideas" (422 no_plans) is a valid answer for a case that expects none.
      const answered = r.status === 200 || r.body.code === "no_plans";
      const score = answered
        ? scorePlanCase(c, reply?.suggestions ?? [], EMPTY, stopOn)
        : { id: c.id, group: c.group, pass: { slots: false, grounded: false, request: false, obedience: false }, notes: [`The call failed: ${r.status} ${String(r.body.code ?? "")} ${String(r.body.error ?? "")}`] };
      cost += reply?.usage.cost_usd ?? 0;
      rows.push({ c, status: r.status, error: answered ? null : String(r.body.error ?? r.status), reply, score });
      console.log(`${PLAN_RULES.every((x) => score.pass[x]) ? "PASS" : "FAIL"}  ${c.id}  ${score.notes.join(" | ")}`);
    }
  } finally {
    await owner.from("trips").delete().eq("id", tripId);
  }

  const summary = summarizePlan(rows.map((r) => r.score));
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "-");
  const out = {
    label,
    ran_at: new Date().toISOString(),
    model: rows.find((r) => r.reply)?.reply?.usage.model ?? null,
    effort: rows.find((r) => r.reply)?.reply?.usage.effort ?? null,
    cases_run: rows.length,
    passed_all_four: summary.allFour,
    by_rule: summary.byRule,
    total_cost_usd: Math.round(cost * 1_000_000) / 1_000_000,
    cases: rows.map((r) => ({
      id: r.c.id,
      group: r.c.group,
      what: r.c.what,
      request: r.c.request,
      http_status: r.status,
      error: r.error,
      pass: r.score.pass,
      notes: r.score.notes,
      cost_usd: r.reply?.usage.cost_usd ?? null,
      searches: r.reply?.usage.searches ?? null,
      latency_ms: r.reply?.usage.latency_ms ?? null,
      dropped_by_code: r.reply?.dropped ?? null,
      ideas: r.reply?.suggestions ?? [],
      note: r.reply?.note ?? null,
    })),
  };
  const dir = here("../../../journal/evals/");
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}plan-${label}-${stamp}.json`, JSON.stringify(out, null, 2) + "\n");
  const tick = (b: boolean) => (b ? "pass" : "FAIL");
  const md = [
    `# Plan with AI eval: ${label}`,
    "",
    `Run ${out.ran_at} against the deployed plan-with-ai function. Model ${out.model}, effort ${out.effort}.`,
    "",
    `**${summary.allFour} of ${summary.total} cases passed all four rules. Real cost of this run: $${out.total_cost_usd.toFixed(4)} at list price.**`,
    "",
    `| Rule | Cases passed |`,
    `| --- | --- |`,
    ...PLAN_RULES.map((r) => `| ${PLAN_RULE_LABEL[r]} | ${summary.byRule[r]} of ${summary.total} |`),
    "",
    `| Case | Group | ${PLAN_RULES.map((r) => PLAN_RULE_LABEL[r]).join(" | ")} | Ideas | Dropped by code | Cost | Searches | Seconds |`,
    `| --- | --- | ${PLAN_RULES.map(() => "---").join(" | ")} | --- | --- | --- | --- | --- |`,
    ...out.cases.map(
      (c) =>
        `| ${c.id} | ${c.group} | ${PLAN_RULES.map((r) => tick(c.pass[r])).join(" | ")} | ${c.ideas.length} | ${c.dropped_by_code ?? "n/a"} | ${c.cost_usd == null ? "n/a" : `$${c.cost_usd.toFixed(4)}`} | ${c.searches ?? "n/a"} | ${c.latency_ms == null ? "n/a" : (c.latency_ms / 1000).toFixed(1)} |`,
    ),
    "",
    "## What failed",
    "",
    ...(out.cases.some((c) => c.notes.length) ? out.cases.filter((c) => c.notes.length).flatMap((c) => [`- **${c.id}**`, ...c.notes.map((n) => `  - ${n}`)]) : ["Nothing."]),
    "",
    "## The ideas",
    "",
    ...out.cases.flatMap((c) => [`- **${c.id}** (${c.request || "no request"})`, ...(c.ideas.length ? c.ideas.map((i) => `  - ${i.day} ${i.part}: ${i.title} (${i.source_url})`) : [`  - none${c.note ? `: ${c.note}` : ""}`])]),
    "",
  ].join("\n");
  writeFileSync(`${dir}plan-${label}-${stamp}.md`, md);
  console.log(`\n${summary.allFour} of ${summary.total} cases passed all four rules.`);
  for (const r of PLAN_RULES) console.log(`  ${PLAN_RULE_LABEL[r]}: ${summary.byRule[r]} of ${summary.total}`);
  console.log(`Real cost of this run: $${out.total_cost_usd.toFixed(4)} at list price.`);
  console.log(`Saved: journal/evals/plan-${label}-${stamp}.json and .md`);
});
