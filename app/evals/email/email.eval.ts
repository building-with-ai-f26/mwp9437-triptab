/**
 * The email-in eval (Mike's call, 11/20). The same 10 made-up cases as the AI import eval, each
 * forwarded as an email to a throwaway trip's own address through inbox-email's dev-only test path,
 * the way Cloudflare's email handler hands mail on: half as HTML mail (with a style block, the way
 * mail programs send it), half as plain text, and the scanned receipt as a PDF attached to an email
 * that says only "see attached". What import proposes is read back from the trip's inbox and scored
 * with the same four rules (src/lib/importEval.ts). Real calls, real cost, logged in ai_calls as
 * test runs (feature import_email). Results are saved to journal/evals/.
 *
 *   npm run eval:email                      all 10 cases, label "run"
 *   EVAL_LABEL=first npm run eval:email     name the run
 *   EVAL_ONLY=06,07 npm run eval:email      only the cases whose id starts with 06 or 07
 *
 * It refuses to start when the run could cost more than $1. The function's reply carries no cost,
 * so the run's cost is read from ai_calls afterwards (journal/evals/README.md says how).
 */
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { key, signedIn, url } from "../../src/test/live";
import { RULE_LABEL, RULES, scoreCase, summarize, type CaseScore, type EvalCase } from "../../src/lib/importEval";
import type { Proposal } from "../../src/lib/importPlans";
import { WORST_CASE_CALL_USD } from "../../../supabase/functions/import-bookings/rules.ts";

const MAX_RUN_USD = 1;
const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const label = (process.env.EVAL_LABEL ?? "run").replace(/[^a-z0-9-]/gi, "-");
const only = (process.env.EVAL_ONLY ?? "").split(",").map((s) => s.trim()).filter(Boolean);

const cases: EvalCase[] = readdirSync(here("../import/cases"))
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => JSON.parse(readFileSync(here(`../import/cases/${f}`), "utf8")) as EvalCase)
  .filter((c) => only.length === 0 || only.some((o) => c.id.startsWith(o)));

const escape = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const b64lines = (buf: Buffer) => buf.toString("base64").replace(/.{76}/g, "$&\r\n");

/** A case as a forwarded email: HTML for odd-numbered cases, plain text for even, the file attached. */
function asEmail(c: EvalCase, to: string): { raw: string; form: string } {
  const head = ["From: Eval <eval@example.com>", `To: ${to}`, "Subject: Fwd: booking", "MIME-Version: 1.0"];
  if (c.file) {
    const boundary = "triptab-eval-boundary";
    const raw = [
      ...head,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      "Content-Type: text/plain; charset=utf-8",
      "",
      "See attached.",
      `--${boundary}`,
      `Content-Type: ${c.media_type}; name="${c.file.split("/").pop()}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${c.file.split("/").pop()}"`,
      "",
      b64lines(readFileSync(here(`../import/cases/${c.file}`))),
      `--${boundary}--`,
      "",
    ].join("\r\n");
    return { raw, form: "text and an attached file" };
  }
  const text = c.text ?? "";
  if (Number.parseInt(c.id, 10) % 2 === 1) {
    const html = [
      "<html><head><style>p { margin: 0 } .footer { color: #999 }</style></head><body>",
      "<div>---------- Forwarded message ---------</div>",
      ...text.split("\n").map((line) => `<p>${escape(line) || "&nbsp;"}</p>`),
      '<p class="footer">Sent from my phone</p>',
      "</body></html>",
    ].join("\n");
    return { raw: [...head, "Content-Type: text/html; charset=utf-8", "", html].join("\r\n"), form: "HTML" };
  }
  return { raw: [...head, "Content-Type: text/plain; charset=utf-8", "", text].join("\r\n"), form: "plain text" };
}

it(`Email-in eval: ${cases.length} cases`, async () => {
  const worst = cases.length * WORST_CASE_CALL_USD;
  if (worst > MAX_RUN_USD) throw new Error(`Refusing to start: ${cases.length} cases could cost up to $${worst.toFixed(2)}, over the $${MAX_RUN_USD} limit for one run.`);
  expect(cases.length).toBeGreaterThan(0);

  const owner = await signedIn(`email-${label}`.slice(0, 20), "Eval");
  const token = (await owner.auth.getSession()).data.session!.access_token;
  const { data: tripId } = await owner.rpc("create_trip", {
    p_name: "Eval: email-in",
    p_stops: [
      { name: "Chamonix", start_date: "2027-02-04", end_date: "2027-02-12" },
      { name: "Barcelona", start_date: "2027-02-12", end_date: "2027-02-13" },
      { name: "Andorra", start_date: "2027-02-13", end_date: "2027-02-16" },
    ],
    p_my_name: "Eval",
  });
  const { data: code } = await owner.rpc("inbox_address", { p_trip: tripId });
  const to = `trip+${code}@triptab.org`;
  const startedAt = new Date().toISOString();

  const rows: { c: EvalCase; form: string; status: number; code: string; inbox: string | null; note: string | null; plans: Proposal[]; score: CaseScore; seconds: number }[] = [];
  try {
    for (const c of cases) {
      const { raw, form } = asEmail(c, to);
      const t0 = Date.now();
      const res = await fetch(`${url}/functions/v1/inbox-email`, {
        method: "POST",
        headers: { apikey: key, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ to, raw }),
      });
      const body = (await res.json().catch(() => ({}))) as { code?: string };
      const seconds = (Date.now() - t0) / 1000;
      const { data: latest } = await owner
        .from("inbox_items").select("status, plans, note").eq("trip_id", tripId).order("received_at", { ascending: false }).limit(1).maybeSingle();
      const plans = (latest?.plans as Proposal[] | undefined) ?? [];
      // "No plans found" is a valid answer for a case that expects none, as in the import eval.
      const answered = res.status === 200 && (body.code === "ok" || body.code === "no_plans");
      const score = answered
        ? scoreCase(c, plans)
        : { id: c.id, group: c.group, pass: { shape: false, grounded: false, money: false, obedience: false }, notes: [`The email wasn't read: ${res.status} ${body.code ?? ""} ${latest?.note ?? ""}`] };
      rows.push({ c, form, status: res.status, code: body.code ?? "", inbox: (latest?.status as string) ?? null, note: (latest?.note as string) ?? null, plans, score, seconds });
      console.log(`${RULES.every((x) => score.pass[x]) ? "PASS" : "FAIL"}  ${c.id} (${form})  ${score.notes.join(" | ")}`);
    }
  } finally {
    await owner.from("trips").delete().eq("id", tripId);
  }

  const summary = summarize(rows.map((r) => r.score));
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "-");
  const out = {
    label,
    ran_at: startedAt,
    cases_run: rows.length,
    passed_all_four: summary.allFour,
    by_rule: summary.byRule,
    cost: "Read from ai_calls (feature import_email, test_run, since ran_at): see journal/evals/README.md",
    cases: rows.map((r) => ({
      id: r.c.id,
      group: r.c.group,
      what: r.c.what,
      sent_as: r.form,
      http_status: r.status,
      code: r.code,
      inbox_status: r.inbox,
      pass: r.score.pass,
      notes: r.score.notes,
      seconds: r.seconds,
      plans: r.plans,
      note: r.note,
    })),
  };
  const dir = here("../../../journal/evals/");
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}email-${label}-${stamp}.json`, JSON.stringify(out, null, 2) + "\n");
  const tick = (b: boolean) => (b ? "pass" : "FAIL");
  const md = [
    `# Email-in eval: ${label}`,
    "",
    `Run ${out.ran_at} against the deployed inbox-email function on TripTab dev (its test path), with the import eval's 10 cases sent as forwarded emails.`,
    "",
    `**${summary.allFour} of ${summary.total} cases passed all four rules.** Cost: from ai_calls (see the README).`,
    "",
    `| Rule | Cases passed |`,
    `| --- | --- |`,
    ...RULES.map((r) => `| ${RULE_LABEL[r]} | ${summary.byRule[r]} of ${summary.total} |`),
    "",
    `| Case | Sent as | ${RULES.map((r) => RULE_LABEL[r]).join(" | ")} | Seconds |`,
    `| --- | --- | ${RULES.map(() => "---").join(" | ")} | --- |`,
    ...out.cases.map((c) => `| ${c.id} | ${c.sent_as} | ${RULES.map((r) => tick(c.pass[r])).join(" | ")} | ${c.seconds.toFixed(1)} |`),
    "",
    "## What failed",
    "",
    ...(out.cases.some((c) => c.notes.length) ? out.cases.filter((c) => c.notes.length).flatMap((c) => [`- **${c.id}**`, ...c.notes.map((n) => `  - ${n}`)]) : ["Nothing."]),
    "",
  ].join("\n");
  writeFileSync(`${dir}email-${label}-${stamp}.md`, md);
  console.log(`\n${summary.allFour} of ${summary.total} cases passed all four rules.`);
  for (const r of RULES) console.log(`  ${RULE_LABEL[r]}: ${summary.byRule[r]} of ${summary.total}`);
  console.log(`Saved: journal/evals/email-${label}-${stamp}.json and .md`);
});
