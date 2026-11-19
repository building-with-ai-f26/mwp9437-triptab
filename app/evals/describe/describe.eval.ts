/**
 * The "describe your trip" eval (Build 3). Runs the 10 cases in ./cases through the deployed
 * describe-trip function on TripTab dev, as a throwaway account, and scores each against four
 * rules in code (src/lib/describeEval.ts). Each case pins "today", so its dates don't drift with
 * the calendar. Real calls, real cost: each is logged in ai_calls as test_run. Results are saved to
 * journal/evals/.
 *
 *   npm run eval:describe                       all 10 cases, label "run"
 *   EVAL_LABEL=baseline npm run eval:describe   name the run
 *   EVAL_ONLY=03,05 npm run eval:describe       only the cases whose id starts with 03 or 05
 *
 * It refuses to start when the run could cost more than $1, and prints the real cost at the end.
 */
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { key, signedIn, url } from "../../src/test/live";
import { RULE_LABEL, RULES, scoreCase, summarize, type CaseScore, type DescribeCase, type DescribedResult } from "../../src/lib/describeEval";
import { WORST_CASE_CALL_USD } from "../../../supabase/functions/describe-trip/rules.ts";

const MAX_RUN_USD = 1;
const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const label = (process.env.EVAL_LABEL ?? "run").replace(/[^a-z0-9-]/gi, "-");
const only = (process.env.EVAL_ONLY ?? "").split(",").map((s) => s.trim()).filter(Boolean);

const cases: DescribeCase[] = readdirSync(here("./cases"))
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => JSON.parse(readFileSync(here(`./cases/${f}`), "utf8")) as DescribeCase)
  .filter((c) => only.length === 0 || only.some((o) => c.id.startsWith(o)));

type Usage = { cost_usd: number; input_tokens: number; output_tokens: number; latency_ms: number; model: string; effort: string };

it(`Describe your trip eval: ${cases.length} cases`, async () => {
  const worst = cases.length * WORST_CASE_CALL_USD;
  if (worst > MAX_RUN_USD) throw new Error(`Refusing to start: ${cases.length} cases could cost up to $${worst.toFixed(2)}, over the $${MAX_RUN_USD} limit for one run.`);
  expect(cases.length).toBeGreaterThan(0);

  const who = await signedIn(`dscr-${label}`.slice(0, 20), "Eval");
  const token = (await who.auth.getSession()).data.session!.access_token;
  const call = async (body: unknown) => {
    const res = await fetch(`${url}/functions/v1/describe-trip`, {
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

  const rows: { c: DescribeCase; status: number; error: string | null; result: (DescribedResult & { usage: Usage }) | null; score: CaseScore }[] = [];
  let cost = 0;
  for (const c of cases) {
    const r = await call({ text: c.text, today: c.today, test_run: true });
    const result = r.status === 200 ? (r.body as unknown as DescribedResult & { usage: Usage }) : null;
    // "No trip found" (422 no_trip) is a valid answer for a case that expects none.
    const answered = r.status === 200 || r.body.code === "no_trip";
    const score = answered
      ? scoreCase(c, result)
      : { id: c.id, group: c.group, pass: { trip: false, plans: false, grounded: false, questions: false }, notes: [`The call failed: ${r.status} ${String(r.body.code ?? "")} ${String(r.body.error ?? "")}`] };
    cost += result?.usage.cost_usd ?? 0;
    rows.push({ c, status: r.status, error: answered ? null : String(r.body.error ?? r.status), result, score });
    console.log(`${RULES.every((x) => score.pass[x]) ? "PASS" : "FAIL"}  ${c.id}  ${score.notes.join(" | ")}`);
  }

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
      input_tokens: r.result?.usage.input_tokens ?? null,
      output_tokens: r.result?.usage.output_tokens ?? null,
      latency_ms: r.result?.usage.latency_ms ?? null,
      trip: r.result?.trip ?? null,
      plans: r.result?.plans ?? [],
      questions: r.result?.questions ?? [],
      note: r.result?.note ?? null,
    })),
  };
  const dir = here("../../../journal/evals/");
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}describe-${label}-${stamp}.json`, JSON.stringify(out, null, 2) + "\n");
  const tick = (b: boolean) => (b ? "pass" : "FAIL");
  const md = [
    `# Describe your trip eval: ${label}`,
    "",
    `Run ${out.ran_at} against the deployed describe-trip function on TripTab dev. Model ${out.model}, effort ${out.effort}.`,
    "",
    `**${summary.allFour} of ${summary.total} cases passed all four rules. Real cost of this run: $${out.total_cost_usd.toFixed(4)} at list price.**`,
    "",
    `| Rule | Cases passed |`,
    `| --- | --- |`,
    ...RULES.map((r) => `| ${RULE_LABEL[r]} | ${summary.byRule[r]} of ${summary.total} |`),
    "",
    `| Case | Group | ${RULES.map((r) => RULE_LABEL[r]).join(" | ")} | Cost | Seconds |`,
    `| --- | --- | ${RULES.map(() => "---").join(" | ")} | --- | --- |`,
    ...out.cases.map(
      (c) =>
        `| ${c.id} | ${c.group} | ${RULES.map((r) => tick(c.pass[r])).join(" | ")} | ${c.cost_usd == null ? "n/a" : `$${c.cost_usd.toFixed(4)}`} | ${c.latency_ms == null ? "n/a" : (c.latency_ms / 1000).toFixed(1)} |`,
    ),
    "",
    "## What failed",
    "",
    ...(out.cases.some((c) => c.notes.length) ? out.cases.filter((c) => c.notes.length).flatMap((c) => [`- **${c.id}**`, ...c.notes.map((n) => `  - ${n}`)]) : ["Nothing."]),
    "",
  ].join("\n");
  writeFileSync(`${dir}describe-${label}-${stamp}.md`, md);
  console.log(`\n${summary.allFour} of ${summary.total} cases passed all four rules.`);
  for (const r of RULES) console.log(`  ${RULE_LABEL[r]}: ${summary.byRule[r]} of ${summary.total}`);
  console.log(`Real cost of this run: $${out.total_cost_usd.toFixed(4)} at list price.`);
  console.log(`Saved: journal/evals/describe-${label}-${stamp}.json and .md`);
});
