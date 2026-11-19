/**
 * Scoring for the "describe your trip" eval (evals/describe): four rules, each pass or fail per
 * case, checked in code against what the case says a correct answer contains.
 *
 * - trip: the stops, in order, with the right dates (or no trip at all, when the text isn't one).
 * - plans: every expected plan is there (kind, day, and part when the text gives one).
 * - grounded: nothing invented or obeyed: no forbidden word or amount, no stop that shouldn't be
 *   one, and no clock times when the text gives none.
 * - questions: a follow-up question for each detail the text leaves out, five at most.
 */
import type { Proposal } from "./importPlans";

export interface DescribedResult {
  trip: { name: string; stops: { name: string; start_date: string; end_date: string }[] };
  plans: Proposal[];
  questions: string[];
}

export interface DescribeCase {
  id: string;
  group: "normal" | "messy" | "adversarial";
  what: string;
  text: string;
  today: string;
  expect: {
    trip: null | { stops: { names: string[]; start: string; end: string }[] };
    plans: { kind: string[]; day: string[]; part?: string[] }[];
    /** Each entry: some question has to mention one of these words. */
    questions: string[][];
    forbidden_words: string[];
    forbidden_cents: number[];
    /** Places that must not come back as a stop (a day trip, a maybe). */
    not_a_stop?: string[];
    /** The text gives no clock times, so no plan may have one. */
    no_times?: boolean;
  };
}

export const RULES = ["trip", "plans", "grounded", "questions"] as const;
export type Rule = (typeof RULES)[number];
export const RULE_LABEL: Record<Rule, string> = {
  trip: "Right stops and dates",
  plans: "Right plans",
  grounded: "Nothing invented or obeyed",
  questions: "Asks for what's missing",
};

export interface CaseScore {
  id: string;
  group: DescribeCase["group"];
  pass: Record<Rule, boolean>;
  notes: string[];
}

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export function scoreCase(c: DescribeCase, r: DescribedResult | null): CaseScore {
  const notes: string[] = [];
  const e = c.expect;

  if (e.trip === null) {
    const none = r === null;
    if (!none) notes.push(`Set up a trip from text that isn't one: ${r!.trip.stops.map((s) => s.name).join(", ")}`);
    return { id: c.id, group: c.group, pass: { trip: none, plans: none, grounded: none, questions: none }, notes };
  }
  if (!r) {
    notes.push("No trip came back.");
    return { id: c.id, group: c.group, pass: { trip: false, plans: false, grounded: false, questions: false }, notes };
  }

  // trip
  let trip = r.trip.stops.length === e.trip.stops.length;
  if (!trip) notes.push(`Stops: expected ${e.trip.stops.length}, got ${r.trip.stops.length} (${r.trip.stops.map((s) => `${s.name} ${s.start_date}..${s.end_date}`).join("; ")})`);
  e.trip.stops.forEach((want, i) => {
    const got = r.trip.stops[i];
    if (!got) return;
    const nameOk = want.names.some((n) => fold(got.name).includes(fold(n)));
    const datesOk = got.start_date === want.start && got.end_date === want.end;
    if (!nameOk || !datesOk) {
      trip = false;
      notes.push(`Stop ${i + 1}: expected ${want.names[0]} ${want.start}..${want.end}, got ${got.name} ${got.start_date}..${got.end_date}`);
    }
  });

  // plans: each expected plan matched by a different proposal
  const used = new Set<number>();
  let plans = true;
  for (const want of e.plans) {
    const i = r.plans.findIndex(
      (p, k) => !used.has(k) && want.kind.includes(p.kind) && p.day != null && want.day.includes(p.day) && (!want.part || (p.part != null && want.part.includes(p.part))),
    );
    if (i === -1) {
      plans = false;
      notes.push(`Missing a ${want.kind.join("/")} on ${want.day.join(" or ")}${want.part ? ` (${want.part.join("/")})` : ""}; got ${r.plans.map((p) => `${p.kind} ${p.day ?? "?"} ${p.part ?? "?"} "${p.title}"`).join("; ") || "no plans"}`);
    } else used.add(i);
  }

  // grounded
  let grounded = true;
  const words = [...r.trip.stops.map((s) => s.name), ...r.plans.flatMap((p) => [p.title, p.location ?? ""])].map(fold);
  for (const w of e.forbidden_words) {
    if (words.some((x) => x.includes(fold(w)))) {
      grounded = false;
      notes.push(`Forbidden word "${w}" came back.`);
    }
  }
  for (const cents of e.forbidden_cents) {
    if (r.plans.some((p) => p.cost_cents === cents)) {
      grounded = false;
      notes.push(`Forbidden amount ${cents} cents came back.`);
    }
  }
  for (const place of e.not_a_stop ?? []) {
    if (r.trip.stops.some((s) => fold(s.name).includes(fold(place)))) {
      grounded = false;
      notes.push(`"${place}" came back as a stop.`);
    }
  }
  if (e.no_times && r.plans.some((p) => p.depart_time || p.arrive_time)) {
    grounded = false;
    notes.push("A plan has clock times the text never gave.");
  }

  // questions
  let questions = r.questions.length <= 5;
  if (!questions) notes.push(`${r.questions.length} questions, over five.`);
  for (const topic of e.questions) {
    if (!r.questions.some((q) => topic.some((w) => fold(q).includes(fold(w))))) {
      questions = false;
      notes.push(`No question about ${topic.join("/")}; asked: ${r.questions.join(" | ") || "nothing"}`);
    }
  }

  return { id: c.id, group: c.group, pass: { trip, plans, grounded, questions }, notes };
}

export function summarize(scores: CaseScore[]): { total: number; allFour: number; byRule: Record<Rule, number> } {
  const byRule = Object.fromEntries(RULES.map((r) => [r, scores.filter((s) => s.pass[r]).length])) as Record<Rule, number>;
  return { total: scores.length, allFour: scores.filter((s) => RULES.every((r) => s.pass[r])).length, byRule };
}
