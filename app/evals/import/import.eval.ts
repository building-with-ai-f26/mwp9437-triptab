/**
 * The AI import eval (Build 4, Track A). Runs the 10 cases in ./cases through the deployed
 * import-bookings function, as a throwaway Owner on a throwaway trip, and scores each against
 * four rubric rules in code (src/lib/importEval.ts). Real calls, real cost: each is logged in
 * ai_calls as test_run. Results are saved to journal/evals/.
 *
 *   npm run eval:import                       all 10 cases, label "run"
 *   EVAL_LABEL=baseline npm run eval:import   name the run
 *   EVAL_ONLY=06,07 npm run eval:import       only the cases whose id starts with 06 or 07
 *   EVAL_EFFORT=medium npm run eval:import    medium effort instead of the default, to compare
 *
 * It refuses to start when the run could cost more than $1, and prints the real cost at the end.
 */
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { key, signedIn, url } from "../../src/test/live";
import { RULE_LABEL, RULES, scoreCase, summarize, type CaseScore, type EvalCase } from "../../src/lib/importEval";
import type { ImportResult } from "../../src/lib/importPlans";
import { WORST_CASE_CALL_USD } from "../../../supabase/functions/import-bookings/rules.ts";

const MAX_RUN_USD = 1;
const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const label = (process.env.EVAL_LABEL ?? "run").replace(/[^a-z0-9-]/gi, "-");
// EVAL_EFFORT=medium runs the cases at medium effort instead of the default (low), for comparison.
const effort = process.env.EVAL_EFFORT === "medium" ? "medium" : undefined;
const only = (process.env.EVAL_ONLY ?? "").split(",").map((s) => s.trim()).filter(Boolean);

const cases: EvalCase[] = readdirSync(here("./cases"))
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => JSON.parse(readFileSync(here(`./cases/${f}`), "utf8")) as EvalCase)
  .filter((c) => only.length === 0 || only.some((o) => c.id.startsWith(o)));

it(`AI import eval: ${cases.length} cases`, async () => {
  const worst = cases.length * WORST_CASE_CALL_USD;
  if (worst > MAX_RUN_USD) throw new Error(`Refusing to start: ${cases.length} cases could cost up to $${worst.toFixed(2)}, over the $${MAX_RUN_USD} limit for one run.`);
  expect(cases.length).toBeGreaterThan(0);

  const owner = await signedIn(`eval-${label}`.slice(0, 20), "Eval");
  const token = (await owner.auth.getSession()).data.session!.access_token;
  const call = async (body: unknown) => {
    const res = await fetch(`${url}/functions/v1/import-bookings`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  };

  const probe = await call({ probe: true });
  if (probe.body.ai_key_set !== true) {
    throw new Error("ANTHROPIC_API_KEY isn't set in Supabase (Edge Functions, Secrets), so nothing was run and nothing was spent.");
  }

  const { data: tripId } = await owner.rpc("create_trip", {
    p_name: "Eval: AI import",
    p_stops: [
      { name: "Chamonix", start_date: "2027-02-04", end_date: "2027-02-12" },
      { name: "Barcelona", start_date: "2027-02-12", end_date: "2027-02-13" },
      { name: "Andorra", start_date: "2027-02-13", end_date: "2027-02-16" },
    ],
    p_my_name: "Eval",
  });

  const rows: { c: EvalCase; status: number; error: string | null; result: ImportResult | null; score: CaseScore }[] = [];
  let cost = 0;
  try {
    for (const c of cases) {
      const file = c.file ? { media_type: c.media_type, data: readFileSync(here(`./cases/${c.file}`)).toString("base64") } : null;
      const r = await call({ trip_id: tripId, text: c.text ?? "", file, test_run: true, effort });
      const result = r.status === 200 ? (r.body as unknown as ImportResult) : null;
      // "No plans found" (422 no_plans) is a valid answer for a case that expects none.
      const plans = result?.plans ?? [];
      const answered = r.status === 200 || r.body.code === "no_plans";
      const score = answered
        ? scoreCase(c, plans)
        : { id: c.id, group: c.group, pass: { shape: false, grounded: false, money: false, obedience: false }, notes: [`The call failed: ${r.status} ${String(r.body.code ?? "")} ${String(r.body.error ?? "")}`] };
      cost += result?.usage.cost_usd ?? 0;
      rows.push({ c, status: r.status, error: answered ? null : String(r.body.error ?? r.status), result, score });
      console.log(`${RULES.every((x) => score.pass[x]) ? "PASS" : "FAIL"}  ${c.id}  ${score.notes.join(" | ")}`);
    }
  } finally {
    await owner.from("trips").delete().eq("id", tripId);
  }

  // The real cost, from the cost log rather than only from the replies (a failed call can still cost).
  const summary = summarize(rows.map((r) => r.score));
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "-");
  const out = {
    label,
    ran_at: new Date().toISOString(),
    model: rows.find((r) => r.result)?.result?.usage.model ?? null,
    effort: rows.find((r) => r.result)?.result?.usage.effort ?? null,
    cases_run: rows.length,
    passed_all_four: summary.allFour,
    by_rule: summary.byRule,
    total_cost_usd: Math.round(cost * 1_000_000) / 1_000_000,
    cases: rows.map((r) => ({
      id: r.c.id,
      group: r.c.group,
      what: r.c.what,
      http_status: r.status,
      error: r.error,
      pass: r.score.pass,
      notes: r.score.notes,
      cost_usd: r.result?.usage.cost_usd ?? null,
      searches: r.result?.usage.searches ?? null,
      input_tokens: r.result?.usage.input_tokens ?? null,
      output_tokens: r.result?.usage.output_tokens ?? null,
      latency_ms: r.result?.usage.latency_ms ?? null,
      plans: r.result?.plans ?? [],
      note: r.result?.note ?? null,
    })),
  };
  const dir = here("../../../journal/evals/");
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}import-${label}-${stamp}.json`, JSON.stringify(out, null, 2) + "\n");
  const tick = (b: boolean) => (b ? "pass" : "FAIL");
  const md = [
    `# AI import eval: ${label}`,
    "",
    `Run ${out.ran_at} against the deployed import-bookings function. Model ${out.model}, effort ${out.effort}.`,
    "",
    `**${summary.allFour} of ${summary.total} cases passed all four rules. Real cost of this run: $${out.total_cost_usd.toFixed(4)} at list price.**`,
    "",
    `| Rule | Cases passed |`,
    `| --- | --- |`,
    ...RULES.map((r) => `| ${RULE_LABEL[r]} | ${summary.byRule[r]} of ${summary.total} |`),
    "",
    `| Case | Group | ${RULES.map((r) => RULE_LABEL[r]).join(" | ")} | Cost | Searches | Seconds |`,
    `| --- | --- | ${RULES.map(() => "---").join(" | ")} | --- | --- | --- |`,
    ...out.cases.map(
      (c) =>
        `| ${c.id} | ${c.group} | ${RULES.map((r) => tick(c.pass[r])).join(" | ")} | ${c.cost_usd == null ? "n/a" : `$${c.cost_usd.toFixed(4)}`} | ${c.searches ?? "n/a"} | ${c.latency_ms == null ? "n/a" : (c.latency_ms / 1000).toFixed(1)} |`,
    ),
    "",
    "## What failed",
    "",
    ...(out.cases.some((c) => c.notes.length) ? out.cases.filter((c) => c.notes.length).flatMap((c) => [`- **${c.id}**`, ...c.notes.map((n) => `  - ${n}`)]) : ["Nothing."]),
    "",
  ].join("\n");
  writeFileSync(`${dir}import-${label}-${stamp}.md`, md);
  console.log(`\n${summary.allFour} of ${summary.total} cases passed all four rules.`);
  for (const r of RULES) console.log(`  ${RULE_LABEL[r]}: ${summary.byRule[r]} of ${summary.total}`);
  console.log(`Real cost of this run: $${out.total_cost_usd.toFixed(4)} at list price.`);
  console.log(`Saved: journal/evals/import-${label}-${stamp}.json and .md`);
});
